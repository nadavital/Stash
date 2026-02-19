import { showToast } from "../components/toast/toast.js";
import {
  renderMoveModalHTML,
  queryMoveModalEls,
  openMoveModal,
  closeMoveModal,
  initMoveModalHandlers,
} from "../components/move-modal/move-modal.js";
import {
  buildNoteTitle,
  normalizeCitation,
  conciseTechnicalError,
} from "../services/mappers.js";
import { renderItemDetail } from "../services/render-item-detail.js";

const CHEVRON_SVG = `<svg class="folder-breadcrumb-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 4 10 8 6 12"/></svg>`;

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
    </section>
  `;
}

function queryPageElements(mountNode) {
  const moveModalEls = queryMoveModalEls(mountNode);

  return {
    ...moveModalEls,
    itemDetail: mountNode.querySelector("#item-detail"),
    itemDetailLoading: mountNode.querySelector("#item-detail-loading"),
    itemBreadcrumb: mountNode.querySelector("#item-breadcrumb"),
    itemActionsBar: mountNode.querySelector("#item-actions-bar"),
    toast: document.getElementById("toast"),
  };
}

export function createItemPage({ store, apiClient, auth = null, shell }) {
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

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "folder-subfolder-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        if (!note) return;
        const detail = els.itemDetail;
        if (!detail) return;
        detail.querySelector(".item-summary")?.classList.add("hidden");
        detail.querySelector(".item-tags")?.classList.add("hidden");
        detail.querySelector(".item-full-content")?.classList.add("hidden");
        detail.querySelector(".item-related")?.classList.add("hidden");
        detail.querySelector(".item-activity")?.classList.add("hidden");
        actionsBar.classList.add("hidden");
        const ef = detail.querySelector(".item-edit-form");
        if (ef) {
          ef.classList.remove("hidden");
          const ta = ef.querySelector(".md-editor-textarea");
          if (ta) requestAnimationFrame(() => ta.focus());
        }
      });

      const moveBtn = document.createElement("button");
      moveBtn.type = "button";
      moveBtn.className = "folder-subfolder-btn";
      moveBtn.textContent = "Move";
      moveBtn.addEventListener("click", async () => {
        if (!note) return;
        const target = await openMoveDialog({ initialValue: note.project || "" });
        if (!target) return;
        try {
          await apiClient.batchMoveNotes([note.id], target);
          if (!isMounted) return;
          note.project = target;
          toast("Moved");
          renderNote();
        } catch {
          toast("Move failed", "error");
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "folder-delete-btn";
      deleteBtn.textContent = "Delete";
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
      sourceLinkBtn.textContent = "Open link";
      sourceLinkBtn.style.display = "none";

      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "folder-subfolder-btn";
      retryBtn.textContent = "Retry AI";
      retryBtn.style.display = "none";
      retryBtn.addEventListener("click", async () => {
        if (!note) return;
        const original = retryBtn.textContent;
        retryBtn.disabled = true;
        retryBtn.textContent = "Retrying...";
        try {
          const result = await apiClient.retryNoteEnrichment(note.id);
          if (!isMounted) return;
          if (result?.note) {
            note = { ...note, ...result.note };
          } else {
            note.status = "pending";
          }
          toast("Enrichment retry queued");
          renderNote();
        } catch (err) {
          toast(conciseTechnicalError(err, "Retry failed"), "error");
        } finally {
          retryBtn.disabled = false;
          retryBtn.textContent = original;
        }
      });

      actionsBar.append(editBtn, moveBtn, retryBtn, deleteBtn, sourceLinkBtn);

      function updateSourceLink() {
        const url = String(note?.sourceUrl || "").trim();
        if (url) {
          sourceLinkBtn.href = url;
          sourceLinkBtn.style.display = "";
        } else {
          sourceLinkBtn.style.display = "none";
        }
        const status = String(note?.status || "").toLowerCase();
        retryBtn.style.display = status === "failed" ? "" : "none";
      }

      function renderNote() {
        if (!note || !els.itemDetail) return;
        updateBreadcrumb();
        updateSourceLink();
        actionsBar.classList.remove("hidden");
        renderItemDetail(els.itemDetail, note, {
          relatedNotes,
          versions,
          actionsBar,
          onNavigate(id) {
            navigate(`#/item/${encodeURIComponent(id)}`);
          },
          async onAddComment(text) {
            try {
              const result = await apiClient.addNoteComment(note.id, { text });
              if (!isMounted) return;
              if (result?.note) {
                note = result.note?.note || result.note;
              }
              toast("Comment added");
              renderNote();
            } catch (err) {
              toast(conciseTechnicalError(err, "Comment failed"), "error");
            }
          },
          async onEdit(payload) {
            try {
              const result = await apiClient.updateNote(note.id, payload);
              if (!isMounted) return;
              if (result?.note) note = result.note;
              try {
                const vResult = await apiClient.fetchNoteVersions(note.id);
                if (vResult?.items) versions = vResult.items;
              } catch {}
              toast("Saved");
              renderNote();
            } catch (err) {
              toast(conciseTechnicalError(err, "Save failed"), "error");
            }
          },
          async onFetchVersions() {
            return apiClient.fetchNoteVersions(note.id);
          },
          async onRestoreVersion(versionNumber) {
            try {
              const result = await apiClient.restoreNoteVersion(note.id, versionNumber);
              if (!isMounted) return;
              if (result?.note) note = result.note;
              try {
                const vResult = await apiClient.fetchNoteVersions(note.id);
                if (vResult?.items) versions = vResult.items;
              } catch {}
              toast("Restored");
              renderNote();
            } catch (err) {
              toast(conciseTechnicalError(err, "Restore failed"), "error");
            }
          },
        });
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
        if (event.type === "job:start" && event.id === note.id) {
          note.status = "enriching";
          renderNote();
        }
        if (event.type === "job:complete" && event.result?.id === note.id) {
          note = { ...note, ...event.result, status: "ready" };
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
        resolveMoveDialog(null);
        shell.setToast(null);
        shell.setOnOpenCitation(null);
        disposers.forEach((fn) => fn());
      };
    },
  };
}
