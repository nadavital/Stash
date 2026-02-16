import { renderFolderHeroToolbar } from "../components/folder-hero-toolbar/folder-hero-toolbar.js";
import { renderFolderItemGrid } from "../components/folder-item-grid/folder-item-grid.js";
import {
  renderRecentInlineStripHTML,
} from "../components/home-recent-list/home-recent-list.js";
import { showToast } from "../components/toast/toast.js";
import {
  renderItemModalHTML,
  queryItemModalEls,
  openItemModal,
  closeItemModal,
  initItemModalHandlers,
} from "../components/item-modal/item-modal.js";
import {
  renderFolderModalHTML,
  queryFolderModalEls,
  openFolderModal,
  closeFolderModal,
  getSelectedFolderColor,
  initFolderModalHandlers,
} from "../components/folder-modal/folder-modal.js";
import {
  renderMoveModalHTML,
  queryMoveModalEls,
  openMoveModal,
  closeMoveModal,
  renderMoveModalSuggestions,
  initMoveModalHandlers,
} from "../components/move-modal/move-modal.js";
import {
  renderSaveModalHTML,
  querySaveModalEls,
  openSaveModal,
  closeSaveModal,
  initSaveModalHandlers,
} from "../components/save-modal/save-modal.js";
import {
  renderInlineSearchHTML,
  queryInlineSearchEls,
  renderSearchResults,
  initInlineSearchHandlers,
} from "../components/inline-search/inline-search.js";
import {
  renderSortFilterHTML,
  querySortFilterEls,
  initSortFilter,
  toggleSortFilterDropdown,
} from "../components/sort-filter/sort-filter.js";
import { createActionMenu, closeAllActionMenus } from "../components/action-menu/action-menu.js";
import {
  normalizeFolderColor,
  fallbackColorForFolder,
  normalizeFolderDrafts,
  normalizeFolderSymbol,
  resolveFolderMeta,
} from "../services/folder-utils.js";
import {
  renderContentToolbarHTML,
  queryContentToolbarEls,
} from "../components/content-toolbar/content-toolbar.js";
import { initKeyboardShortcuts } from "../services/keyboard.js";
import {
  buildContentPreview,
  buildLocalFallbackNote,
  buildNoteTitle,
  conciseTechnicalError,
  filterAndRankMockNotes,
  inferCaptureType,
  normalizeCitation,
} from "../services/mappers.js";
import {
  iconTypeFor,
  getNoteProcessingState,
  noteTypeIconMarkup,
  relativeTime,
} from "../services/note-utils.js";

function renderFolderPageContent(folderMeta) {
  return `
    <section class="page page-folder" style="position:relative;">
      ${renderSortFilterHTML()}

      <div class="folder-explorer-pane">
        ${renderContentToolbarHTML()}
        ${renderInlineSearchHTML()}
        ${renderRecentInlineStripHTML({ title: "Recent in folder" })}
        ${renderFolderHeroToolbar({
          folderName: folderMeta.name,
          folderDescription: folderMeta.description,
          folderColor: folderMeta.color,
          folderSymbol: folderMeta.symbol,
        })}
        <div id="subfolders-section" class="subfolders-section hidden">
          <div class="subfolders-head">
            <p class="subfolders-title">Folders</p>
          </div>
          <div id="subfolders-grid" class="subfolders-grid"></div>
        </div>
        ${renderFolderItemGrid()}
      </div>
    </section>

    <div id="batch-action-bar" class="batch-action-bar hidden">
      <span id="batch-action-count" class="batch-action-count">0 selected</span>
      <button id="batch-move-btn" class="batch-action-btn" type="button">Move to...</button>
      <button id="batch-delete-btn" class="batch-action-btn batch-action-btn--danger" type="button">Delete All</button>
      <button id="batch-cancel-btn" class="batch-action-btn batch-cancel-btn" type="button">Cancel</button>
    </div>

    ${renderItemModalHTML()}

    ${renderFolderModalHTML()}

    ${renderMoveModalHTML()}

    ${renderSaveModalHTML()}
  `;
}

function queryPageElements(mountNode) {
  const itemModalEls = queryItemModalEls(mountNode);
  const folderModalEls = queryFolderModalEls(mountNode);
  const moveModalEls = queryMoveModalEls(mountNode);
  const saveModalEls = querySaveModalEls(mountNode);
  const inlineSearchEls = queryInlineSearchEls(mountNode);
  const sortFilterEls = querySortFilterEls(mountNode);
  const toolbarEls = queryContentToolbarEls(mountNode);

  return {
    ...itemModalEls,
    ...folderModalEls,
    ...moveModalEls,
    ...saveModalEls,
    ...inlineSearchEls,
    ...sortFilterEls,
    ...toolbarEls,
    recentNotesList: mountNode.querySelector("#recent-notes-list"),
    refreshBtn: mountNode.querySelector("#refresh-btn"),
    deleteFolderBtn: mountNode.querySelector("#delete-folder-btn"),
    renameFolderBtn: mountNode.querySelector("#rename-folder-btn"),
    newFolderBtn: mountNode.querySelector("#new-folder-btn"),
    subfoldersSection: mountNode.querySelector("#subfolders-section"),
    subfoldersGrid: mountNode.querySelector("#subfolders-grid"),
    folderItemsGrid: mountNode.querySelector("#folder-items-grid"),
    batchActionBar: mountNode.querySelector("#batch-action-bar"),
    batchActionCount: mountNode.querySelector("#batch-action-count"),
    batchDeleteBtn: mountNode.querySelector("#batch-delete-btn"),
    batchMoveBtn: mountNode.querySelector("#batch-move-btn"),
    batchCancelBtn: mountNode.querySelector("#batch-cancel-btn"),
    toast: document.getElementById("toast"),
  };
}

