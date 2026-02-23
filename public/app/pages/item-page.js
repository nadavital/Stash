import { showToast } from "../components/toast/toast.js";
import {
  renderMoveModalHTML,
  queryMoveModalEls,
  openMoveModal,
  closeMoveModal,
  initMoveModalHandlers,
} from "../components/move-modal/move-modal.js";
import {
  renderActivityModalHTML,
  queryActivityModalEls,
  openActivityModal,
  closeActivityModal,
  initActivityModalHandlers,
} from "../components/activity-modal/activity-modal.js";
import {
  buildNoteTitle,
  normalizeCitation,
  conciseTechnicalError,
} from "../services/mappers.js";
import { buildItemActivityEntries, renderItemDetail } from "../services/render-item-detail.js";
import { renderIcon } from "../services/icons.js";
import {
  applyWorkspaceActionToLiveActivity,
  createLiveAgentActivityState,
  pushLiveAgentActivityEntry,
} from "../services/live-agent-activity.js";

const CHEVRON_SVG = renderIcon("chevron-right", { size: 16, className: "folder-breadcrumb-chevron" });
const actionIcon = (name) => renderIcon(name, {
  size: 14,
  className: "item-action-icon",
  strokeWidth: 1.9,
});
const EDIT_ICON = actionIcon("edit");
const SAVE_ICON = actionIcon("check");
const CANCEL_ICON = actionIcon("close");
const MOVE_ICON = actionIcon("move");
const ACTIVITY_ICON = actionIcon("activity");
const RETRY_ICON = actionIcon("refresh");
const OPEN_LINK_ICON = actionIcon("external-link");
const DELETE_ICON = actionIcon("trash");

function isFileSource(note = null) {
  return String(note?.sourceType || "").trim().toLowerCase() === "file";
}

function actionNoteId(action = null) {
  if (!action || typeof action !== "object") return "";
  return String(action?.noteId || action?.result?.noteId || "").trim();
}

function actionPhase(action = null) {
  if (!action || typeof action !== "object") return "";
  return String(action?.phase || "").trim().toLowerCase();
}

function isRevisionConflictStatus(status) {
  const code = Number(status);
  return code === 409 || code === 412;
}

function buildAgentUndoSnapshot(note = null) {
  if (!note) return null;
  const title = String(note?.metadata?.title || note?.title || "").trim();
  return {
    title,
    content: String(note?.content || ""),
    rawContent: String(note?.rawContent || note?.content || ""),
    markdownContent: String(note?.markdownContent || note?.rawContent || note?.content || ""),
  };
}

function noteDiffersFromUndoSnapshot(note = null, snapshot = null) {
  if (!note || !snapshot) return false;
  const noteTitle = String(note?.metadata?.title || note?.title || "").trim();
  return (
    String(noteTitle) !== String(snapshot.title || "") ||
    String(note?.content || "") !== String(snapshot.content || "") ||
    String(note?.rawContent || note?.content || "") !== String(snapshot.rawContent || "") ||
    String(note?.markdownContent || note?.rawContent || note?.content || "") !== String(snapshot.markdownContent || "")
  );
}

function renderItemPageContent() {
  return `
    <section class="page page-item" style="position:relative;">
      <div class="folder-explorer-pane">
        <section class="folder-hero-toolbar">
          <div class="folder-hero-head">
            <nav class="folder-breadcrumb" id="item-breadcrumb" aria-label="Breadcrumb">
              <a class="folder-back-link" href="#/">Stash</a>
            </nav>
            <div class="item-actions" id="item-actions-bar"></div>
          </div>
        </section>

        <div class="item-detail" id="item-detail">
          <div class="item-detail-loading" id="item-detail-loading">
            <div class="skeleton-card skeleton-pulse" style="height:200px;"></div>
            <div class="skeleton-card skeleton-pulse" style="height:80px;margin-top:12px;"></div>
          </div>
        </div>
      </div>

      ${renderMoveModalHTML()}
      ${renderActivityModalHTML()}
    </section>
  `;
}

function queryPageElements(mountNode) {
  const moveModalEls = queryMoveModalEls(mountNode);
  const activityModalEls = queryActivityModalEls(mountNode);

  return {
    ...moveModalEls,
    ...activityModalEls,
    itemDetail: mountNode.querySelector("#item-detail"),
    itemDetailLoading: mountNode.querySelector("#item-detail-loading"),
    itemBreadcrumb: mountNode.querySelector("#item-breadcrumb"),
    itemActionsBar: mountNode.querySelector("#item-actions-bar"),
    toast: document.getElementById("toast"),
  };
}

