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
  relativeTime,
} from "../services/note-utils.js";


/* ── Paper card helpers for folder tissue-box ─────────── */

const PAPER_TYPE_ICONS = {
  text: "📝",
  link: "🔗",
  image: "🖼️",
  file: "📄",
};

/** Extract best available HTTP image URL from a note object */
function getNoteImageUrl(note) {
  if (!note) return "";
  const candidates = [
    note.imagePath,
    note.metadata?.ogImage,
    note.metadata?.imageUrl,
  ];
  for (const url of candidates) {
    if (url && typeof url === "string" && url.startsWith("http")) return url;
  }
  return "";
}

/** Create a paper DOM element with content from a note */
function createPaperElement(layout, note) {
  const paper = document.createElement("div");
  paper.className = "folder-paper";
  paper.style.setProperty("--pw", layout.w);
  paper.style.setProperty("--ph", layout.h + "px");
  paper.style.setProperty("--pl", layout.l || "auto");
  paper.style.setProperty("--pr", layout.r || "auto");
  paper.style.setProperty("--prot", layout.rot + "deg");

  if (!note) return paper;

  // Try image first — use <img> for lazy loading + error handling
  const imageUrl = getNoteImageUrl(note);
  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "folder-paper-img";
    img.src = imageUrl;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    // On error, remove img and show icon+text fallback instead
    img.onerror = () => {
      img.remove();
      paper.appendChild(buildPaperFallbackContent(note));
    };
    paper.appendChild(img);
    return paper;
  }

  // Fallback: icon + text snippet
  paper.appendChild(buildPaperFallbackContent(note));
  return paper;
}

/** Build icon + text content for a paper without an image */
function buildPaperFallbackContent(note) {
  const content = document.createElement("div");
  content.className = "folder-paper-content";

  const noteType = iconTypeFor(note);
  const icon = document.createElement("span");
  icon.className = "folder-paper-icon";
  icon.textContent = PAPER_TYPE_ICONS[noteType] || "📌";
  content.appendChild(icon);

  const title = buildNoteTitle(note);
  if (title) {
    const text = document.createElement("span");
    text.className = "folder-paper-text";
    text.textContent = title.length > 40 ? title.slice(0, 40) + "…" : title;
    content.appendChild(text);
  }

  return content;
}

/**
 * Paper layout configs for 1–4 papers in a folder card.
 * More papers = each one is narrower/shorter to fit side-by-side.
 * Properties: w (width), h (height px), l (left), r (right), rot (degrees)
 */
function getPaperLayouts(count) {
  switch (count) {
    case 1:
      return [
        { w: "52%", h: 160, l: "24%", r: null, rot: -3 },
      ];
    case 2:
      return [
        { w: "48%", h: 165, l: "8%",  r: null, rot: -5 },
        { w: "46%", h: 155, l: null,   r: "8%", rot: 4 },
      ];
    case 3:
      return [
        { w: "40%", h: 158, l: "3%",  r: null, rot: -7 },
        { w: "36%", h: 150, l: "32%", r: null, rot: 1 },
        { w: "40%", h: 154, l: null,  r: "3%", rot: 6 },
      ];
    case 4:
      return [
        { w: "34%", h: 152, l: "1%",  r: null, rot: -8 },
        { w: "30%", h: 144, l: "20%", r: null, rot: -2 },
        { w: "30%", h: 148, l: null,  r: "18%", rot: 3 },
        { w: "34%", h: 140, l: null,  r: "1%", rot: 7 },
      ];
    default:
      return [];
  }
}