export function createFolderPage({ store, apiClient, auth = null, shell }) {
  return {
    async mount({ mountNode, route, navigate }) {
      const folderName = route.folderId || "general";
      let folderMeta = resolveFolderMeta(folderName, store.getState().draftFolders);
      const authSession = auth?.getSession?.() || null;

      mountNode.innerHTML = renderFolderPageContent(folderMeta);
      const pageEls = queryPageElements(mountNode);
      const els = { ...shell.els, ...pageEls };

      const disposers = [];
      let isMounted = true;
      let searchTimer = null;
      let recentNotes = [];
      let searchResults = [];
      let sortMode = "newest";
      let filterType = "all";
      let subFolders = [];
      let selectMode = false;
      const selectedIds = new Set();
      let hasMoreNotes = false;
      let currentOffset = 0;
      const PAGE_SIZE = 20;
      let dbFolderMeta = null;
      let moveModalResolver = null;

      function normalizeRuntimeFolderMeta(candidate, fallbackName = folderMeta.name) {
        const normalizedName = String(candidate?.name || fallbackName || "").trim() || "General";
        return {
          name: normalizedName,
          description: String(candidate?.description || "").trim(),
          color: normalizeFolderColor(candidate?.color, fallbackColorForFolder(normalizedName)),
          symbol: normalizeFolderSymbol(candidate?.symbol, "DOC"),
        };
      }

      function syncFolderHeader(meta, root = mountNode) {
        const normalized = normalizeRuntimeFolderMeta(meta);
        const currentNameEl = root.querySelector(".folder-current-name");
        if (currentNameEl) {
          currentNameEl.textContent = normalized.name;
        }
        const colorDot = root.querySelector(".folder-breadcrumb-current .folder-color-dot");
        if (colorDot) {
          colorDot.dataset.color = normalized.color;
        }
        const heroToolbar = root.querySelector(".folder-hero-toolbar");
        if (heroToolbar) {
          let descriptionEl = root.querySelector(".folder-current-desc");
          if (normalized.description) {
            if (!descriptionEl) {
              descriptionEl = document.createElement("p");
              descriptionEl.className = "folder-current-desc";
              heroToolbar.appendChild(descriptionEl);
            }
            descriptionEl.textContent = normalized.description;
          } else if (descriptionEl) {
            descriptionEl.remove();
          }
        }
      }

      syncFolderHeader(folderMeta);

      function on(target, eventName, handler, options) {
        if (!target) return;
        target.addEventListener(eventName, handler, options);
        disposers.push(() => target.removeEventListener(eventName, handler, options));
      }

      on(document, "click", () => {
        closeAllActionMenus(mountNode);
        els.toolbarNewMenu?.classList.add("hidden");
      });

      function getState() {
        return store.getState();
      }

      function setState(patch) {
        return store.setState(patch);
      }

      function listAllFolderNames() {
        const names = new Set([folderMeta.name]);
        normalizeFolderDrafts(getState().draftFolders).forEach((f) => {
          const n = String(f?.name || "").trim();
          if (n) names.add(n);
        });
        subFolders.forEach((f) => {
          const n = String(f?.name || "").trim();
          if (n) names.add(n);
        });
        recentNotes.forEach((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          const n = String(note?.project || "").trim();
          if (n) names.add(n);
        });
        return [...names].sort((a, b) => a.localeCompare(b));
      }

      function resolveMoveDialog(value) {
        if (!moveModalResolver) return;
        const resolver = moveModalResolver;
        moveModalResolver = null;
        resolver(value);
      }

      function listMoveFolderSuggestions({ includeCurrentFolder = false } = {}) {
        const values = new Set();

        normalizeFolderDrafts(getState().draftFolders).forEach((folder) => {
          const name = String(folder?.name || "").trim();
          if (name) values.add(name);
        });

        subFolders.forEach((folder) => {
          const name = String(folder?.name || "").trim();
          if (name) values.add(name);
        });

        recentNotes.forEach((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          const name = String(note?.project || "").trim();
          if (name) values.add(name);
        });

        if (!includeCurrentFolder) {
          values.delete(String(folderMeta.name || "").trim());
        }

        return [...values].sort((a, b) => a.localeCompare(b));
      }

      function openMoveDialog({
        title = "Move to folder",
        confirmLabel = "Move",
        initialValue = "",
        includeCurrentFolder = false,
      } = {}) {
        if (moveModalResolver) {
          resolveMoveDialog(null);
        }

        openMoveModal(els, {
          title,
          confirmLabel,
          value: initialValue,
          suggestions: listMoveFolderSuggestions({ includeCurrentFolder }),
        });

        return new Promise((resolve) => {
          moveModalResolver = resolve;
        });
      }

      function markAccessed(noteId) {
        if (!noteId) return;
        const state = getState();
        const set = new Set(state.accessedIds || []);
        set.add(String(noteId));
        setState({ accessedIds: [...set] });
      }

      function ensureDraftFolder(folder) {
        const normalizedName = String(folder || "").trim();
        if (!normalizedName) return;

        const drafts = normalizeFolderDrafts(getState().draftFolders);
        if (drafts.some((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase())) {
          return;
        }

        drafts.push({
          name: normalizedName,
          description: folderMeta.description || "",
          color: normalizeFolderColor(folderMeta.color, fallbackColorForFolder(normalizedName)),
          symbol: folderMeta.symbol || "DOC",
        });

        setState({ draftFolders: drafts });
      }

      function removeDraftFolder(folder) {
        const normalizedName = String(folder || "").trim().toLowerCase();
        if (!normalizedName) return;
        const nextDrafts = normalizeFolderDrafts(getState().draftFolders).filter(
          (entry) => entry.name.toLowerCase() !== normalizedName
        );
        setState({ draftFolders: nextDrafts });
      }

      function toast(message, tone = "success") {
        showToast(message, tone, store);
      }

      // Register shell callbacks
      shell.setToast(toast);
      shell.setOnOpenCitation((note) => {
        if (!note) return;
        openItemModal(els, note);
        markAccessed(note.id);
        renderView();
      });
      // + menu toggle
      on(els.toolbarNewBtn, "click", (e) => {
        e.stopPropagation();
        els.toolbarNewMenu?.classList.toggle("hidden");
      });
      on(els.toolbarNewItemBtn, "click", () => {
        els.toolbarNewMenu?.classList.add("hidden");
        openSaveModal(els, { folders: listAllFolderNames(), preselectedFolder: folderMeta.name });
      });
      on(els.toolbarNewFolderBtn, "click", () => {
        els.toolbarNewMenu?.classList.add("hidden");
        openFolderModal(els);
      });
      on(els.toolbarNewTaskBtn, "click", () => {
        els.toolbarNewMenu?.classList.add("hidden");
        // Use apiClient.createTask directly for tasks
        const title = prompt("Task title:");
        if (!title?.trim()) return;
        apiClient.createTask({ title: title.trim(), status: "open" })
          .then(() => { toast("Task created"); refreshNotes(); })
          .catch(() => { toast("Task save failed", "error"); });
      });

      // Search toggle
      on(els.toolbarSearchToggle, "click", () => {
        const searchWrap = mountNode.querySelector(".inline-search");
        if (searchWrap) {
          searchWrap.classList.toggle("is-visible");
          if (searchWrap.classList.contains("is-visible")) {
            els.inlineSearchInput?.focus();
          }
        }
      });

      // Sign out
      on(els.toolbarSignOutBtn, "click", () => {
        auth?.onSignOut?.();
      });

      // Chat toggle (mobile)
      on(els.toolbarChatToggle, "click", () => {
        shell.toggleChat();
      });

      function clearInlineSearch() {
        if (els.inlineSearchInput) {
          els.inlineSearchInput.value = "";
        }
        scheduleSearchRefresh({ immediate: true });
      }

      function applySortFilter(items) {
        if (!Array.isArray(items)) return [];
        let filtered = items;
        if (filterType !== "all") {
          filtered = items.filter((entry, index) => {
            const note = normalizeCitation(entry, index).note;
            return iconTypeFor(note) === filterType;
          });
        }
        if (sortMode === "oldest") {
          filtered = [...filtered].sort((a, b) => {
            const na = normalizeCitation(a, 0).note;
            const nb = normalizeCitation(b, 0).note;
            return (na.createdAt || "").localeCompare(nb.createdAt || "");
          });
        } else if (sortMode === "az") {
          filtered = [...filtered].sort((a, b) => {
            const na = normalizeCitation(a, 0).note;
            const nb = normalizeCitation(b, 0).note;
            return buildNoteTitle(na).localeCompare(buildNoteTitle(nb));
          });
        } else if (sortMode === "za") {
          filtered = [...filtered].sort((a, b) => {
            const na = normalizeCitation(a, 0).note;
            const nb = normalizeCitation(b, 0).note;
            return buildNoteTitle(nb).localeCompare(buildNoteTitle(na));
          });
        }
        return filtered;
      }

      function removeNoteFromFallback(noteId) {
        const normalizedId = String(noteId || "").trim();
        if (!normalizedId) return;
        const nextMock = (Array.isArray(getState().mockNotes) ? getState().mockNotes : []).filter(
          (entry, index) => normalizeCitation(entry, index).note.id !== normalizedId
        );
        const activeQuery = (els.inlineSearchInput?.value || "").trim();
        recentNotes = filterAndRankMockNotes(nextMock, {
          project: folderMeta.name,
          limit: 120,
        });
        searchResults = activeQuery
          ? filterAndRankMockNotes(nextMock, {
              query: activeQuery,
              project: folderMeta.name,
              limit: 120,
            })
          : [];
        setState({ mockNotes: nextMock, notes: recentNotes });
        renderView();
      }

      function removeFolderFromFallback() {
        const normalizedFolder = String(folderMeta.name || "").trim().toLowerCase();
        const nextMock = (Array.isArray(getState().mockNotes) ? getState().mockNotes : []).filter((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          return String(note.project || "").trim().toLowerCase() !== normalizedFolder;
        });
        setState({ mockNotes: nextMock, notes: [] });
      }

      function renameDraftFolderName(oldName, nextName, { color = "", description = "", symbol = "" } = {}) {
        const normalizedOld = String(oldName || "").trim().toLowerCase();
        const normalizedNext = String(nextName || "").trim();
        if (!normalizedOld || !normalizedNext) return;

        const drafts = normalizeFolderDrafts(getState().draftFolders);
        const oldDraft = drafts.find((entry) => entry.name.toLowerCase() === normalizedOld);
        const baseColor = normalizeFolderColor(color || oldDraft?.color, fallbackColorForFolder(normalizedNext));
        const baseDescription = String(description || oldDraft?.description || "").trim();
        const baseSymbol = normalizeFolderSymbol(symbol || oldDraft?.symbol, "DOC");
        const withoutOld = drafts.filter((entry) => entry.name.toLowerCase() !== normalizedOld);
        const existingIndex = withoutOld.findIndex((entry) => entry.name.toLowerCase() === normalizedNext.toLowerCase());

        if (existingIndex >= 0) {
          withoutOld[existingIndex] = {
            ...withoutOld[existingIndex],
            color: withoutOld[existingIndex].color || baseColor,
            description: withoutOld[existingIndex].description || baseDescription,
            symbol: withoutOld[existingIndex].symbol || baseSymbol,
          };
        } else {
          withoutOld.push({
            name: normalizedNext,
            color: baseColor,
            description: baseDescription,
            symbol: baseSymbol,
          });
        }

        setState({ draftFolders: withoutOld });
      }

      async function moveAllProjectNotes(oldProject, nextProject) {
        const normalizedOld = String(oldProject || "").trim();
        const normalizedNext = String(nextProject || "").trim();
        if (!normalizedOld || !normalizedNext || normalizedOld.toLowerCase() === normalizedNext.toLowerCase()) {
          return 0;
        }

        const PAGE_LIMIT = 120;
        let movedCount = 0;

        for (let attempt = 0; attempt < 80; attempt++) {
          const result = await apiClient.fetchNotes({ project: normalizedOld, limit: PAGE_LIMIT });
          const items = Array.isArray(result?.items) ? result.items : [];
          const ids = [...new Set(items
            .map((entry, index) => String(normalizeCitation(entry, index).note.id || "").trim())
            .filter(Boolean))];

          if (!ids.length) break;
          await apiClient.batchMoveNotes(ids, normalizedNext);
          movedCount += ids.length;
        }

        return movedCount;
      }

      function renameFolderInFallback(oldName, nextName) {
        const normalizedOld = String(oldName || "").trim().toLowerCase();
        const normalizedNext = String(nextName || "").trim();
        if (!normalizedOld || !normalizedNext) return;

        const nextMock = (Array.isArray(getState().mockNotes) ? getState().mockNotes : []).map((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          if (String(note.project || "").trim().toLowerCase() !== normalizedOld) {
            return entry;
          }

          const updated = { ...note, project: normalizedNext };
          if (entry?.note) {
            return { ...entry, note: updated };
          }
          return updated;
        });

        recentNotes = filterAndRankMockNotes(nextMock, {
          project: folderMeta.name,
          limit: 120,
        });
        const activeQuery = String(els.inlineSearchInput?.value || "").trim();
        searchResults = activeQuery
          ? filterAndRankMockNotes(nextMock, {
              query: activeQuery,
              project: folderMeta.name,
              limit: 120,
            })
          : [];
        setState({ mockNotes: nextMock, notes: recentNotes });
        renderView();
      }

      async function renameFolder(folderEntry, { navigateAfterRename = false } = {}) {
        const folder = folderEntry || {};
        const oldName = String(folder.name || "").trim();
        if (!oldName) return;

        const nextName = String(
          (await openMoveDialog({
            title: `Rename "${oldName}"`,
            confirmLabel: "Rename",
            initialValue: oldName,
          })) || ""
        ).trim();
        if (!nextName || nextName.toLowerCase() === oldName.toLowerCase()) return;

        try {
          const folderId = String(folder.id || "").trim();
          if (folderId) {
            await apiClient.updateFolder(folderId, { name: nextName });
          } else {
            const lookup = await apiClient.getFolder(oldName).catch(() => null);
            const lookupId = String(lookup?.folder?.id || "").trim();
            if (lookupId) {
              await apiClient.updateFolder(lookupId, { name: nextName });
            }
          }
        } catch (error) {
          apiClient.adapterLog("rename_folder_metadata_failed", conciseTechnicalError(error, "Folder metadata rename failed"));
        }

        try {
          const movedCount = await moveAllProjectNotes(oldName, nextName);
          renameDraftFolderName(oldName, nextName, folder);
          toast(
            movedCount > 0
              ? `Renamed folder and moved ${movedCount} item${movedCount === 1 ? "" : "s"}`
              : "Folder renamed"
          );
          if (navigateAfterRename) {
            navigate(`#/folder/${encodeURIComponent(nextName)}`);
            return;
          }
          await refreshNotes();
        } catch (error) {
          const message = conciseTechnicalError(error, "Folder rename endpoint unavailable");
          renameDraftFolderName(oldName, nextName, folder);
          renameFolderInFallback(oldName, nextName);
          toast("Folder renamed locally");
          apiClient.adapterLog("rename_folder_fallback", message);
          if (navigateAfterRename) {
            navigate(`#/folder/${encodeURIComponent(nextName)}`);
          }
        }
      }

      async function deleteFolderEntry(folderEntry) {
        const folder = folderEntry || {};
        const folderName = String(folder.name || "").trim();
        if (!folderName) return;

        const confirmed = window.confirm(`Delete folder "${folderName}" and all its items?`);
        if (!confirmed) return;

        try {
          const folderId = String(folder.id || "").trim();
          if (folderId) {
            await apiClient.deleteFolder(folderId).catch(() => null);
          }
          const result = await apiClient.deleteProject(folderName);
          if (!isMounted) return;
          removeDraftFolder(folderName);
          const deletedCount = Number(result?.deletedCount || 0);
          toast(deletedCount > 0 ? `Deleted ${deletedCount} item${deletedCount === 1 ? "" : "s"}` : "Folder deleted");
          if (folderName.toLowerCase() === String(folderMeta.name || "").trim().toLowerCase()) {
            navigate("#/");
            return;
          }
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Folder delete endpoint unavailable");
          removeDraftFolder(folderName);
          if (folderName.toLowerCase() === String(folderMeta.name || "").trim().toLowerCase()) {
            removeFolderFromFallback();
            navigate("#/");
          } else {
            toast("Folder removed locally");
            await refreshNotes();
          }
          apiClient.adapterLog("folder_delete_fallback", message);
        }
      }

      async function deleteNoteById(noteId) {
        const normalizedId = String(noteId || "").trim();
        if (!normalizedId) return;

        const confirmed = window.confirm("Delete this item? This action cannot be undone.");
        if (!confirmed) return;

        closeItemModal(els);
        try {
          await apiClient.deleteNote(normalizedId);
          if (!isMounted) return;
          toast("Item deleted");
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Delete endpoint unavailable");
          const alreadyDeleted = /not found|request failed \(404\)/i.test(message);
          if (alreadyDeleted) {
            toast("Item already deleted");
            await refreshNotes();
            return;
          }

          removeNoteFromFallback(normalizedId);
          toast("Deleted locally");
          apiClient.adapterLog("folder_delete_note_fallback", message);
        }
      }

      async function deleteCurrentFolder() {
        closeItemModal(els);
        await deleteFolderEntry({
          id: dbFolderMeta?.id || "",
          name: folderMeta.name,
          color: folderMeta.color,
          description: folderMeta.description,
          symbol: folderMeta.symbol,
        });
      }

      async function updateBreadcrumb(folder, root) {
        if (!folder?.parentId) return;
        const breadcrumb = root.querySelector(".folder-breadcrumb");
        if (!breadcrumb) return;
        const folderDotColor = normalizeFolderColor(folder?.color, fallbackColorForFolder(folder?.name || folderMeta.name));
        try {
          const parentResult = await apiClient.getFolder(folder.parentId);
          const parent = parentResult?.folder;
          if (!parent || !isMounted) return;
          breadcrumb.innerHTML = `
            <a class="folder-back-link" href="#/">Folders</a>
            <svg class="folder-breadcrumb-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 4 10 8 6 12"/></svg>
            <a class="folder-back-link" href="#/folder/${encodeURIComponent(parent.name)}">${parent.name}</a>
            <svg class="folder-breadcrumb-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 4 10 8 6 12"/></svg>
            <span class="folder-breadcrumb-current">
              <span class="folder-color-dot" data-color="${folderDotColor}" aria-hidden="true"></span>
              <span class="folder-current-name">${folder.name}</span>
            </span>
          `;
          syncFolderHeader(folder, root);
        } catch { /* breadcrumb stays default */ }
      }

      function renderSubfolders() {
        if (!els.subfoldersSection || !els.subfoldersGrid) return;
        if (!subFolders.length) {
          els.subfoldersSection.classList.add("hidden");
          return;
        }
        els.subfoldersSection.classList.remove("hidden");
        els.subfoldersGrid.innerHTML = "";

        const isListView = (getState().viewMode || "grid") === "list";
        if (isListView) {
          els.subfoldersGrid.classList.add("view-list");
        } else {
          els.subfoldersGrid.classList.remove("view-list");
        }

        subFolders.forEach((folder) => {
          if (isListView) {
            const row = document.createElement("div");
            row.className = "subfolder-row";
            row.tabIndex = 0;
            row.setAttribute("role", "link");

            const dot = document.createElement("span");
            dot.className = "folder-row-dot";
            dot.dataset.color = folder.color || "green";

            const nameEl = document.createElement("span");
            nameEl.className = "folder-row-name";
            nameEl.textContent = folder.name;

            const actionMenu = createActionMenu({
              ariaLabel: `Actions for folder ${folder.name}`,
              actions: [
                {
                  label: "Rename folder",
                  onSelect: async () => {
                    await renameFolder(folder);
                  },
                },
                {
                  label: "Delete folder",
                  tone: "danger",
                  onSelect: async () => {
                    await deleteFolderEntry(folder);
                  },
                },
              ],
            });

            row.append(dot, nameEl, actionMenu);
            row.addEventListener("click", (event) => {
              if (event.target.closest(".action-menu")) return;
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });
            row.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });
            els.subfoldersGrid.appendChild(row);
          } else {
            const card = document.createElement("article");
            card.className = "folder-pill subfolder-pill";
            card.tabIndex = 0;
            card.setAttribute("role", "link");
            card.dataset.color = folder.color || "green";

            const nameEl = document.createElement("span");
            nameEl.className = "folder-pill-name";
            nameEl.textContent = folder.name;

            const footer = document.createElement("div");
            footer.className = "folder-pill-footer subfolder-pill-footer";

            const actionMenu = createActionMenu({
              ariaLabel: `Actions for folder ${folder.name}`,
              actions: [
                {
                  label: "Rename folder",
                  onSelect: async () => {
                    await renameFolder(folder);
                  },
                },
                {
                  label: "Delete folder",
                  tone: "danger",
                  onSelect: async () => {
                    await deleteFolderEntry(folder);
                  },
                },
              ],
            });

            footer.append(actionMenu);

            const inner = document.createElement("div");
            inner.className = "folder-pill-inner";
            inner.append(nameEl, footer);
            card.append(inner);
            card.addEventListener("click", (event) => {
              if (event.target.closest(".action-menu")) return;
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });
            card.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });
            els.subfoldersGrid.appendChild(card);
          }
        });
      }

      function extractDomain(url) {
        try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
      }

      function renderFolderItems(items) {
        if (!els.folderItemsGrid) return;
        els.folderItemsGrid.innerHTML = "";

        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
          const empty = document.createElement("p");
          empty.className = "ui-empty";
          empty.textContent = "No items.";
          els.folderItemsGrid.appendChild(empty);
          return;
        }

        const isListView = (getState().viewMode || "grid") === "list";
        if (isListView) {
          els.folderItemsGrid.classList.add("view-list");
        } else {
          els.folderItemsGrid.classList.remove("view-list");
        }

        list.slice(0, 60).forEach((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          const noteType = iconTypeFor(note);
          const isLink = noteType === "link";
          const ogImage = note.metadata?.ogImage || "";

          const tileShell = document.createElement("div");
          tileShell.className = "folder-file-tile-shell";
          tileShell.style.cssText = `animation: fadeInUp 200ms ease both;`;

          const tile = document.createElement("article");
          tile.className = "folder-file-tile";
          tile.dataset.type = noteType;
          tile.tabIndex = 0;
          tile.setAttribute("role", "button");

          if (isListView) {
            const listIcon = document.createElement("span");
            listIcon.className = "list-view-icon";
            listIcon.innerHTML = noteTypeIconMarkup(noteType);
            tile.appendChild(listIcon);

            const body = document.createElement("div");
            body.className = "folder-file-body";

            const titleEl = document.createElement("p");
            titleEl.className = "folder-file-title";
            titleEl.textContent = buildNoteTitle(note);
            body.appendChild(titleEl);

            {
              const domain = isLink && note.sourceUrl ? extractDomain(note.sourceUrl) : "";
              const titleText = buildNoteTitle(note);
              if (domain && !titleText.startsWith(domain)) {
                const domainEl = document.createElement("p");
                domainEl.className = "folder-file-domain";
                domainEl.textContent = domain;
                body.appendChild(domainEl);
              }
              const previewText = buildContentPreview(note) || "";
              if (previewText) {
                const previewEl = document.createElement("p");
                previewEl.className = "folder-file-preview";
                previewEl.textContent = previewText;
                body.appendChild(previewEl);
              }
            }
            tile.appendChild(body);

            const timeEl = document.createElement("span");
            timeEl.className = "list-view-time";
            timeEl.textContent = relativeTime(note.createdAt);
            tile.appendChild(timeEl);

            const actions = document.createElement("div");
            actions.className = "list-view-actions";

            const actionMenu = createActionMenu({
              ariaLabel: `Actions for item ${buildNoteTitle(note)}`,
              actions: [
                {
                  label: "Move item",
                  onSelect: async () => {
                    const target = await openMoveDialog({
                      title: "Move item to folder",
                      confirmLabel: "Move",
                    });
                    if (!target) return;
                    try {
                      await apiClient.batchMoveNotes([note.id], target);
                      toast("Moved");
                      await refreshNotes();
                    } catch {
                      toast("Move failed", "error");
                    }
                  },
                },
                {
                  label: "Delete item",
                  tone: "danger",
                  onSelect: async () => {
                    await deleteNoteById(note.id);
                  },
                },
              ],
            });

            actions.append(actionMenu);
            tile.appendChild(actions);
          } else {
            const heroSrc = note.imagePath || (isLink && ogImage ? ogImage : "");

            // Action menu — shared between both layouts
            const actionRow = document.createElement("div");
            actionRow.className = "folder-file-actions";

            const actionMenu = createActionMenu({
              ariaLabel: `Actions for item ${buildNoteTitle(note)}`,
              actions: [
                {
                  label: "Move item",
                  onSelect: async () => {
                    const target = await openMoveDialog({
                      title: "Move item to folder",
                      confirmLabel: "Move",
                    });
                    if (!target) return;
                    try {
                      await apiClient.batchMoveNotes([note.id], target);
                      toast("Moved");
                      await refreshNotes();
                    } catch {
                      toast("Move failed", "error");
                    }
                  },
                },
                {
                  label: "Delete item",
                  tone: "danger",
                  onSelect: async () => {
                    await deleteNoteById(note.id);
                  },
                },
              ],
            });

            actionRow.append(actionMenu);

            if (heroSrc) {
              // ── Image tile: full-bleed hero with gradient overlay ──
              tile.classList.add("has-hero");

              const heroImg = document.createElement("img");
              heroImg.className = "folder-file-hero-bg";
              heroImg.src = heroSrc;
              heroImg.alt = buildNoteTitle(note);
              heroImg.loading = "lazy";
              heroImg.onerror = () => {
                tile.classList.remove("has-hero");
                heroImg.remove();
                // Rebuild as a plain tile — add icon + body
                const fallbackIcon = document.createElement("span");
                fallbackIcon.className = "folder-file-glass-icon";
                fallbackIcon.innerHTML = noteTypeIconMarkup(noteType);
                tile.insertBefore(fallbackIcon, glass);
                glass.className = "folder-file-body";
                glass.style.background = "none";
              };
              tile.appendChild(heroImg);

              // Gradient overlay at bottom of image
              const glass = document.createElement("div");
              glass.className = "folder-file-glass";

              const titleEl = document.createElement("p");
              titleEl.className = "folder-file-title";
              titleEl.textContent = buildNoteTitle(note);
              glass.appendChild(titleEl);

              {
                const domain = isLink && note.sourceUrl ? extractDomain(note.sourceUrl) : "";
                const titleText = buildNoteTitle(note);
                if (domain && !titleText.startsWith(domain)) {
                  const domainEl = document.createElement("p");
                  domainEl.className = "folder-file-domain";
                  domainEl.textContent = domain;
                  glass.appendChild(domainEl);
                }
              }

              const footer = document.createElement("div");
              footer.className = "folder-file-footer";
              const timeEl = document.createElement("span");
              timeEl.className = "folder-file-time";
              timeEl.textContent = relativeTime(note.createdAt);
              footer.appendChild(timeEl);
              footer.appendChild(actionRow);
              glass.appendChild(footer);

              tile.appendChild(glass);
            } else {
              // ── Non-image tile: glass card with type icon ──
              const glassIcon = document.createElement("span");
              glassIcon.className = "folder-file-glass-icon";
              glassIcon.innerHTML = noteTypeIconMarkup(noteType);
              tile.appendChild(glassIcon);

              const body = document.createElement("div");
              body.className = "folder-file-body";

              const titleEl = document.createElement("p");
              titleEl.className = "folder-file-title";
              titleEl.textContent = buildNoteTitle(note);
              body.appendChild(titleEl);

              {
                const domain = isLink && note.sourceUrl ? extractDomain(note.sourceUrl) : "";
                const titleText = buildNoteTitle(note);
                if (domain && !titleText.startsWith(domain)) {
                  const domainEl = document.createElement("p");
                  domainEl.className = "folder-file-domain";
                  domainEl.textContent = domain;
                  body.appendChild(domainEl);
                }
                const previewText = buildContentPreview(note) || "";
                if (previewText) {
                  const previewEl = document.createElement("p");
                  previewEl.className = "folder-file-preview";
                  previewEl.textContent = previewText;
                  body.appendChild(previewEl);
                }
              }
              tile.appendChild(body);

              const footer = document.createElement("div");
              footer.className = "folder-file-footer";
              const timeEl = document.createElement("span");
              timeEl.className = "folder-file-time";
              timeEl.textContent = relativeTime(note.createdAt);
              footer.appendChild(timeEl);
              footer.appendChild(actionRow);
              tile.appendChild(footer);
            }
          }

          tile.addEventListener("click", (e) => {
            if (e.target.closest(".folder-file-actions") || e.target.closest(".list-view-actions")) return;
            if (selectMode) {
              toggleNoteSelection(note.id);
              tileShell.classList.toggle("is-selected", selectedIds.has(String(note.id)));
              const cb = tileShell.querySelector(".batch-select-checkbox");
              if (cb) cb.checked = selectedIds.has(String(note.id));
              return;
            }
            openItemModal(els, note);
            markAccessed(note.id);
            renderView();
          });
          tile.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            tile.click();
          });

          if (selectMode) {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "batch-select-checkbox";
            checkbox.checked = selectedIds.has(String(note.id));
            checkbox.style.display = "block";
            checkbox.addEventListener("change", () => {
              toggleNoteSelection(note.id);
              tileShell.classList.toggle("is-selected", selectedIds.has(String(note.id)));
            });
            tileShell.prepend(checkbox);
          }

          tileShell.appendChild(tile);
          els.folderItemsGrid.appendChild(tileShell);
        });

        // Load more button
        if (hasMoreNotes && list.length > 0) {
          const loadMoreBtn = document.createElement("button");
          loadMoreBtn.type = "button";
          loadMoreBtn.className = "batch-action-btn";
          loadMoreBtn.style.cssText = "width: 100%; margin-top: 12px; grid-column: 1 / -1;";
          loadMoreBtn.textContent = "Load more";
          loadMoreBtn.addEventListener("click", async () => {
            currentOffset += PAGE_SIZE;
            try {
              const moreResult = await apiClient.fetchNotes({ project: folderMeta.name, limit: PAGE_SIZE, offset: currentOffset });
              if (!isMounted) return;
              const moreItems = Array.isArray(moreResult.items) ? moreResult.items : [];
              recentNotes = [...recentNotes, ...moreItems];
              hasMoreNotes = moreResult.hasMore;
              setState({ notes: recentNotes });
              renderView();
            } catch {
              if (!isMounted) return;
              toast("Failed to load more", "error");
            }
          });
          els.folderItemsGrid.appendChild(loadMoreBtn);
        }
      }

      function renderRecent() {
        if (!els.recentNotesList) return;
        els.recentNotesList.innerHTML = "";

        const noteItems = Array.isArray(recentNotes) ? recentNotes.slice(0, 12) : [];

        if (!noteItems.length) {
          const emptyNotes = document.createElement("p");
          emptyNotes.className = "ui-empty";
          emptyNotes.textContent = "No recent notes.";
          els.recentNotesList.appendChild(emptyNotes);
        } else {
          noteItems.forEach((entry, index) => {
            const note = normalizeCitation(entry, index).note;
            const item = document.createElement("button");
            item.type = "button";
            item.className = "recent-inline-card";
            item.title = buildNoteTitle(note);

            const head = document.createElement("span");
            head.className = "recent-inline-card-head";

            const icon = document.createElement("span");
            icon.className = "recent-item-icon";
            const noteType = iconTypeFor(note);
            icon.dataset.type = noteType;
            icon.title = `${noteType} note`;

            const timeEl = document.createElement("span");
            timeEl.className = "recent-inline-card-time";
            timeEl.textContent = relativeTime(note.createdAt);
            head.append(icon, timeEl);

            const label = document.createElement("span");
            label.className = "recent-inline-card-title";
            label.textContent = buildNoteTitle(note);

            const meta = document.createElement("span");
            meta.className = "recent-inline-card-meta";
            const processingState = getNoteProcessingState(note);

            if (processingState.showLabel) {
              const statusText = document.createElement("span");
              statusText.className = `recent-inline-status ${processingState.dotClass}`;
              statusText.textContent = processingState.label;
              meta.append(statusText);
            } else {
              meta.textContent = noteType;
            }
            item.append(head, label, meta);

            item.addEventListener("click", () => {
              openItemModal(els, note);
              markAccessed(note.id);
              renderView();
            });

            els.recentNotesList.appendChild(item);
          });
        }
      }

      function renderInlineSearchResults() {
        if (!els.folderItemsGrid) return;
        const query = String(els.inlineSearchInput?.value || "").trim();
        if (!query) return;

        renderSearchResults(els.folderItemsGrid, searchResults, {
          onOpen(note) {
            openItemModal(els, note);
            markAccessed(note.id);
            renderView();
          },
          onDelete(noteId) {
            deleteNoteById(noteId);
          },
        });
      }

      function renderView() {
        const query = String(els.inlineSearchInput?.value || "").trim();

        if (query) {
          renderInlineSearchResults();
          renderRecent();
          return;
        }

        renderSubfolders();
        renderFolderItems(applySortFilter(recentNotes));
        renderRecent();
      }

      async function refreshNotes() {
        const query = (els.inlineSearchInput?.value || "").trim();
        const includeSearch = Boolean(query);
        currentOffset = 0;

        try {
          const requests = [
            apiClient.fetchNotes({
              project: folderMeta.name,
              limit: PAGE_SIZE,
            }),
          ];
          if (includeSearch) {
            requests.push(
              apiClient.fetchNotes({
                query,
                project: folderMeta.name,
                limit: 120,
              })
            );
          }
          requests.push(apiClient.getFolder(folderMeta.name).catch(() => null));

          const results = await Promise.allSettled(requests);
          const recentResult = results[0];
          const searchResult = includeSearch ? results[1] : null;
          const folderMetaResult = includeSearch ? results[2] : results[1];
          if (recentResult.status !== "fulfilled") throw recentResult.reason;

          if (!isMounted) return;
          recentNotes = Array.isArray(recentResult.value?.items) ? recentResult.value.items : [];
          hasMoreNotes = recentResult.value?.hasMore || false;
          searchResults =
            includeSearch && searchResult?.status === "fulfilled" && Array.isArray(searchResult.value?.items)
              ? searchResult.value.items
              : [];
          setState({ notes: recentNotes });

          if (folderMetaResult?.status === "fulfilled" && folderMetaResult.value?.folder) {
            dbFolderMeta = folderMetaResult.value.folder;
            folderMeta = normalizeRuntimeFolderMeta(dbFolderMeta, folderMeta.name);
            syncFolderHeader(folderMeta, mountNode);
            try {
              const childrenResult = await apiClient.fetchSubfolders(dbFolderMeta.id);
              subFolders = Array.isArray(childrenResult?.items) ? childrenResult.items : [];
            } catch { subFolders = []; }
            if (dbFolderMeta.parentId) {
              updateBreadcrumb({ ...dbFolderMeta, color: folderMeta.color }, mountNode);
            }
          }

          renderView();
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Notes endpoint unavailable");
          recentNotes = filterAndRankMockNotes(getState().mockNotes, {
            project: folderMeta.name,
            limit: 120,
          });
          searchResults = includeSearch
            ? filterAndRankMockNotes(getState().mockNotes, {
                query,
                project: folderMeta.name,
                limit: 120,
              })
            : [];
          setState({ notes: recentNotes });
          renderView();
          apiClient.adapterLog("folder_notes_fallback", message);
        }
      }

      function scheduleSearchRefresh({ immediate = false } = {}) {
        if (searchTimer) {
          clearTimeout(searchTimer);
          searchTimer = null;
        }

        if (immediate) {
          refreshNotes();
          return;
        }

        searchTimer = window.setTimeout(() => {
          searchTimer = null;
          refreshNotes();
        }, 220);
      }

      // Batch select mode
      function toggleSelectMode(active) {
        selectMode = typeof active === "boolean" ? active : !selectMode;
        selectedIds.clear();
        const page = mountNode.querySelector(".page-folder");
        if (page) page.classList.toggle("select-mode", selectMode);
        if (els.toolbarSelectBtn) els.toolbarSelectBtn.classList.toggle("is-active", selectMode);
        if (els.toolbarSelectBtn) els.toolbarSelectBtn.textContent = selectMode ? "Done" : "Select";
        updateBatchBar();
        renderView();
      }

      function updateBatchBar() {
        if (!els.batchActionBar) return;
        const shouldShowBar = selectMode && selectedIds.size > 0;
        els.batchActionBar.classList.toggle("hidden", !shouldShowBar);
        document.body.classList.toggle("batch-mode-active", shouldShowBar);
        if (!shouldShowBar) return;
        if (els.batchActionCount) {
          els.batchActionCount.textContent = `${selectedIds.size} selected`;
        }
      }

      function toggleNoteSelection(noteId) {
        const id = String(noteId || "").trim();
        if (!id) return;
        if (selectedIds.has(id)) {
          selectedIds.delete(id);
        } else {
          selectedIds.add(id);
        }
        updateBatchBar();
      }

      on(els.toolbarSelectBtn, "click", () => {
        toggleSelectMode();
      });

      on(els.batchCancelBtn, "click", () => {
        toggleSelectMode(false);
      });

      on(els.batchDeleteBtn, "click", async () => {
        if (selectedIds.size === 0) return;
        const confirmed = window.confirm(`Delete ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}?`);
        if (!confirmed) return;
        try {
          await apiClient.batchDeleteNotes([...selectedIds]);
          if (!isMounted) return;
          toast(`Deleted ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`);
          toggleSelectMode(false);
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;
          toast(conciseTechnicalError(error, "Batch delete failed"), "error");
        }
      });

      on(els.batchMoveBtn, "click", async () => {
        if (selectedIds.size === 0) return;
        const target = await openMoveDialog({
          title: `Move ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`,
          confirmLabel: "Move",
        });
        if (!target) return;
        try {
          await apiClient.batchMoveNotes([...selectedIds], target);
          if (!isMounted) return;
          toast(`Moved ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`);
          toggleSelectMode(false);
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;
          toast(conciseTechnicalError(error, "Batch move failed"), "error");
        }
      });

      // View toggle handlers
      const viewMode = getState().viewMode || "grid";
      if (viewMode === "list") {
        els.toolbarViewGridBtn?.classList.remove("is-active");
        els.toolbarViewListBtn?.classList.add("is-active");
        els.folderItemsGrid?.classList.add("view-list");
        els.subfoldersGrid?.classList.add("view-list");
      }

      on(els.toolbarViewGridBtn, "click", () => {
        setState({ viewMode: "grid" });
        els.toolbarViewGridBtn?.classList.add("is-active");
        els.toolbarViewListBtn?.classList.remove("is-active");
        els.folderItemsGrid?.classList.remove("view-list");
        els.subfoldersGrid?.classList.remove("view-list");
        renderView();
      });

      on(els.toolbarViewListBtn, "click", () => {
        setState({ viewMode: "list" });
        els.toolbarViewListBtn?.classList.add("is-active");
        els.toolbarViewGridBtn?.classList.remove("is-active");
        els.folderItemsGrid?.classList.add("view-list");
        els.subfoldersGrid?.classList.add("view-list");
        renderView();
      });

      // Sort/filter via extracted component
      on(els.toolbarSortBtn, "click", (event) => {
        event.stopPropagation();
        toggleSortFilterDropdown(els);
      });

      const cleanupSortFilter = initSortFilter(els, {
        onSortChange(newSort) {
          sortMode = newSort;
          renderView();
        },
        onFilterChange(newFilter) {
          filterType = newFilter;
          renderView();
        },
      });
      disposers.push(cleanupSortFilter);

      // Inline search via extracted component
      const cleanupInlineSearch = initInlineSearchHandlers(els, {
        onInput(value) {
          scheduleSearchRefresh({ immediate: value.length === 0 });
        },
        onClear() {
          clearInlineSearch();
        },
        onKeydown(key) {
          if (key === "enter") {
            scheduleSearchRefresh({ immediate: true });
          }
        },
      });
      disposers.push(cleanupInlineSearch);

      // Save modal handlers
      const cleanupSaveModal = initSaveModalHandlers(els, {
        onClose() {
          closeSaveModal(els);
        },
        async onSubmit({ content, project, attachment: att }) {
          if (getState().loading) return;
          const rawContent = String(content || "").trim();
          if (!rawContent && !att?.fileDataUrl) {
            toast("Add content first", "error");
            return;
          }
          const selectedProject = String(project || folderMeta.name || "").trim();
          const inferred = att?.fileDataUrl
            ? { sourceType: att.isImage ? "image" : "file", sourceUrl: "" }
            : inferCaptureType(rawContent, null);
          const payload = {
            sourceType: inferred.sourceType,
            content: rawContent,
            sourceUrl: inferred.sourceUrl,
            project: selectedProject || folderMeta.name,
            imageDataUrl: att?.isImage ? att.fileDataUrl : null,
            fileDataUrl: att?.fileDataUrl || null,
            fileName: att?.name || "",
            fileMimeType: att?.fileMimeType || "",
          };
          setState({ loading: true });
          closeSaveModal(els);
          try {
            const saveResult = await apiClient.saveNote(payload);
            if (!isMounted) return;
            if (saveResult?.note) {
              const savedEntry = normalizeCitation(saveResult.note, 0);
              const savedId = String(savedEntry?.note?.id || "");
              const savedProject = String(savedEntry?.note?.project || "");
              if (savedId && savedProject === folderMeta.name) {
                const deduped = recentNotes.filter((entry) => String((entry?.note || entry)?.id || "") !== savedId);
                recentNotes = [savedEntry, ...deduped].slice(0, 120);
                setState({ notes: recentNotes });
                renderView();
              }
            }
            toast("Item saved");
            refreshNotes().catch(() => {});
          } catch (error) {
            if (!isMounted) return;
            const message = conciseTechnicalError(error, "Save endpoint unavailable");
            const validationLike = /missing content|invalid image|invalid file|invalid json|request failed \(4\d\d\)/i.test(message);
            if (validationLike) {
              toast("Save failed", "error");
            } else {
              const nextMock = [buildLocalFallbackNote(payload), ...getState().mockNotes];
              const activeQuery = (els.inlineSearchInput?.value || "").trim();
              recentNotes = filterAndRankMockNotes(nextMock, {
                project: folderMeta.name,
                limit: 120,
              });
              searchResults = activeQuery
                ? filterAndRankMockNotes(nextMock, {
                    query: activeQuery,
                    project: folderMeta.name,
                    limit: 120,
                  })
                : [];
              setState({ mockNotes: nextMock, notes: recentNotes });
              toast("Saved locally");
              renderView();
              apiClient.adapterLog("folder_save_fallback", message);
            }
          } finally {
            if (isMounted) setState({ loading: false });
          }
        },
      });
      disposers.push(cleanupSaveModal);

      on(els.refreshBtn, "click", async () => {
        await refreshNotes();
      });

      on(els.deleteFolderBtn, "click", async () => {
        await deleteCurrentFolder();
      });

      on(els.renameFolderBtn, "click", async () => {
        await renameFolder(
          {
            id: dbFolderMeta?.id || "",
            name: folderMeta.name,
            color: folderMeta.color,
            description: folderMeta.description,
            symbol: folderMeta.symbol,
          },
          { navigateAfterRename: true }
        );
      });

      on(els.newFolderBtn, "click", () => {
        openFolderModal(els);
      });

      // Folder modal handlers via extracted component
      const cleanupFolderModal = initFolderModalHandlers(els, {
        onClose() {
          closeFolderModal(els);
        },
        onColorSelect() {},
      });
      disposers.push(cleanupFolderModal);

      const cleanupMoveModal = initMoveModalHandlers(els, {
        onClose() {
          closeMoveModal(els);
          resolveMoveDialog(null);
        },
        onSubmit(value) {
          const target = String(value || "").trim();
          if (!target) {
            els.moveModalInput?.focus();
            return;
          }
          closeMoveModal(els);
          resolveMoveDialog(target);
        },
        onInput(value) {
          renderMoveModalSuggestions(els, listMoveFolderSuggestions(), value);
        },
        onSuggestionPick(value) {
          renderMoveModalSuggestions(els, listMoveFolderSuggestions(), value);
        },
      });
      disposers.push(cleanupMoveModal);

      on(els.folderForm, "submit", async (event) => {
        event.preventDefault();
        const name = String(els.folderNameInput?.value || "").trim();
        if (!name) { els.folderNameInput?.focus(); return; }
        const description = String(els.folderDescriptionInput?.value || "").trim();
        const color = getSelectedFolderColor(els);
        const parentId = dbFolderMeta?.id || null;
        try {
          await apiClient.createFolder({ name, description, color, parentId });
          closeFolderModal(els);
          toast("Folder created");
          await refreshNotes();
        } catch (err) {
          toast("Failed to create folder", "error");
        }
      });

      // Item modal handlers via extracted component
      const cleanupItemModal = initItemModalHandlers(els, {
        onClose() {
          closeItemModal(els);
        },
        async onSave(noteId, payload) {
          try {
            await apiClient.updateNote(noteId, payload);
            if (!isMounted) return;
            closeItemModal(els);
            toast("Note updated");
            await refreshNotes();
          } catch (error) {
            if (!isMounted) return;
            toast(conciseTechnicalError(error, "Update failed"), "error");
          }
        },
        async onAddComment(noteId, text) {
          try {
            const result = await apiClient.addNoteComment(noteId, { text });
            if (!isMounted) return null;
            const normalizedId = String(noteId || "");
            let updated = null;
            if (result?.note) {
              recentNotes = recentNotes.map((entry, index) => {
                const normalized = normalizeCitation(entry, index).note;
                if (String(normalized.id || "") !== normalizedId) return entry;
                updated = normalizeCitation(result.note, 0).note;
                if (entry?.note) {
                  return { ...entry, note: updated };
                }
                return updated;
              });
              if (updated) {
                setState({ notes: recentNotes });
                renderView();
              }
            }
            toast("Comment added");
            return updated;
          } catch (error) {
            if (!isMounted) return null;
            toast(conciseTechnicalError(error, "Comment failed"), "error");
            throw error;
          }
        },
        onChatAbout(note) {
          closeItemModal(els);
          shell.chatPanel?.startFromNote?.(note);
        },
      });
      disposers.push(cleanupItemModal);

      const cleanupKeyboard = initKeyboardShortcuts({
        onSearch() {
          const searchWrap = mountNode.querySelector(".inline-search");
          if (searchWrap) searchWrap.classList.add("is-visible");
          els.inlineSearchInput?.focus();
        },
        onComposer() {
          els.chatPanelInput?.focus();
        },
        onEscape() {
          if ((els.inlineSearchInput?.value || "").trim()) {
            clearInlineSearch();
          }
          closeAllActionMenus(mountNode);
          els.toolbarNewMenu?.classList.add("hidden");
          closeItemModal(els);
          closeFolderModal(els);
          closeMoveModal(els);
          resolveMoveDialog(null);
        },
      });

      function showSkeletons() {
        if (els.recentNotesList) {
          els.recentNotesList.innerHTML = Array.from({ length: 5 }, () =>
            `<div class="recent-inline-skeleton skeleton-pulse" aria-hidden="true"></div>`
          ).join('');
        }
        if (els.folderItemsGrid) {
          els.folderItemsGrid.innerHTML = Array.from({ length: 6 }, () =>
            `<div class="skeleton-card skeleton-pulse"></div>`
          ).join('');
        }
      }
      showSkeletons();

      await refreshNotes();
      ensureDraftFolder(folderMeta.name);

      // Subscribe to SSE for real-time enrichment updates
      function updateRecentNoteById(noteId, patchNote) {
        const normalizedId = String(noteId || "").trim();
        if (!normalizedId) return false;
        let changed = false;

        for (let i = 0; i < recentNotes.length; i++) {
          const entry = recentNotes[i];
          const noteObj = entry?.note || entry;
          if (String(noteObj?.id || "") !== normalizedId) continue;
          const nextNote = patchNote(noteObj);
          if (entry?.note) {
            recentNotes[i] = { ...entry, note: nextNote };
          } else {
            recentNotes[i] = nextNote;
          }
          changed = true;
          break;
        }

        return changed;
      }

      const unsubscribeSSE = apiClient.subscribeToEvents?.((event) => {
        if (!isMounted) return;
        if (event.type === "job:start" && event.id) {
          const changed = updateRecentNoteById(event.id, (noteObj) => ({ ...noteObj, status: "enriching" }));
          if (!changed) return;
          setState({ notes: recentNotes });
          renderView();
          return;
        }

        if (event.type === "job:error" && event.id) {
          const changed = updateRecentNoteById(event.id, (noteObj) => ({
            ...noteObj,
            status: "failed",
            metadata: {
              ...(noteObj.metadata || {}),
              enrichmentError: String(event.error || ""),
            },
          }));
          if (!changed) return;
          setState({ notes: recentNotes });
          renderView();
          return;
        }

        if (event.type === "job:complete" && event.result) {
          const enrichedNote = event.result;
          if (enrichedNote.project !== folderMeta.name) return;
          const changed = updateRecentNoteById(enrichedNote.id, (noteObj) => ({
            ...noteObj,
            ...enrichedNote,
            status: "ready",
          }));
          if (!changed) return;
          setState({ notes: recentNotes });
          renderView();
        }
      });

      return () => {
        isMounted = false;
        cleanupKeyboard();
        if (unsubscribeSSE) unsubscribeSSE();
        const state = getState();
        if (state.toastTimer) {
          clearTimeout(state.toastTimer);
          setState({ toastTimer: null });
        }
        if (searchTimer) {
          clearTimeout(searchTimer);
          searchTimer = null;
        }
        closeItemModal(els);
        closeFolderModal(els);
        closeMoveModal(els);
        resolveMoveDialog(null);
        document.body.classList.remove("batch-mode-active");
        // Clear shell callbacks
        shell.setToast(null);
        shell.setOnOpenCitation(null);
        disposers.forEach((dispose) => {
          dispose();
        });
      };
    },
  };
}