export function createItemPage({ store, apiClient, auth = null, shell, workspaceSync = null }) {
  return {
    async mount({ mountNode, route, navigate }) {
      const itemId = route.itemId || "";
      if (!itemId) {
        navigate("#/");
        return;
      }

      mountNode.innerHTML = renderItemPageContent();
      const pageEls = queryPageElements(mountNode);
      const els = { ...shell.els, ...pageEls };

      const disposers = [];
      let isMounted = true;
      let note = null;
      let relatedNotes = [];
      let versions = [];
      let moveModalResolver = null;
      const currentUserId = String(auth?.getSession?.()?.userId || "").trim();
      let fileDraftState = { dirty: false, saving: false };
      let pendingRemoteRefresh = false;
      let remoteRefreshInFlight = false;
      let queuedRemoteRefreshOptions = null;
      let isEditingNote = false;
      let detailController = null;
      let remoteActivityState = createLiveAgentActivityState();
      let remoteActivityClearTimer = null;
      let agentUndoState = {
        available: false,
        pending: false,
        snapshot: null,
      };
      let pendingAgentUndoSnapshot = null;

      function on(target, eventName, handler, options) {
        if (!target) return;
        target.addEventListener(eventName, handler, options);
        disposers.push(() => target.removeEventListener(eventName, handler, options));
      }

      function toast(message, tone = "success") {
        showToast(message, tone, store);
      }

      shell.setToast(toast);
      shell.setOnOpenCitation((n) => {
        if (!n) return;
        navigate(`#/item/${encodeURIComponent(n.id)}`);
      });
      function setRemoteActivity(state = null) {
        remoteActivityState = state && typeof state === "object"
          ? {
              active: Boolean(state.active),
              text: String(state.text || "").trim(),
              entries: Array.isArray(state.entries) ? state.entries : [],
            }
          : createLiveAgentActivityState();
        detailController?.setRemoteActivity?.(remoteActivityState);
      }

      function setAgentUndo(state = null) {
        const snapshot = state?.snapshot || null;
        const pending = Boolean(state?.pending);
        const available = Boolean(state?.available && snapshot);
        agentUndoState = {
          available,
          pending,
          snapshot,
        };
        detailController?.setAgentUndo?.(agentUndoState);
      }

      function scheduleRemoteActivityClear(delayMs = 3600) {
        if (remoteActivityClearTimer) {
          clearTimeout(remoteActivityClearTimer);
        }
        remoteActivityClearTimer = window.setTimeout(() => {
          const hasRunning = Array.isArray(remoteActivityState.entries)
            && remoteActivityState.entries.some((entry) => String(entry?.status || "") === "running");
          if (hasRunning) return;
          setRemoteActivity({
            ...remoteActivityState,
            active: false,
            text: "",
          });
        }, delayMs);
      }

      async function undoLatestAgentUpdate() {
        if (!note || !isFileSource(note) || !agentUndoState?.available || !agentUndoState?.snapshot) return;
        const snapshot = agentUndoState.snapshot;
        setAgentUndo({ ...agentUndoState, pending: true });
        try {
          const result = await apiClient.updateNoteExtracted(note.id, {
            title: snapshot.title,
            content: snapshot.content,
            rawContent: snapshot.rawContent,
            markdownContent: snapshot.markdownContent,
            requeueEnrichment: false,
            baseRevision: note?.revision,
          });
          if (!isMounted) return;
          if (result?.note) {
            note = result.note;
            workspaceSync?.ingestNotes([note]);
            shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
          }
          setAgentUndo({ available: false, pending: false, snapshot: null });
          pendingAgentUndoSnapshot = null;
          toast("Undid AI update");
          renderNote();
        } catch (err) {
          if (isRevisionConflictStatus(err?.status)) {
            await refreshCurrentNote({ refreshVersions: true });
          }
          setAgentUndo({ ...agentUndoState, pending: false });
          toast("Couldn't undo AI update right now.", "error");
        }
      }

      function applyWorkspaceActionPatch(action = null) {
        if (!note || !action || typeof action !== "object") return false;
        const patch = action.patch && typeof action.patch === "object"
          ? action.patch
          : action.result && typeof action.result?.patch === "object"
            ? action.result.patch
            : null;
        const nextRevisionValue = Number(action.nextRevision);
        const patchRevisionValue = Number(patch?.revision);
        const expectedRevision = Number.isFinite(nextRevisionValue) && nextRevisionValue > 0
          ? nextRevisionValue
          : (Number.isFinite(patchRevisionValue) && patchRevisionValue > 0 ? patchRevisionValue : null);
        const currentRevision = Number(note?.revision || 0);
        if (
          Number.isFinite(expectedRevision) &&
          expectedRevision > 0 &&
          currentRevision > 0 &&
          expectedRevision < currentRevision
        ) {
          return false;
        }
        if (!patch && !Number.isFinite(nextRevisionValue)) return false;

        const nextNote = { ...note };
        let changed = false;

        if (typeof patch?.content === "string" && patch.content !== nextNote.content) {
          nextNote.content = patch.content;
          changed = true;
        }
        if (typeof patch?.summary === "string" && patch.summary !== nextNote.summary) {
          nextNote.summary = patch.summary;
          changed = true;
        }
        if (typeof patch?.rawContent === "string" && patch.rawContent !== nextNote.rawContent) {
          nextNote.rawContent = patch.rawContent;
          changed = true;
        }
        if (typeof patch?.markdownContent === "string" && patch.markdownContent !== nextNote.markdownContent) {
          nextNote.markdownContent = patch.markdownContent;
          changed = true;
        }
        if (typeof patch?.project === "string" && patch.project !== nextNote.project) {
          nextNote.project = patch.project;
          changed = true;
        }
        if (Array.isArray(patch?.tags)) {
          const nextTags = patch.tags.map((tag) => String(tag || "").trim()).filter(Boolean);
          if (JSON.stringify(nextTags) !== JSON.stringify(Array.isArray(nextNote.tags) ? nextNote.tags : [])) {
            nextNote.tags = nextTags;
            changed = true;
          }
        }
        if (typeof patch?.status === "string" && patch.status !== nextNote.status) {
          nextNote.status = patch.status;
          changed = true;
        }
        if (Number.isFinite(nextRevisionValue) && nextRevisionValue > 0 && nextRevisionValue !== Number(nextNote.revision || 0)) {
          nextNote.revision = nextRevisionValue;
          changed = true;
        } else if (Number.isFinite(Number(patch?.revision)) && Number(patch.revision) !== Number(nextNote.revision || 0)) {
          nextNote.revision = Number(patch.revision);
          changed = true;
        }
        if (typeof patch?.title === "string") {
          const nextTitle = patch.title.trim();
          const currentTitle = String(nextNote?.metadata?.title || "").trim();
          if (nextTitle && nextTitle !== currentTitle) {
            nextNote.metadata = {
              ...(nextNote.metadata || {}),
              title: nextTitle,
            };
            changed = true;
          }
        }

        if (!changed) return false;

        note = nextNote;
        shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
        renderNote();
        return true;
      }

      function hydrateNoteFromWorkspaceSync() {
        if (!note || !workspaceSync) return false;
        const canonical = workspaceSync.getNoteById(note.id);
        if (!canonical) return false;
        const nextNote = {
          ...note,
          ...canonical,
          metadata: {
            ...(note.metadata || {}),
            ...(canonical.metadata || {}),
          },
        };
        const changed = JSON.stringify({
          title: String(note?.metadata?.title || ""),
          content: String(note?.content || ""),
          project: String(note?.project || ""),
          summary: String(note?.summary || ""),
          revision: Number(note?.revision || 0),
          status: String(note?.status || ""),
        }) !== JSON.stringify({
          title: String(nextNote?.metadata?.title || ""),
          content: String(nextNote?.content || ""),
          project: String(nextNote?.project || ""),
          summary: String(nextNote?.summary || ""),
          revision: Number(nextNote?.revision || 0),
          status: String(nextNote?.status || ""),
        });
        if (!changed) return false;
        note = nextNote;
        shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
        renderNote();
        return true;
      }

      shell.setOnWorkspaceAction((action) => {
        const targetNoteId = actionNoteId(action);
        if (!targetNoteId || !note || targetNoteId !== note.id) return;
        const phase = actionPhase(action);
        if (!phase) return;
        const actionId = String(action?.actionId || "").trim();

        setRemoteActivity(applyWorkspaceActionToLiveActivity(remoteActivityState, action));

        if (phase === "start") {
          if (!(isFileSource(note) && (fileDraftState.dirty || fileDraftState.saving)) && !isEditingNote) {
            applyWorkspaceActionPatch(action);
            hydrateNoteFromWorkspaceSync();
          }
          return;
        }

        if (action?.error) {
          void refreshCurrentNote({ refreshVersions: true, clearRemoteActivity: false })
            .finally(() => {
              scheduleRemoteActivityClear();
            });
          return;
        }

        if (isFileSource(note) && (fileDraftState.dirty || fileDraftState.saving)) {
          pendingRemoteRefresh = true;
          if (!pendingAgentUndoSnapshot) {
            pendingAgentUndoSnapshot = buildAgentUndoSnapshot(note);
          }
          setRemoteActivity(pushLiveAgentActivityEntry(remoteActivityState, {
            actionName: "remote_update",
            text: "Agent update pending",
            status: "queued",
          }));
          return;
        }

        if (isFileSource(note) && (phase === "commit" || phase === "done")) {
          const snapshot = buildAgentUndoSnapshot(note);
          if (snapshot && actionId) {
            pendingAgentUndoSnapshot = snapshot;
          } else if (snapshot && !pendingAgentUndoSnapshot) {
            pendingAgentUndoSnapshot = snapshot;
          }
        }

        applyWorkspaceActionPatch(action);
        hydrateNoteFromWorkspaceSync();
        const minRevision = Number(note?.revision || 0);

        void refreshCurrentNote({
          refreshVersions: true,
          clearRemoteActivity: false,
          markAgentUpdated: true,
          minRevision: Number.isFinite(minRevision) && minRevision > 0 ? minRevision : 0,
        })
          .finally(() => {
            scheduleRemoteActivityClear();
          });
      });

      // Toolbar handlers
      on(els.toolbarNewBtn, "click", (e) => {
        e.stopPropagation();
        els.toolbarNewMenu?.classList.toggle("hidden");
      });

      on(els.toolbarSearchToggle, "click", () => {
        navigate("#/");
      });

      on(els.toolbarSignOutBtn, "click", () => {
        auth?.onSignOut?.();
      });

      on(els.toolbarChatToggle, "click", () => {
        shell.toggleChat();
      });

      function resolveMoveDialog(value) {
        if (!moveModalResolver) return;
        const resolver = moveModalResolver;
        moveModalResolver = null;
        resolver(value);
      }

      function openMoveDialog({ title = "Move to folder", confirmLabel = "Move", initialValue = "" } = {}) {
        if (moveModalResolver) resolveMoveDialog(null);
        openMoveModal(els, { title, confirmLabel, value: initialValue, suggestions: [] });
        return new Promise((resolve) => { moveModalResolver = resolve; });
      }

      const cleanupMoveModal = initMoveModalHandlers(els, {
        onClose() { closeMoveModal(els); resolveMoveDialog(null); },
        onSubmit(value) {
          const target = String(value || "").trim();
          if (!target) { els.moveModalInput?.focus(); return; }
          closeMoveModal(els);
          resolveMoveDialog(target);
        },
        onInput() {},
        onSuggestionPick() {},
      });
      disposers.push(cleanupMoveModal);

      const cleanupActivityModal = initActivityModalHandlers(els, {
        onClose() {
          closeActivityModal(els);
        },
        async onAddComment(text) {
          if (!note) return null;
          try {
            const result = await apiClient.addNoteComment(note.id, { text });
            if (!isMounted) return null;
          if (result?.note) {
            note = result.note?.note || result.note;
            workspaceSync?.ingestNotes([note]);
            shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
          }
            const refreshedVersions = await apiClient.fetchNoteVersions(note.id).catch(() => null);
            if (refreshedVersions?.items) versions = refreshedVersions.items;
            toast("Comment added");
            renderNote();
            return { entries: buildItemActivityEntries(note, versions) };
          } catch (err) {
            toast(conciseTechnicalError(err, "Comment failed"), "error");
            return null;
          }
        },
        async onRestoreVersion(versionNumber) {
          if (!note) return null;
          try {
            const result = await apiClient.restoreNoteVersion(note.id, versionNumber);
            if (!isMounted) return null;
            if (result?.note) {
              note = result.note;
              shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
            }
            const refreshedVersions = await apiClient.fetchNoteVersions(note.id).catch(() => null);
            if (refreshedVersions?.items) versions = refreshedVersions.items;
            isEditingNote = false;
            toast("Restored");
            renderNote();
            return { entries: buildItemActivityEntries(note, versions) };
          } catch (err) {
            toast(conciseTechnicalError(err, "Restore failed"), "error");
            return null;
          }
        },
      });
      disposers.push(cleanupActivityModal);

      // ── Breadcrumb + actions (stable across re-renders) ──────────

      function updateBreadcrumb() {
        const bc = els.itemBreadcrumb;
        if (!bc || !note) return;
        bc.innerHTML = "";
        const homeLink = document.createElement("a");
        homeLink.className = "folder-back-link";
        homeLink.href = "#/";
        homeLink.textContent = "Stash";
        bc.appendChild(homeLink);
        if (note.project) {
          bc.insertAdjacentHTML("beforeend", CHEVRON_SVG);
          const folderLink = document.createElement("a");
          folderLink.className = "folder-back-link";
          folderLink.href = `#/folder/${encodeURIComponent(note.project)}`;
          folderLink.textContent = note.project;
          bc.appendChild(folderLink);
        }
        bc.insertAdjacentHTML("beforeend", CHEVRON_SVG);
        const crumb = document.createElement("span");
        crumb.className = "folder-breadcrumb-current";
        const name = document.createElement("span");
        name.className = "folder-current-name";
        name.textContent = buildNoteTitle(note);
        crumb.appendChild(name);
        bc.appendChild(crumb);
      }

      const actionsBar = els.itemActionsBar;

      function setActionButtonMarkup(button, { icon = "", label = "" } = {}) {
        button.innerHTML = `${icon}<span>${label}</span>`;
      }

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "folder-subfolder-btn";
      setActionButtonMarkup(editBtn, { icon: EDIT_ICON, label: "Edit" });
      editBtn.addEventListener("click", () => {
        if (!note || isFileSource(note)) return;
        isEditingNote = true;
        renderNote();
      });

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "folder-subfolder-btn";
      setActionButtonMarkup(saveBtn, { icon: SAVE_ICON, label: "Save" });
      saveBtn.addEventListener("click", async () => {
        if (!note || isFileSource(note) || !isEditingNote) return;
        const payload = detailController?.getPendingEditPayload?.();
        if (!payload) return;
        saveBtn.disabled = true;
        setActionButtonMarkup(saveBtn, { icon: SAVE_ICON, label: "Saving..." });
        try {
          const result = await apiClient.updateNote(note.id, {
            ...payload,
            baseRevision: note?.revision,
          });
          if (!isMounted) return;
          if (result?.note) {
            note = result.note;
            workspaceSync?.ingestNotes([note]);
            shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
          }
          try {
            const vResult = await apiClient.fetchNoteVersions(note.id);
            if (vResult?.items) versions = vResult.items;
          } catch {}
          isEditingNote = false;
          toast("Saved");
          renderNote();
        } catch (err) {
          if (isRevisionConflictStatus(err?.status)) {
            toast("This item changed elsewhere. Reloading latest version...", "error");
            await refreshCurrentNote({ refreshVersions: true });
            return;
          }
          toast(conciseTechnicalError(err, "Save failed"), "error");
        } finally {
          saveBtn.disabled = false;
          setActionButtonMarkup(saveBtn, { icon: SAVE_ICON, label: "Save" });
        }
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "folder-subfolder-btn";
      setActionButtonMarkup(cancelBtn, { icon: CANCEL_ICON, label: "Cancel" });
      cancelBtn.addEventListener("click", () => {
        if (!isEditingNote) return;
        isEditingNote = false;
        renderNote();
      });

      on(els.itemDetail, "keydown", (event) => {
        if (!isEditingNote || isFileSource(note)) return;
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          saveBtn.click();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancelBtn.click();
        }
      });

      const activityBtn = document.createElement("button");
      activityBtn.type = "button";
      activityBtn.className = "folder-subfolder-btn";
      setActionButtonMarkup(activityBtn, { icon: ACTIVITY_ICON, label: "Activity" });
      activityBtn.addEventListener("click", () => {
        if (!note) return;
        openActivityModal(els, {
          title: "Activity",
          entries: buildItemActivityEntries(note, versions),
        });
      });

      const moveBtn = document.createElement("button");
      moveBtn.type = "button";
      moveBtn.className = "folder-subfolder-btn";
      setActionButtonMarkup(moveBtn, { icon: MOVE_ICON, label: "Move" });
      moveBtn.addEventListener("click", async () => {
        if (!note) return;
        const target = await openMoveDialog({ initialValue: note.project || "" });
        if (!target) return;
        try {
          await apiClient.batchMoveNotes([note.id], target);
          if (!isMounted) return;
          note.project = target;
          workspaceSync?.ingestNotes([note]);
          shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
          toast("Moved");
          renderNote();
        } catch {
          toast("Move failed", "error");
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "folder-delete-btn";
      setActionButtonMarkup(deleteBtn, { icon: DELETE_ICON, label: "Delete" });
      deleteBtn.addEventListener("click", async () => {
        if (!note) return;
        if (!window.confirm("Delete this item? This action cannot be undone.")) return;
        try {
          await apiClient.deleteNote(note.id);
          if (!isMounted) return;
          toast("Item deleted");
          navigate("#/");
        } catch (err) {
          toast(conciseTechnicalError(err, "Delete failed"), "error");
        }
      });

      const sourceLinkBtn = document.createElement("a");
      sourceLinkBtn.className = "folder-subfolder-btn";
      sourceLinkBtn.target = "_blank";
      sourceLinkBtn.rel = "noopener noreferrer";
      setActionButtonMarkup(sourceLinkBtn, { icon: OPEN_LINK_ICON, label: "Open link" });
      sourceLinkBtn.style.display = "none";

      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "folder-subfolder-btn";
      setActionButtonMarkup(retryBtn, { icon: RETRY_ICON, label: "Retry AI" });
      retryBtn.style.display = "none";
      retryBtn.addEventListener("click", async () => {
        if (!note) return;
        retryBtn.disabled = true;
        setActionButtonMarkup(retryBtn, { icon: RETRY_ICON, label: "Retrying..." });
        try {
          const result = await apiClient.retryNoteEnrichment(note.id);
          if (!isMounted) return;
          if (result?.note) {
            note = { ...note, ...result.note };
            workspaceSync?.ingestNotes([note]);
          } else {
            note.status = "pending";
          }
          toast("Enrichment retry queued");
          renderNote();
        } catch (err) {
          toast(conciseTechnicalError(err, "Retry failed"), "error");
        } finally {
          retryBtn.disabled = false;
          setActionButtonMarkup(retryBtn, { icon: RETRY_ICON, label: "Retry AI" });
        }
      });

      actionsBar.append(editBtn, saveBtn, cancelBtn, activityBtn, moveBtn, retryBtn, deleteBtn, sourceLinkBtn);

      function updateActions() {
        const url = String(note?.sourceUrl || "").trim();
        if (url) {
          sourceLinkBtn.href = url;
          sourceLinkBtn.style.display = "";
        } else {
          sourceLinkBtn.style.display = "none";
        }
        const status = String(note?.status || "").toLowerCase();
        retryBtn.style.display = status === "failed" ? "" : "none";
        const fileItem = isFileSource(note);
        const editing = !fileItem && isEditingNote;
        editBtn.style.display = !fileItem && !editing ? "" : "none";
        saveBtn.style.display = editing ? "" : "none";
        cancelBtn.style.display = editing ? "" : "none";
        const activityCount = buildItemActivityEntries(note, versions).length;
        const activityLabel = activityCount > 0 ? `Activity (${activityCount})` : "Activity";
        setActionButtonMarkup(activityBtn, { icon: ACTIVITY_ICON, label: activityLabel });
      }

      async function refreshCurrentNote({
        refreshVersions = false,
        clearRemoteActivity = false,
        markAgentUpdated = false,
        minRevision = 0,
      } = {}) {
        if (!note) return;
        if (remoteRefreshInFlight) {
          const queued = queuedRemoteRefreshOptions || {};
          queuedRemoteRefreshOptions = {
            refreshVersions: Boolean(queued.refreshVersions || refreshVersions),
            clearRemoteActivity: Boolean(queued.clearRemoteActivity || clearRemoteActivity),
            markAgentUpdated: Boolean(queued.markAgentUpdated || markAgentUpdated),
            minRevision: Math.max(Number(queued.minRevision || 0), Number(minRevision || 0)),
          };
          return;
        }
        const beforeRefresh = note ? { ...note } : null;
        remoteRefreshInFlight = true;
        try {
          const [noteResult, versionsResult] = await Promise.all([
            apiClient.fetchNote(note.id),
            refreshVersions ? apiClient.fetchNoteVersions(note.id).catch(() => null) : Promise.resolve(null),
          ]);
          if (!isMounted) return;
          if (noteResult?.note) {
            const currentRevision = Number(note?.revision || 0);
            const canonicalRevision = Number(workspaceSync?.getNoteById(note.id)?.revision || 0);
            const requiredRevision = Math.max(currentRevision, canonicalRevision, Number(minRevision || 0));
            const fetchedRevision = Number(noteResult.note?.revision || 0);
            const hasStaleFetch =
              fetchedRevision > 0 &&
              requiredRevision > 0 &&
              fetchedRevision < requiredRevision;
            if (!hasStaleFetch) {
              note = noteResult.note;
              workspaceSync?.ingestNotes([note]);
              shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
            }
            if (markAgentUpdated && isFileSource(note)) {
              const snapshot = pendingAgentUndoSnapshot || buildAgentUndoSnapshot(beforeRefresh);
              if (snapshot && noteDiffersFromUndoSnapshot(note, snapshot)) {
                setAgentUndo({ available: true, pending: false, snapshot });
              }
              pendingAgentUndoSnapshot = null;
            }
          }
          if (versionsResult?.items) {
            versions = versionsResult.items;
          }
          renderNote();
        } catch (err) {
          if (!isMounted) return;
          toast(conciseTechnicalError(err, "Failed to refresh item"), "error");
        } finally {
          remoteRefreshInFlight = false;
          if (clearRemoteActivity) {
            setRemoteActivity(createLiveAgentActivityState());
          }
          if (queuedRemoteRefreshOptions) {
            const nextOptions = { ...queuedRemoteRefreshOptions };
            queuedRemoteRefreshOptions = null;
            void refreshCurrentNote(nextOptions);
          }
        }
      }

      function renderNote() {
        if (!note || !els.itemDetail) return;
        updateBreadcrumb();
        updateActions();
        actionsBar.classList.remove("hidden");
        detailController = renderItemDetail(els.itemDetail, note, {
          relatedNotes,
          isEditing: isEditingNote,
          remoteActivity: remoteActivityState,
          agentUndo: agentUndoState,
          onUndoAgentUpdate: undoLatestAgentUpdate,
          onNavigate(id) {
            navigate(`#/item/${encodeURIComponent(id)}`);
          },
          async onEdit(payload) {
            if (payload?.mode === "file-live") {
              try {
                const result = await apiClient.updateNoteExtracted(note.id, {
                  title: payload.title,
                  content: payload.content,
                  rawContent: payload.rawContent,
                  markdownContent: payload.markdownContent,
                  requeueEnrichment: payload.requeueEnrichment === true,
                  baseRevision: note?.revision,
                });
                if (!isMounted) return result;
                if (result?.note) {
                  note = result.note;
                  workspaceSync?.ingestNotes([note]);
                  shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
                }
                return result;
              } catch (err) {
                if (isRevisionConflictStatus(err?.status)) {
                  let latestNote = err?.payload?.conflict?.currentNote || null;
                  if (!latestNote) {
                    try {
                      const latestResult = await apiClient.fetchNote(note.id);
                      latestNote = latestResult?.note || null;
                    } catch {
                      latestNote = null;
                    }
                  }
                  if (latestNote) {
                    note = latestNote;
                    workspaceSync?.ingestNotes([note]);
                    shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
                  }
                  return {
                    conflict: true,
                    note: latestNote,
                  };
                }
                toast(conciseTechnicalError(err, "Save failed"), "error");
                throw err;
              }
            }
            return null;
          },
          onFileDraftStateChange(state) {
            fileDraftState = {
              dirty: Boolean(state?.dirty),
              saving: Boolean(state?.saving),
            };
            if (pendingRemoteRefresh && !fileDraftState.dirty && !fileDraftState.saving) {
              pendingRemoteRefresh = false;
              const minRevision = Number(note?.revision || 0);
              void refreshCurrentNote({
                refreshVersions: true,
                clearRemoteActivity: false,
                markAgentUpdated: true,
                minRevision: Number.isFinite(minRevision) && minRevision > 0 ? minRevision : 0,
              })
                .finally(() => {
                  scheduleRemoteActivityClear();
                });
            }
          },
        });
        if (isEditingNote) {
          detailController?.focusEditEditor?.();
        }
      }

      // Try to find note in store as immediate fallback
      function findNoteInStore() {
        const storeNotes = store.getState().notes || [];
        for (const entry of storeNotes) {
          const n = normalizeCitation(entry, 0).note;
          if (String(n.id || "") === itemId) return n;
        }
        return null;
      }

      // Pre-fill breadcrumb from store so it doesn't flash during loading
      const earlyNote = findNoteInStore();
      if (earlyNote) {
        note = earlyNote;
        updateBreadcrumb();
      }

      // Fetch note + related + versions in parallel
      try {
        const [noteResult, relatedResult, versionsResult] = await Promise.allSettled([
          apiClient.fetchNote(itemId),
          apiClient.fetchRelatedNotes(itemId, 5),
          apiClient.fetchNoteVersions(itemId),
        ]);

        if (!isMounted) return;

        if (noteResult.status === "fulfilled" && noteResult.value?.note) {
          note = noteResult.value.note;
          workspaceSync?.ingestNotes([note]);
        } else {
          // Fallback: try store (note was loaded on previous page)
          note = findNoteInStore();
          if (!note) {
            toast("Item not found", "error");
            navigate("#/");
            return;
          }
        }

        if (relatedResult.status === "fulfilled" && Array.isArray(relatedResult.value?.items)) {
          relatedNotes = relatedResult.value.items;
        }

        if (versionsResult.status === "fulfilled" && Array.isArray(versionsResult.value?.items)) {
          versions = versionsResult.value.items;
        }

        // Set shell context
        shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");

        renderNote();
      } catch (err) {
        if (!isMounted) return;
        // Last-resort fallback from store
        note = findNoteInStore();
        if (note) {
          shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
          renderNote();
        } else {
          toast(conciseTechnicalError(err, "Failed to load item"), "error");
          navigate("#/");
        }
        return;
      }

      // Subscribe to SSE for live enrichment updates on this note
      const unsubscribeSSE = apiClient.subscribeToEvents?.((event) => {
        if (!isMounted || !note) return;
        if (event.type === "activity" && String(event.noteId || "") === note.id) {
          const eventType = String(event.eventType || "").trim().toLowerCase();
          const actorUserId = String(event.actorUserId || "").trim();
          if (eventType === "note.deleted") {
            toast("This item was deleted.");
            navigate("#/");
            return;
          }
          if (eventType === "note.updated") {
            if (actorUserId && actorUserId === currentUserId) return;
            if (isFileSource(note) && (fileDraftState.dirty || fileDraftState.saving)) {
              pendingRemoteRefresh = true;
              setRemoteActivity(pushLiveAgentActivityEntry(remoteActivityState, {
                actionName: "remote_update",
                text: "Agent update pending",
                status: "queued",
              }));
              return;
            }
            setRemoteActivity(pushLiveAgentActivityEntry(remoteActivityState, {
              actionName: "remote_update",
              text: "Applying remote workspace update...",
              status: "running",
            }));
            if (!pendingAgentUndoSnapshot) {
              pendingAgentUndoSnapshot = buildAgentUndoSnapshot(note);
            }
            const minRevision = Number(note?.revision || 0);
            void refreshCurrentNote({
              refreshVersions: true,
              clearRemoteActivity: false,
              markAgentUpdated: true,
              minRevision: Number.isFinite(minRevision) && minRevision > 0 ? minRevision : 0,
            })
              .finally(() => {
                setRemoteActivity(pushLiveAgentActivityEntry(remoteActivityState, {
                  actionName: "remote_update",
                  text: "Updated by AI just now",
                  status: "success",
                }));
                scheduleRemoteActivityClear();
              });
            return;
          }
        }
        if (event.type === "job:start" && event.id === note.id) {
          note.status = "enriching";
          renderNote();
        }
        if (event.type === "job:complete" && event.result?.id === note.id) {
          note = { ...note, ...event.result, status: "ready" };
          workspaceSync?.ingestNotes([note]);
          shell.setItemContext(note.id, buildNoteTitle(note), note.project || "");
          renderNote();
        }
        if (event.type === "job:error" && event.id === note.id) {
          note.status = "failed";
          renderNote();
        }
      });

      return () => {
        isMounted = false;
        if (unsubscribeSSE) unsubscribeSSE();
        closeMoveModal(els);
        closeActivityModal(els);
        resolveMoveDialog(null);
        shell.setToast(null);
        shell.setOnOpenCitation(null);
        shell.setOnWorkspaceAction(null);
        if (remoteActivityClearTimer) clearTimeout(remoteActivityClearTimer);
        disposers.forEach((fn) => fn());
      };
    },
  };
}
