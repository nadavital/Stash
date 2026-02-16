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
} from "../components/move-modal/move-modal.js";
import { createMoveDialogController } from "../services/move-dialog.js";
import {
  renderSaveModalHTML,
  querySaveModalEls,
  openSaveModal,
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
import { closeAllActionMenus } from "../components/action-menu/action-menu.js";
import {
  normalizeFolderColor,
  fallbackColorForFolder,
  normalizeFolderDrafts,
  normalizeFolderSymbol,
  resolveFolderMeta,
} from "../services/folder-utils.js";
import { createBatchSelectController } from "../services/batch-select.js";
import { createFolderCrudController } from "../services/folder-crud.js";
import {
  renderContentToolbarHTML,
  queryContentToolbarEls,
} from "../components/content-toolbar/content-toolbar.js";
import { initKeyboardShortcuts } from "../services/keyboard.js";
import {
  applySortFilter,
  conciseTechnicalError,
  normalizeCitation,
} from "../services/mappers.js";
import { createFallbackStateManager } from "../services/fallback-state.js";
import { createSaveModalController } from "../services/save-modal-controller.js";
import { createItemModalController } from "../services/item-modal-controller.js";
import { createNoteCrudController } from "../services/note-crud.js";
import { renderNoteTiles } from "../services/render-note-tiles.js";
import { renderRecentNoteStrip } from "../services/render-recent-strip.js";
import { renderSubfolders } from "../services/render-subfolders.js";
import { subscribeNoteEnrichment } from "../services/sse-notes.js";
import { createViewToggleController } from "../services/view-toggle.js";

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
      let hasMoreNotes = false;
      let currentOffset = 0;
      const PAGE_SIZE = 20;
      let dbFolderMeta = null;

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

      const moveDialog = createMoveDialogController(els, {
        getSuggestions: () => {
          const currentKey = String(folderMeta.name || "").trim().toLowerCase();
          return listAllFolderNames().filter((n) => n.toLowerCase() !== currentKey);
        },
      });
      disposers.push(() => moveDialog.cleanup());
      const openMoveDialog = (opts) => moveDialog.open(opts);

      function markAccessed(noteId) {
        if (!noteId) return;
        const state = getState();
        const set = new Set(state.accessedIds || []);
        set.add(String(noteId));
        setState({ accessedIds: [...set] });
      }

      function toast(message, tone = "success") {
        showToast(message, tone, store);
      }

      // Register shell callbacks
      shell.setToast(toast);
      shell.setOnOpenCitation((note) => {
        if (!note) return;
        markAccessed(note.id);
        navigate(`#/item/${note.id}`);
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

      const fallbackState = createFallbackStateManager({
        store,
        getActiveQuery: () => (els.inlineSearchInput?.value || "").trim(),
        setRecentNotes: (notes) => { recentNotes = notes; },
        setSearchResults: (results) => { searchResults = results; },
        renderView,
        filterProject: folderMeta.name,
      });

      function removeFolderFromFallback() {
        const normalizedFolder = String(folderMeta.name || "").trim().toLowerCase();
        const nextMock = (Array.isArray(getState().mockNotes) ? getState().mockNotes : []).filter((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          return String(note.project || "").trim().toLowerCase() !== normalizedFolder;
        });
        setState({ mockNotes: nextMock, notes: [] });
      }

      const folderCrud = createFolderCrudController({
        apiClient,
        store,
        toast,
        refreshNotes: () => refreshNotes(),
        isMounted: () => isMounted,
        openMoveDialog,
        onRenameFallback: (o, n) => fallbackState.renameFolder(o, n),
        onDeleteFallback: () => removeFolderFromFallback(),
      });
      const { renameFolder, deleteFolder: deleteFolderEntry, ensureDraftFolder } = folderCrud;

      const { deleteNote: deleteNoteById } = createNoteCrudController({
        apiClient,
        toast,
        refreshNotes: () => refreshNotes(),
        isMounted: () => isMounted,
        removeFromFallback: (id) => fallbackState.removeNote(id),
        beforeDelete: () => closeItemModal(els),
      });

      async function deleteCurrentFolder() {
        closeItemModal(els);
        await deleteFolderEntry(
          { id: dbFolderMeta?.id || "", name: folderMeta.name, color: folderMeta.color, description: folderMeta.description, symbol: folderMeta.symbol },
          { navigate, isCurrentFolder: true },
        );
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

      function renderSubfoldersView() {
        renderSubfolders(els.subfoldersSection, els.subfoldersGrid, subFolders, {
          viewMode: getState().viewMode || "grid",
          onOpen: (folder) => navigate(`#/folder/${encodeURIComponent(folder.name)}`),
          onRename: (folder) => renameFolder(folder),
          onDelete: (folder) => deleteFolderEntry(folder, { navigate }),
        });
      }

      function renderFolderItems(items) {
        renderNoteTiles(els.folderItemsGrid, items, {
          viewMode: getState().viewMode || "grid",
          selectMode: isSelectMode(),
          selectedIds: getSelectedIds(),
          hasMore: hasMoreNotes,
          onOpen(note) {
            markAccessed(note.id);
            navigate(`#/item/${note.id}`);
          },
          async onMove(noteId) {
            const target = await openMoveDialog({
              title: "Move item to folder",
              confirmLabel: "Move",
            });
            if (!target) return;
            try {
              await apiClient.batchMoveNotes([noteId], target);
              toast("Moved");
              await refreshNotes();
            } catch {
              toast("Move failed", "error");
            }
          },
          onDelete(noteId) {
            deleteNoteById(noteId);
          },
          onToggleSelect(noteId, tileShell) {
            toggleNoteSelection(noteId);
            tileShell.classList.toggle("is-selected", getSelectedIds().has(String(noteId)));
            const cb = tileShell.querySelector(".batch-select-checkbox");
            if (cb) cb.checked = getSelectedIds().has(String(noteId));
          },
          async onLoadMore() {
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
          },
        });
      }

      function renderRecent() {
        renderRecentNoteStrip(
          els.recentNotesList,
          Array.isArray(recentNotes) ? recentNotes : [],
          {
            onOpen(note) { markAccessed(note.id); navigate(`#/item/${note.id}`); },
            limit: 12,
          },
        );
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

        renderSubfoldersView();
        renderFolderItems(applySortFilter(recentNotes, { sortMode, filterType }));
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
          fallbackState.refresh();
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
      const batchSelect = createBatchSelectController({
        els,
        mountNode,
        pageClass: "page-folder",
        apiClient,
        toast,
        openMoveDialog,
        refreshNotes: () => refreshNotes(),
        isMounted: () => isMounted,
        renderView,
      });
      disposers.push(() => batchSelect.cleanup());
      const { toggleNoteSelection, isSelectMode, getSelectedIds } = batchSelect;

      // View toggle via extracted controller
      const viewToggle = createViewToggleController({
        els,
        store,
        containers: [els.folderItemsGrid, els.subfoldersGrid],
        renderView,
      });
      disposers.push(() => viewToggle.cleanup());

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

      // Save modal via extracted controller
      const { cleanup: cleanupSaveModal } = createSaveModalController({
        els,
        apiClient,
        store,
        toast,
        isMounted: () => isMounted,
        getNotes: () => recentNotes,
        setNotes: (next) => { recentNotes = next; setState({ notes: recentNotes }); },
        renderView,
        refreshNotes: () => refreshNotes(),
        defaultProject: folderMeta.name,
        shouldInsert: (entry) => String(entry?.note?.project || "") === folderMeta.name,
        fallbackState,
        logLabel: "folder_save_fallback",
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
          { navigateAfterRename: true, navigate }
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

      // Item modal handlers via extracted controller
      const { cleanup: cleanupItemModal } = createItemModalController({
        els,
        apiClient,
        toast,
        isMounted: () => isMounted,
        refreshNotes: () => refreshNotes(),
        getNotes: () => recentNotes,
        setNotes: (next) => { recentNotes = next; setState({ notes: recentNotes }); },
        renderView,
        onChatAbout: (note) => shell.chatPanel?.startFromNote?.(note),
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
          moveDialog.cleanup();
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
      const unsubscribeSSE = subscribeNoteEnrichment({
        apiClient,
        getNotes: () => recentNotes,
        setNotes: (next) => { recentNotes = next; setState({ notes: recentNotes }); renderView(); },
        isMounted: () => isMounted,
        shouldAccept: (enrichedNote) => enrichedNote.project === folderMeta.name,
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
