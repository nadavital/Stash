import { renderHomeFolderGrid } from "../components/home-folder-grid/home-folder-grid.js";
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
  normalizeFolderDrafts,
} from "../services/folder-utils.js";
import { createBatchSelectController } from "../services/batch-select.js";
import { createFolderCrudController } from "../services/folder-crud.js";
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
import { renderFolderCards } from "../services/render-folder-cards.js";
import { renderRecentNoteStrip } from "../services/render-recent-strip.js";
import { subscribeNoteEnrichment } from "../services/sse-notes.js";
import { createViewToggleController } from "../services/view-toggle.js";



function renderHomePageContent() {
  return `
    <section class="page page-home" style="position:relative;">
      ${renderSortFilterHTML()}

      <div class="home-explorer-pane">
        ${renderInlineSearchHTML()}
        ${renderRecentInlineStripHTML({ title: "Recently Added" })}
        <div class="home-section-header">
          <h2 class="home-section-title" style="margin:0;font-size:var(--font-size-body-sm);font-weight:var(--weight-medium);color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;">Collections</h2>
          <button id="home-edit-btn" class="folder-subfolder-btn" type="button">Edit</button>
        </div>
        ${renderHomeFolderGrid()}
      </div>
    </section>

    <div id="batch-action-bar" class="batch-action-bar hidden">
      <span id="batch-action-count" class="batch-action-count">0 selected</span>
      <button id="batch-move-btn" class="batch-action-btn" type="button">Move to...</button>
      <button id="batch-delete-btn" class="batch-action-btn batch-action-btn--danger" type="button">Delete All</button>
      <button id="batch-cancel-btn" class="batch-action-btn batch-cancel-btn" type="button">Cancel</button>
    </div>

    ${renderItemModalHTML()}

    ${renderFolderModalHTML({ showKindRow: true })}

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

  return {
    ...itemModalEls,
    ...folderModalEls,
    ...moveModalEls,
    ...saveModalEls,
    ...inlineSearchEls,
    ...sortFilterEls,
    recentNotesList: mountNode.querySelector("#recent-notes-list"),
    refreshBtn: mountNode.querySelector("#refresh-btn"),
    foldersList: mountNode.querySelector("#home-folders-list"),
    foldersEmpty: mountNode.querySelector("#home-folders-empty"),
    foldersError: mountNode.querySelector("#home-folders-error"),
    homeEditBtn: mountNode.querySelector("#home-edit-btn"),
    batchActionBar: mountNode.querySelector("#batch-action-bar"),
    batchActionCount: mountNode.querySelector("#batch-action-count"),
    batchDeleteBtn: mountNode.querySelector("#batch-delete-btn"),
    batchMoveBtn: mountNode.querySelector("#batch-move-btn"),
    batchCancelBtn: mountNode.querySelector("#batch-cancel-btn"),
    toast: document.getElementById("toast"),
  };
}

export function createHomePage({ store, apiClient, auth = null, shell }) {
  return {
    async mount({ mountNode, navigate }) {
      mountNode.innerHTML = renderHomePageContent();
      const pageEls = queryPageElements(mountNode);
      const els = { ...shell.els, ...pageEls };

      const disposers = [];
      let isMounted = true;
      let searchTimer = null;
      let modalCreateKind = "folder";
      let recentNotes = [];
      let searchResults = [];
      let sortMode = "newest";
      let filterType = "all";
      let dbFolders = [];
      let hasMoreNotes = false;
      let currentOffset = 0;
      const PAGE_SIZE = 20;

      function on(target, eventName, handler, options) {
        if (!target) return;
        target.addEventListener(eventName, handler, options);
        disposers.push(() => target.removeEventListener(eventName, handler, options));
      }

      on(document, "click", () => {
        closeAllActionMenus(mountNode);
      });

      function getState() {
        return store.getState();
      }

      function setState(patch) {
        return store.setState(patch);
      }

      function listAllFolderNames() {
        const names = new Set();
        dbFolders.forEach((f) => {
          const n = String(f?.name || "").trim();
          if (n) names.add(n);
        });
        normalizeFolderDrafts(getState().draftFolders).forEach((f) => {
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
        getSuggestions: () => listAllFolderNames(),
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
      shell.setOnWorkspaceAction((action) => {
        const phase = String(action?.phase || "").trim().toLowerCase();
        if (phase && phase !== "done") return;
        refreshNotes();
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

      function setSearchQuery(value) {
        const nextValue = String(value ?? "");
        if (els.inlineSearchInput && els.inlineSearchInput.value !== nextValue) {
          els.inlineSearchInput.value = nextValue;
        }
      }

      function setFallbackHint(active) {
        if (!els.foldersError) return;
        els.foldersError.classList.toggle("hidden", !active);
      }

      const fallbackState = createFallbackStateManager({
        store,
        getActiveQuery: () => (els.inlineSearchInput?.value || "").trim(),
        setRecentNotes: (notes) => { recentNotes = notes; },
        setSearchResults: (results) => { searchResults = results; },
        renderView,
        onFallbackHint: setFallbackHint,
      });

      const { deleteNote: deleteNoteById } = createNoteCrudController({
        apiClient,
        toast,
        refreshNotes: () => refreshNotes(),
        isMounted: () => isMounted,
        removeFromFallback: (id) => fallbackState.removeNote(id),
        beforeDelete: () => closeItemModal(els),
      });

      const folderCrud = createFolderCrudController({
        apiClient,
        store,
        toast,
        refreshNotes: () => refreshNotes(),
        isMounted: () => isMounted,
        openMoveDialog,
        clearInlineSearch,
        onRenameFallback: (o, n) => fallbackState.renameFolder(o, n),
        onDeleteFallback: (f) => fallbackState.removeFolder(f),
      });
      const { renameFolder, deleteFolder, upsertDraftFolder } = folderCrud;

      function renderFolders() {
        renderFolderCards(els.foldersList, els.foldersEmpty, {
          dbFolders,
          draftFolders: normalizeFolderDrafts(getState().draftFolders),
          recentNotes,
          viewMode: getState().viewMode || "grid",
          onOpen: (folder) => navigate(`#/folder/${encodeURIComponent(folder.name)}`),
          onRename: (folder) => renameFolder(folder),
          onDelete: (folder) => deleteFolder(folder),
        });
      }

      function renderRecent() {
        renderRecentNoteStrip(
          els.recentNotesList,
          applySortFilter(Array.isArray(recentNotes) ? recentNotes : [], { sortMode, filterType }),
          {
            onOpen(note) { markAccessed(note.id); navigate(`#/item/${note.id}`); },
            limit: 12,
          },
        );
      }

      function renderInlineSearchResults() {
        if (!els.foldersList) return;
        const query = String(els.inlineSearchInput?.value || "").trim();
        if (!query) return;

        renderSearchResults(els.foldersList, searchResults, {
          onOpen(note) {
            openItemModal(els, note);
            markAccessed(note.id);
            renderRecent();
          },
          onDelete(noteId) {
            deleteNoteById(noteId);
          },
        });
      }

      function clearInlineSearch() {
        setSearchQuery("");
        scheduleSearchRefresh({ immediate: true });
      }

      function renderView() {
        const query = String(els.inlineSearchInput?.value || "").trim();

        if (query) {
          if (els.foldersEmpty) els.foldersEmpty.classList.add("hidden");
          renderInlineSearchResults();
          renderRecent();
          return;
        }

        renderFolders();
        renderRecent();
      }

      async function refreshNotes() {
        const query = (els.inlineSearchInput?.value || "").trim();
        const includeSearch = Boolean(query);
        currentOffset = 0;

        try {
          const requests = [apiClient.fetchNotes({ limit: PAGE_SIZE })];
          if (includeSearch) {
            requests.push(apiClient.fetchNotes({ query, limit: 120 }));
          }
          requests.push(apiClient.fetchFolders());

          const results = await Promise.allSettled(requests);
          const recentResult = results[0];
          const searchResult = includeSearch ? results[1] : null;
          const foldersResult = includeSearch ? results[2] : results[1];

          if (recentResult.status !== "fulfilled") throw recentResult.reason;

          if (!isMounted) return;
          recentNotes = Array.isArray(recentResult.value?.items) ? recentResult.value.items : [];
          hasMoreNotes = recentResult.value?.hasMore || false;
          searchResults =
            includeSearch && searchResult?.status === "fulfilled" && Array.isArray(searchResult.value?.items)
              ? searchResult.value.items
              : [];
          setState({ notes: recentNotes });
          dbFolders =
            foldersResult?.status === "fulfilled" && Array.isArray(foldersResult.value?.items)
              ? foldersResult.value.items.filter((f) => !f.parentId)
              : [];
          setFallbackHint(false);
          renderView();
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Notes endpoint unavailable");
          fallbackState.refresh({ hint: true });
          apiClient.adapterLog("notes_fallback", message);
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

      function setFolderModalKind(kind) {
        modalCreateKind = kind === "task" ? "task" : "folder";
        const isTask = modalCreateKind === "task";

        els.folderModal.dataset.createKind = modalCreateKind;
        if (els.folderModalHeading) {
          els.folderModalHeading.textContent = isTask ? "New Task" : "New Folder";
        }
        if (els.folderNameLabel) {
          els.folderNameLabel.textContent = isTask ? "Task title" : "Name";
        }
        if (els.folderNameInput) {
          els.folderNameInput.placeholder = isTask ? "e.g. Follow up with design team" : "e.g. Launch Plan";
        }
        if (els.folderDescriptionWrap) {
          els.folderDescriptionWrap.classList.toggle("hidden", isTask);
        }
        if (els.folderStyleWrap) {
          els.folderStyleWrap.classList.toggle("hidden", isTask);
        }
        if (els.folderCreateBtn) {
          els.folderCreateBtn.textContent = isTask ? "Create Task" : "Create Folder";
        }
        if (els.folderKindFolder) {
          const selected = !isTask;
          els.folderKindFolder.classList.toggle("is-selected", selected);
          els.folderKindFolder.setAttribute("aria-pressed", selected ? "true" : "false");
        }
        if (els.folderKindTask) {
          const selected = isTask;
          els.folderKindTask.classList.toggle("is-selected", selected);
          els.folderKindTask.setAttribute("aria-pressed", selected ? "true" : "false");
        }
      }

      // Batch select mode
      const batchSelect = createBatchSelectController({
        els,
        mountNode,
        pageClass: "page-home",
        apiClient,
        toast,
        openMoveDialog,
        refreshNotes: () => refreshNotes(),
        isMounted: () => isMounted,
        renderView,
      });
      disposers.push(() => batchSelect.cleanup());

      // Edit button → toggle select mode
      function syncEditBtnLabel() {
        if (els.homeEditBtn) {
          els.homeEditBtn.textContent = batchSelect.isSelectMode() ? "Done" : "Edit";
        }
      }
      on(els.homeEditBtn, "click", () => {
        batchSelect.toggleSelectMode();
        syncEditBtnLabel();
      });
      on(els.batchCancelBtn, "click", () => {
        syncEditBtnLabel();
      });

      // View toggle via extracted controller
      const viewToggle = createViewToggleController({
        els,
        store,
        containers: [els.foldersList],
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
        fallbackState,
        logLabel: "save_fallback",
      });
      disposers.push(cleanupSaveModal);

      on(els.refreshBtn, "click", async () => {
        await refreshNotes();
      });

      on(els.folderKindRow, "click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest(".folder-kind-choice");
        if (!(button instanceof HTMLButtonElement)) return;
        setFolderModalKind(button.dataset.kind || "folder");
      });

      // Folder modal handlers via extracted component
      const cleanupFolderModal = initFolderModalHandlers(els, {
        onClose() {
          closeFolderModal(els);
        },
        onColorSelect() {},
      });
      disposers.push(cleanupFolderModal);

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

      on(els.folderForm, "submit", async (event) => {
        event.preventDefault();

        const name = String(els.folderNameInput?.value || "").trim();
        if (!name) {
          els.folderNameInput?.focus();
          return;
        }

        if (modalCreateKind === "task") {
          try {
            await apiClient.createTask({
              title: name,
              status: "open",
            });
            closeFolderModal(els);
            toast("Task created");
            await refreshNotes();
          } catch (error) {
            toast("Task save failed", "error");
          }
          return;
        }

        const description = String(els.folderDescriptionInput?.value || "").trim();
        const color = getSelectedFolderColor(els);

        try {
          await apiClient.createFolder({ name, description, color });
        } catch {
          upsertDraftFolder({ name, description, color });
        }
        closeFolderModal(els);
        navigate(`#/folder/${encodeURIComponent(name)}`);
      });

      setFolderModalKind("folder");

      function showSkeletons() {
        if (els.recentNotesList) {
          els.recentNotesList.innerHTML = Array.from({ length: 5 }, () =>
            `<div class="recent-inline-skeleton skeleton-pulse" aria-hidden="true"></div>`
          ).join('');
        }
      }
      showSkeletons();

      await refreshNotes();

      // Global keyboard shortcuts
      const cleanupKeyboard = initKeyboardShortcuts({
        onSearch: () => {
          const searchWrap = mountNode.querySelector(".inline-search");
          if (searchWrap) searchWrap.classList.add("is-visible");
          els.inlineSearchInput?.focus();
        },
        onComposer: () => {
          els.chatPanelInput?.focus();
        },
        onEscape: () => {
          if ((els.inlineSearchInput?.value || "").trim()) {
            clearInlineSearch();
          }
          closeAllActionMenus(mountNode);
          closeItemModal(els);
          closeFolderModal(els);
          moveDialog.cleanup();
        },
      });

      // Subscribe to SSE for real-time enrichment updates
      const unsubscribeSSE = subscribeNoteEnrichment({
        apiClient,
        getNotes: () => recentNotes,
        setNotes: (next) => { recentNotes = next; setState({ notes: recentNotes }); renderView(); },
        isMounted: () => isMounted,
      });

      return () => {
        isMounted = false;
        if (unsubscribeSSE) unsubscribeSSE();
        if (cleanupKeyboard) cleanupKeyboard();
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
        shell.setOnWorkspaceAction(null);
        disposers.forEach((dispose) => {
          dispose();
        });
      };
    },
  };
}