function renderHomePageContent() {
  return `
    <section class="page page-home" style="position:relative;">
      ${renderSortFilterHTML()}

      <div class="home-explorer-pane">
        ${renderContentToolbarHTML()}
        ${renderInlineSearchHTML()}
        ${renderRecentInlineStripHTML({ title: "Recent" })}
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
    foldersList: mountNode.querySelector("#home-folders-list"),
    foldersEmpty: mountNode.querySelector("#home-folders-empty"),
    foldersError: mountNode.querySelector("#home-folders-error"),
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
      let selectMode = false;
      const selectedIds = new Set();
      let hasMoreNotes = false;
      let currentOffset = 0;
      let moveModalResolver = null;
      const PAGE_SIZE = 20;

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

      function resolveMoveDialog(value) {
        if (!moveModalResolver) return;
        const resolver = moveModalResolver;
        moveModalResolver = null;
        resolver(value);
      }

      function listMoveFolderSuggestions() {
        const values = new Set();

        dbFolders.forEach((folder) => {
          const name = String(folder?.name || "").trim();
          if (name) values.add(name);
        });

        normalizeFolderDrafts(getState().draftFolders).forEach((folder) => {
          const name = String(folder?.name || "").trim();
          if (name) values.add(name);
        });

        recentNotes.forEach((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          const name = String(note?.project || "").trim();
          if (name) values.add(name);
        });

        return [...values].sort((a, b) => a.localeCompare(b));
      }

      function openMoveDialog({ title = "Move to folder", confirmLabel = "Move", initialValue = "" } = {}) {
        if (moveModalResolver) {
          resolveMoveDialog(null);
        }

        openMoveModal(els, {
          title,
          confirmLabel,
          value: initialValue,
          suggestions: listMoveFolderSuggestions(),
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

      function upsertDraftFolder({ name, description = "", color = "green" }) {
        const normalizedName = String(name || "").trim();
        if (!normalizedName) return;

        const normalizedDescription = String(description || "").trim();
        const normalizedColor = normalizeFolderColor(color, fallbackColorForFolder(normalizedName));
        const drafts = normalizeFolderDrafts(getState().draftFolders);
        const key = normalizedName.toLowerCase();
        const index = drafts.findIndex((entry) => entry.name.toLowerCase() === key);

        if (index >= 0) {
          drafts[index] = {
            ...drafts[index],
            name: normalizedName,
            description: normalizedDescription || drafts[index].description || "",
            color: normalizedColor,
          };
        } else {
          drafts.push({
            name: normalizedName,
            description: normalizedDescription,
            color: normalizedColor,
          });
        }

        setState({ draftFolders: drafts });
      }

      function removeDraftFolder(name) {
        const normalizedName = String(name || "").trim().toLowerCase();
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
        openSaveModal(els, { folders: listAllFolderNames() });
      });
      on(els.toolbarNewFolderBtn, "click", () => {
        els.toolbarNewMenu?.classList.add("hidden");
        openFolderModal(els, { color: "green", kind: "folder" });
        setFolderModalKind("folder");
      });
      on(els.toolbarNewTaskBtn, "click", () => {
        els.toolbarNewMenu?.classList.add("hidden");
        openFolderModal(els, { color: "green", kind: "task" });
        setFolderModalKind("task");
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

      function setFallbackHint(active) {
        if (!els.foldersError) return;
        els.foldersError.classList.toggle("hidden", !active);
      }

      function removeNoteFromFallback(noteId) {
        const normalizedId = String(noteId || "").trim();
        if (!normalizedId) return;
        const nextMock = (Array.isArray(getState().mockNotes) ? getState().mockNotes : []).filter(
          (entry, index) => normalizeCitation(entry, index).note.id !== normalizedId
        );
        const activeQuery = (els.inlineSearchInput?.value || "").trim();
        recentNotes = filterAndRankMockNotes(nextMock, { limit: 120 });
        searchResults = activeQuery ? filterAndRankMockNotes(nextMock, { query: activeQuery, limit: 120 }) : [];
        setState({ mockNotes: nextMock, notes: recentNotes });
        setFallbackHint(true);
        renderView();
      }

      function removeFolderFromFallback(folderName) {
        const normalizedName = String(folderName || "").trim().toLowerCase();
        if (!normalizedName) return;
        const nextMock = (Array.isArray(getState().mockNotes) ? getState().mockNotes : []).filter((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          return String(note.project || "").trim().toLowerCase() !== normalizedName;
        });
        const activeQuery = (els.inlineSearchInput?.value || "").trim();
        recentNotes = filterAndRankMockNotes(nextMock, { limit: 120 });
        searchResults = activeQuery ? filterAndRankMockNotes(nextMock, { query: activeQuery, limit: 120 }) : [];
        setState({ mockNotes: nextMock, notes: recentNotes });
        setFallbackHint(true);
        renderView();
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
          apiClient.adapterLog("delete_note_fallback", message);
        }
      }

      function renameDraftFolderName(oldName, nextName, { color = "", description = "" } = {}) {
        const normalizedOld = String(oldName || "").trim().toLowerCase();
        const normalizedNext = String(nextName || "").trim();
        if (!normalizedOld || !normalizedNext) return;

        const drafts = normalizeFolderDrafts(getState().draftFolders);
        const oldDraft = drafts.find((entry) => entry.name.toLowerCase() === normalizedOld);
        const baseColor = normalizeFolderColor(color || oldDraft?.color, fallbackColorForFolder(normalizedNext));
        const baseDescription = String(description || oldDraft?.description || "").trim();
        const withoutOld = drafts.filter((entry) => entry.name.toLowerCase() !== normalizedOld);
        const existingIndex = withoutOld.findIndex((entry) => entry.name.toLowerCase() === normalizedNext.toLowerCase());

        if (existingIndex >= 0) {
          withoutOld[existingIndex] = {
            ...withoutOld[existingIndex],
            color: withoutOld[existingIndex].color || baseColor,
            description: withoutOld[existingIndex].description || baseDescription,
          };
        } else {
          withoutOld.push({
            name: normalizedNext,
            color: baseColor,
            description: baseDescription,
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

        const activeQuery = (els.inlineSearchInput?.value || "").trim();
        recentNotes = filterAndRankMockNotes(nextMock, { limit: 120 });
        searchResults = activeQuery ? filterAndRankMockNotes(nextMock, { query: activeQuery, limit: 120 }) : [];
        setState({ mockNotes: nextMock, notes: recentNotes });
        renderView();
      }

      async function renameFolder(folderEntry) {
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
          clearInlineSearch();
          toast(
            movedCount > 0
              ? `Renamed folder and moved ${movedCount} item${movedCount === 1 ? "" : "s"}`
              : "Folder renamed"
          );
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Folder rename endpoint unavailable");
          renameDraftFolderName(oldName, nextName, folder);
          renameFolderInFallback(oldName, nextName);
          toast("Folder renamed locally");
          apiClient.adapterLog("rename_folder_fallback", message);
        }
      }

      async function deleteFolder(folderEntry) {
        const folder = folderEntry || {};
        const normalizedFolder = String(folder.name || "").trim();
        if (!normalizedFolder) return;

        const confirmed = window.confirm(`Delete folder "${normalizedFolder}" and all its items?`);
        if (!confirmed) return;

        try {
          const folderId = String(folder.id || "").trim();
          if (folderId) {
            await apiClient.deleteFolder(folderId).catch(() => null);
          }
          const result = await apiClient.deleteProject(normalizedFolder);
          if (!isMounted) return;
          removeDraftFolder(normalizedFolder);
          clearInlineSearch();
          const deletedCount = Number(result?.deletedCount || 0);
          toast(deletedCount > 0 ? `Deleted ${deletedCount} item${deletedCount === 1 ? "" : "s"}` : "Folder deleted");
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Folder delete endpoint unavailable");
          removeDraftFolder(normalizedFolder);
          removeFolderFromFallback(normalizedFolder);
          clearInlineSearch();
          toast("Folder removed locally");
          apiClient.adapterLog("delete_folder_fallback", message);
        }
      }

      function renderFolders() {
        if (!els.foldersList || !els.foldersEmpty) return;
        const state = getState();
        const folderMap = new Map();

        dbFolders.forEach((folder) => {
          folderMap.set(folder.name.toLowerCase(), {
            ...folder,
            count: 0,
            isDbFolder: true,
          });
        });

        normalizeFolderDrafts(state.draftFolders).forEach((folder) => {
          const key = folder.name.toLowerCase();
          if (!folderMap.has(key)) {
            folderMap.set(key, {
              ...folder,
              count: 0,
            });
          }
        });

        // Collect notes per folder for paper content (images, icons, text)
        const folderNotesMap = new Map();

        recentNotes.forEach((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          const projectName = note.project || "General";
          const key = String(projectName).toLowerCase();

          if (!folderMap.has(key)) {
            folderMap.set(key, {
              name: projectName,
              description: "",
              color: fallbackColorForFolder(projectName),
              symbol: "DOC",
              count: 0,
            });
          }

          const current = folderMap.get(key);
          current.count += 1;
          folderMap.set(key, current);

          // Store up to 4 notes per folder for paper display
          if (!folderNotesMap.has(key)) folderNotesMap.set(key, []);
          const notes = folderNotesMap.get(key);
          if (notes.length < 4) notes.push(note);
        });

        const folders = [...folderMap.values()].sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.name.localeCompare(b.name);
        });

        els.foldersList.innerHTML = "";
        if (!folders.length) {
          els.foldersEmpty.classList.remove("hidden");
          return;
        }

        els.foldersEmpty.classList.add("hidden");

        const isListView = (getState().viewMode || "grid") === "list";
        if (isListView) {
          els.foldersList.classList.add("view-list");
        } else {
          els.foldersList.classList.remove("view-list");
        }

        folders.slice(0, 40).forEach((folder, folderIndex) => {
          if (isListView) {
            const row = document.createElement("div");
            row.className = "folder-pill-row";
            row.tabIndex = 0;
            row.setAttribute("role", "link");

            const dot = document.createElement("span");
            dot.className = "folder-row-dot";
            dot.dataset.color = folder.color;

            const nameEl = document.createElement("span");
            nameEl.className = "folder-row-name";
            nameEl.textContent = folder.name;

            const countEl = document.createElement("span");
            countEl.className = "folder-row-count";
            countEl.textContent = `${folder.count}`;

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
                    await deleteFolder(folder);
                  },
                },
              ],
            });

            row.append(dot, nameEl, countEl, actionMenu);

            row.addEventListener("click", (e) => {
              if (e.target.closest(".action-menu")) return;
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });
            row.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });

            els.foldersList.appendChild(row);
          } else {
            const card = document.createElement("article");
            card.className = "folder-pill";
            card.style.cssText = `animation: fadeInUp 200ms ease both;`;
            card.tabIndex = 0;
            card.setAttribute("role", "link");
            card.dataset.color = folder.color;

            // Dynamic paper cards with content from actual notes (max 4)
            const folderKey = folder.name.toLowerCase();
            const folderNotes = folderNotesMap.get(folderKey) || [];
            const paperCount = Math.min(Math.max(folder.count, 0), 4);
            const paperLayouts = getPaperLayouts(paperCount);
            paperLayouts.forEach((p, i) => {
              card.appendChild(createPaperElement(p, folderNotes[i] || null));
            });

            const nameEl = document.createElement("span");
            nameEl.className = "folder-pill-name";
            nameEl.textContent = folder.name;

            const footer = document.createElement("div");
            footer.className = "folder-pill-footer";

            const countEl = document.createElement("span");
            countEl.className = "folder-pill-count";
            countEl.textContent = `${folder.count} item${folder.count !== 1 ? "s" : ""}`;

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
                    await deleteFolder(folder);
                  },
                },
              ],
            });

            footer.append(countEl, actionMenu);

            const inner = document.createElement("div");
            inner.className = "folder-pill-inner";
            inner.append(nameEl, footer);
            card.append(inner);

            card.addEventListener("click", (e) => {
              if (e.target.closest(".action-menu")) return;
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });
            card.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });

            els.foldersList.appendChild(card);
          }
        });
      }

      function renderRecent() {
        if (!els.recentNotesList) return;
        els.recentNotesList.innerHTML = "";

        const noteItems = applySortFilter(Array.isArray(recentNotes) ? recentNotes : []).slice(0, 12);

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
              renderRecent();
            });

            els.recentNotesList.appendChild(item);
          });
        }
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
          recentNotes = filterAndRankMockNotes(getState().mockNotes, { limit: 120 });
          searchResults = includeSearch ? filterAndRankMockNotes(getState().mockNotes, { query, limit: 120 }) : [];
          setState({ notes: recentNotes });
          setFallbackHint(true);
          renderView();
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
      function toggleSelectMode(active) {
        selectMode = typeof active === "boolean" ? active : !selectMode;
        selectedIds.clear();
        const page = mountNode.querySelector(".page-home");
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
        els.foldersList?.classList.add("view-list");
      }

      on(els.toolbarViewGridBtn, "click", () => {
        setState({ viewMode: "grid" });
        els.toolbarViewGridBtn?.classList.add("is-active");
        els.toolbarViewListBtn?.classList.remove("is-active");
        els.foldersList?.classList.remove("view-list");
        renderView();
      });

      on(els.toolbarViewListBtn, "click", () => {
        setState({ viewMode: "list" });
        els.toolbarViewListBtn?.classList.add("is-active");
        els.toolbarViewGridBtn?.classList.remove("is-active");
        els.foldersList?.classList.add("view-list");
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
        async onSubmit({ content, project, attachment }) {
          if (getState().loading) return;

          const inferred = attachment.fileDataUrl
            ? { sourceType: attachment.isImage ? "image" : "file", sourceUrl: "" }
            : inferCaptureType(content, null);
          const payload = {
            sourceType: inferred.sourceType,
            content,
            sourceUrl: inferred.sourceUrl,
            project,
            imageDataUrl: attachment.isImage ? attachment.fileDataUrl : null,
            fileDataUrl: attachment.fileDataUrl,
            fileName: attachment.name || "",
            fileMimeType: attachment.fileMimeType || "",
          };

          closeSaveModal(els);
          setState({ loading: true });

          try {
            const saveResult = await apiClient.saveNote(payload);
            if (!isMounted) return;

            if (saveResult?.note) {
              const savedEntry = normalizeCitation(saveResult.note, 0);
              const savedId = String(savedEntry?.note?.id || "");
              const deduped = recentNotes.filter((entry) => String((entry?.note || entry)?.id || "") !== savedId);
              recentNotes = [savedEntry, ...deduped].slice(0, 120);
              setState({ notes: recentNotes });
              renderView();
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
              recentNotes = filterAndRankMockNotes(nextMock, { limit: 120 });
              searchResults = activeQuery ? filterAndRankMockNotes(nextMock, { query: activeQuery, limit: 120 }) : [];
              setState({ mockNotes: nextMock, notes: recentNotes });

              toast("Saved locally");
              setFallbackHint(true);
              renderView();
              apiClient.adapterLog("save_fallback", message);
            }
          } finally {
            if (!isMounted) return;
            setState({ loading: false });
          }
        },
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
          els.toolbarNewMenu?.classList.add("hidden");
          closeItemModal(els);
          closeFolderModal(els);
          closeMoveModal(els);
          resolveMoveDialog(null);
        },
      });

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
