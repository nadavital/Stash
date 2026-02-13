import { renderComposer, initComposerAutoResize } from "../components/composer/composer.js";
import { renderHomeFolderGrid } from "../components/home-folder-grid/home-folder-grid.js";
import { renderHomeRecentList } from "../components/home-recent-list/home-recent-list.js";
import { renderTopbar } from "../components/topbar/topbar.js";
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
import {
  renderChatPanelHTML,
  queryChatPanelEls,
  initChatPanel,
} from "../components/chat-panel/chat-panel.js";
import {
  normalizeFolderColor,
  fallbackColorForFolder,
  normalizeFolderDrafts,
} from "../services/folder-utils.js";
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
  isProcessedNote,
  fileToDataUrl,
  deleteIconMarkup,
  relativeTime,
} from "../services/note-utils.js";


function renderHomePageShell(authSession = null) {
  return `
    <section class="page page-home" style="position:relative;">
      ${renderTopbar({
        showNewFolder: true,
        showSortFilter: true,
        showViewToggle: true,
        showSelectToggle: true,
        showChatToggle: true,
        auth: authSession,
        showSignOut: true,
      })}

      ${renderSortFilterHTML()}

      <section class="home-layout">
        <div class="home-explorer-pane">
          ${renderInlineSearchHTML()}
          ${renderHomeFolderGrid()}
        </div>

        ${renderHomeRecentList()}
      </section>

      ${renderComposer({ mode: "home" })}
    </section>

    <div id="batch-action-bar" class="batch-action-bar hidden">
      <span id="batch-action-count" class="batch-action-count">0 selected</span>
      <button id="batch-move-btn" class="batch-action-btn" type="button">Move to...</button>
      <button id="batch-delete-btn" class="batch-action-btn batch-action-btn--danger" type="button">Delete All</button>
      <button id="batch-cancel-btn" class="batch-action-btn batch-cancel-btn" type="button">Cancel</button>
    </div>

    ${renderItemModalHTML()}

    ${renderFolderModalHTML({ showKindRow: true })}

    ${renderChatPanelHTML()}
  `;
}

function queryElements(mountNode) {
  const itemModalEls = queryItemModalEls(mountNode);
  const folderModalEls = queryFolderModalEls(mountNode);
  const inlineSearchEls = queryInlineSearchEls(mountNode);
  const sortFilterEls = querySortFilterEls(mountNode);
  const chatPanelEls = queryChatPanelEls(mountNode);

  return {
    ...itemModalEls,
    ...folderModalEls,
    ...inlineSearchEls,
    ...sortFilterEls,
    ...chatPanelEls,
    topbarSortBtn: mountNode.querySelector("#topbar-sort-btn"),
    captureForm: mountNode.querySelector("#capture-form"),
    contentInput: mountNode.querySelector("#content-input"),
    projectInput: mountNode.querySelector("#project-input"),
    projectSelect: mountNode.querySelector("#project-select"),
    captureHint: mountNode.querySelector("#capture-hint"),
    attachmentToggle: mountNode.querySelector("#attachment-toggle"),
    fileInput: mountNode.querySelector("#file-input"),
    selectedFilePill: mountNode.querySelector("#selected-file-pill"),
    selectedFileName: mountNode.querySelector("#selected-file-name"),
    clearFileBtn: mountNode.querySelector("#clear-file-btn"),
    saveBtn: mountNode.querySelector("#save-btn"),
    recentNotesList: mountNode.querySelector("#recent-notes-list"),
    recentTasksList: mountNode.querySelector("#recent-tasks-list"),
    refreshBtn: mountNode.querySelector("#refresh-btn"),
    foldersList: mountNode.querySelector("#home-folders-list"),
    foldersEmpty: mountNode.querySelector("#home-folders-empty"),
    foldersError: mountNode.querySelector("#home-folders-error"),
    viewGridBtn: mountNode.querySelector("#view-grid-btn"),
    viewListBtn: mountNode.querySelector("#view-list-btn"),
    newFolderBtn: mountNode.querySelector("#topbar-new-folder-btn"),
    selectBtn: mountNode.querySelector("#topbar-select-btn"),
    chatBtn: mountNode.querySelector("#topbar-chat-btn"),
    signOutBtn: mountNode.querySelector("#topbar-signout-btn"),
    batchActionBar: mountNode.querySelector("#batch-action-bar"),
    batchActionCount: mountNode.querySelector("#batch-action-count"),
    batchDeleteBtn: mountNode.querySelector("#batch-delete-btn"),
    batchMoveBtn: mountNode.querySelector("#batch-move-btn"),
    batchCancelBtn: mountNode.querySelector("#batch-cancel-btn"),
    toast: document.getElementById("toast"),
  };
}

export function createHomePage({ store, apiClient, auth = null }) {
  return {
    async mount({ mountNode, navigate }) {
      const authSession = auth?.getSession?.() || null;
      mountNode.innerHTML = renderHomePageShell(authSession);
      const els = queryElements(mountNode);
      const disposers = [];
      let isMounted = true;
      let searchTimer = null;
      let attachment = {
        name: "",
        fileDataUrl: null,
        fileMimeType: "",
        isImage: false,
      };
      let modalCreateKind = "folder";
      let openTasks = [];
      let recentNotes = [];
      let searchResults = [];
      let sortMode = "newest";
      let filterType = "all";
      let dbFolders = [];
      let selectMode = false;
      const selectedIds = new Set();
      let hasMoreNotes = false;
      let currentOffset = 0;
      const PAGE_SIZE = 20;

      function on(target, eventName, handler, options) {
        if (!target) return;
        target.addEventListener(eventName, handler, options);
        disposers.push(() => target.removeEventListener(eventName, handler, options));
      }

      function getState() {
        return store.getState();
      }

      function setState(patch) {
        return store.setState(patch);
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

      function setCaptureHint(text, tone = "neutral") {
        if (!els.captureHint) return;
        els.captureHint.textContent = text;
        els.captureHint.classList.toggle("warn", tone === "warn");
      }

      function setSubmitting(active) {
        const isActive = Boolean(active);
        if (els.saveBtn) {
          els.saveBtn.disabled = isActive;
          els.saveBtn.classList.toggle("is-loading", isActive);
        }
        if (els.contentInput) {
          els.contentInput.disabled = isActive;
        }
        if (els.projectSelect) {
          els.projectSelect.disabled = isActive;
        }
        if (els.attachmentToggle) {
          els.attachmentToggle.disabled = isActive;
        }
        if (els.clearFileBtn) {
          els.clearFileBtn.disabled = isActive;
        }
      }

      function toast(message, tone = "success") {
        showToast(message, tone, store);
      }

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

      async function deleteFolderByName(folderName) {
        const normalizedFolder = String(folderName || "").trim();
        if (!normalizedFolder) return;

        const confirmed = window.confirm(`Delete folder "${normalizedFolder}" and all its items?`);
        if (!confirmed) return;

        try {
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

        // Merge DB folders first
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
            // List view: compact row
            const row = document.createElement("button");
            row.className = "folder-pill-row";
            row.type = "button";
            row.tabIndex = 0;

            const dot = document.createElement("span");
            dot.className = "folder-row-dot";
            dot.dataset.color = folder.color;

            const nameEl = document.createElement("span");
            nameEl.className = "folder-row-name";
            nameEl.textContent = folder.name;

            const countEl = document.createElement("span");
            countEl.className = "folder-row-count";
            countEl.textContent = `${folder.count}`;

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "folder-row-delete";
            deleteBtn.title = `Delete folder ${folder.name}`;
            deleteBtn.setAttribute("aria-label", `Delete folder ${folder.name}`);
            deleteBtn.innerHTML = deleteIconMarkup();

            row.append(dot, nameEl, countEl, deleteBtn);

            row.addEventListener("click", (e) => {
              if (e.target.closest(".folder-row-delete")) return;
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });

            deleteBtn.addEventListener("click", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              await deleteFolderByName(folder.name);
            });

            els.foldersList.appendChild(row);
          } else {
            // Grid view: existing card
            const card = document.createElement("article");
            card.className = "folder-pill";
            card.style.cssText = `animation: fadeInUp 200ms ease both;`;
            card.tabIndex = 0;
            card.setAttribute("role", "link");
            card.dataset.color = folder.color;

            const nameEl = document.createElement("span");
            nameEl.className = "folder-pill-name";
            nameEl.textContent = folder.name;

            const footer = document.createElement("div");
            footer.className = "folder-pill-footer";

            const countEl = document.createElement("span");
            countEl.className = "folder-pill-count";
            countEl.textContent = `${folder.count} item${folder.count !== 1 ? "s" : ""}`;

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "folder-pill-delete";
            deleteBtn.title = `Delete folder ${folder.name}`;
            deleteBtn.setAttribute("aria-label", `Delete folder ${folder.name}`);
            deleteBtn.innerHTML = deleteIconMarkup();

            footer.append(countEl, deleteBtn);
            card.append(nameEl, footer);

            card.addEventListener("click", () => {
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });
            card.addEventListener("keydown", (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              navigate(`#/folder/${encodeURIComponent(folder.name)}`);
            });

            deleteBtn.addEventListener("click", async (event) => {
              event.preventDefault();
              event.stopPropagation();
              await deleteFolderByName(folder.name);
            });

            els.foldersList.appendChild(card);
          }
        });
      }

      function renderRecent() {
        if (!els.recentNotesList || !els.recentTasksList) return;
        els.recentNotesList.innerHTML = "";
        els.recentTasksList.innerHTML = "";

        const noteItems = applySortFilter(Array.isArray(recentNotes) ? recentNotes : []).slice(0, 16);
        const taskItems = Array.isArray(openTasks) ? openTasks.slice(0, 16) : [];
        const accessedSet = new Set(getState().accessedIds || []);

        if (!noteItems.length) {
          const emptyNotes = document.createElement("p");
          emptyNotes.className = "ui-empty";
          emptyNotes.textContent = "No recent notes.";
          els.recentNotesList.appendChild(emptyNotes);
        } else {
          noteItems.forEach((entry, index) => {
            const note = normalizeCitation(entry, index).note;
            const row = document.createElement("div");
            row.className = "recent-item-row";

            const item = document.createElement("button");
            item.type = "button";
            item.className = "recent-item";
            item.title = buildNoteTitle(note);

            const icon = document.createElement("span");
            icon.className = "recent-item-icon";
            icon.dataset.type = iconTypeFor(note);

            const label = document.createElement("span");
            label.className = "recent-item-label";
            label.textContent = buildNoteTitle(note);

            const timeEl = document.createElement("span");
            timeEl.className = "recent-item-time";
            timeEl.textContent = relativeTime(note.createdAt);

            const states = document.createElement("span");
            states.className = "recent-item-states";

            const processedDot = document.createElement("span");
            processedDot.className = `state-dot ${isProcessedNote(note) ? "is-processed" : "is-pending"}`;
            processedDot.title = isProcessedNote(note) ? "Processed" : "Pending processing";

            const accessedDot = document.createElement("span");
            const accessed = accessedSet.has(String(note.id || ""));
            accessedDot.className = `state-dot is-accessed${accessed ? "" : " hidden"}`;
            accessedDot.title = "Opened";

            states.append(processedDot, accessedDot);
            item.append(icon, label, timeEl, states);

            item.addEventListener("click", () => {
              if (selectMode) {
                toggleNoteSelection(note.id);
                row.classList.toggle("is-selected", selectedIds.has(String(note.id)));
                const cb = row.querySelector(".batch-select-checkbox");
                if (cb) cb.checked = selectedIds.has(String(note.id));
                return;
              }
              openItemModal(els, note);
              markAccessed(note.id);
              renderRecent();
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.className = "recent-delete-btn";
            deleteBtn.title = `Delete item ${buildNoteTitle(note)}`;
            deleteBtn.setAttribute("aria-label", `Delete item ${buildNoteTitle(note)}`);
            deleteBtn.innerHTML = deleteIconMarkup();
            deleteBtn.addEventListener("click", async () => {
              await deleteNoteById(note.id);
            });

            // Batch select checkbox
            if (selectMode) {
              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.className = "batch-select-checkbox";
              checkbox.checked = selectedIds.has(String(note.id));
              checkbox.addEventListener("change", () => {
                toggleNoteSelection(note.id);
                row.classList.toggle("is-selected", selectedIds.has(String(note.id)));
              });
              row.style.position = "relative";
              row.prepend(checkbox);
            }

            row.append(item, deleteBtn);
            els.recentNotesList.appendChild(row);
          });
        }

        // Load more button
        if (hasMoreNotes && noteItems.length > 0) {
          const loadMoreBtn = document.createElement("button");
          loadMoreBtn.type = "button";
          loadMoreBtn.className = "batch-action-btn";
          loadMoreBtn.style.cssText = "width: 100%; margin-top: 8px;";
          loadMoreBtn.textContent = "Load more";
          loadMoreBtn.addEventListener("click", async () => {
            currentOffset += PAGE_SIZE;
            try {
              const moreResult = await apiClient.fetchNotes({ limit: PAGE_SIZE, offset: currentOffset });
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
          els.recentNotesList.appendChild(loadMoreBtn);
        }

        if (!taskItems.length) {
          const emptyTasks = document.createElement("p");
          emptyTasks.className = "ui-empty";
          emptyTasks.textContent = "No open tasks.";
          els.recentTasksList.appendChild(emptyTasks);
          return;
        }

        taskItems.forEach((task) => {
          const row = document.createElement("div");
          row.className = "recent-task-row";

          const item = document.createElement("div");
          item.className = "recent-task-item";
          item.title = task.title || "";

          const dot = document.createElement("span");
          dot.className = "recent-task-dot";

          const label = document.createElement("span");
          label.className = "recent-task-label";
          label.textContent = String(task.title || "").trim() || "(untitled task)";

          item.append(dot, label);

          const actions = document.createElement("span");
          actions.className = "recent-task-actions";

          // Edit button
          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "task-action-btn task-edit-btn";
          editBtn.title = "Edit task";
          editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8.5 2.5l3 3M1.5 9.5l6-6 3 3-6 6H1.5v-3z"/></svg>`;
          editBtn.addEventListener("click", () => {
            label.classList.add("hidden");
            const input = document.createElement("input");
            input.type = "text";
            input.className = "task-inline-edit";
            input.value = String(task.title || "").trim();
            item.insertBefore(input, label);
            input.focus();
            input.select();
            const save = async () => {
              const newTitle = input.value.trim();
              if (newTitle && newTitle !== task.title) {
                try {
                  await apiClient.updateTask(task.id, { title: newTitle });
                  toast("Task updated");
                  await refreshNotes();
                } catch { toast("Update failed", "error"); }
              } else {
                input.remove();
                label.classList.remove("hidden");
              }
            };
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") { e.preventDefault(); save(); }
              if (e.key === "Escape") { input.remove(); label.classList.remove("hidden"); }
            });
            input.addEventListener("blur", save);
          });

          // Complete button
          const completeBtn = document.createElement("button");
          completeBtn.type = "button";
          completeBtn.className = "task-action-btn task-complete-btn";
          completeBtn.title = "Complete task";
          completeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="2 7 6 11 12 3"/></svg>`;
          completeBtn.addEventListener("click", async () => {
            try {
              await apiClient.updateTask(task.id, { status: "closed" });
              toast("Task completed");
              await refreshNotes();
            } catch { toast("Complete failed", "error"); }
          });

          // Delete button
          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "task-action-btn task-delete-btn";
          deleteBtn.title = "Delete task";
          deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="4" x2="12" y2="4"/><path d="M5 4V2.5h4V4M3 4l.7 8h6.6l.7-8"/></svg>`;
          deleteBtn.addEventListener("click", async () => {
            if (!window.confirm("Delete this task?")) return;
            try {
              await apiClient.deleteTask(task.id);
              toast("Task deleted");
              await refreshNotes();
            } catch { toast("Delete failed", "error"); }
          });

          actions.append(editBtn, completeBtn, deleteBtn);
          row.append(item, actions);
          els.recentTasksList.appendChild(row);
        });
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

      function renderProjectOptions() {
        if (!els.projectSelect) return;

        const state = getState();
        const folderNames = new Set();

        normalizeFolderDrafts(state.draftFolders).forEach((folder) => {
          folderNames.add(folder.name);
        });

        recentNotes.forEach((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          const projectName = String(note.project || "").trim();
          if (projectName) {
            folderNames.add(projectName);
          }
        });

        const options = [...folderNames].sort((a, b) => a.localeCompare(b));
        const currentValue = String(els.projectSelect.value || els.projectInput?.value || "").trim();

        els.projectSelect.innerHTML = '<option value="">Folder</option>';
        options.forEach((name) => {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          els.projectSelect.append(option);
        });

        if (currentValue && options.includes(currentValue)) {
          els.projectSelect.value = currentValue;
        } else if (currentValue) {
          const option = document.createElement("option");
          option.value = currentValue;
          option.textContent = currentValue;
          els.projectSelect.append(option);
          els.projectSelect.value = currentValue;
        } else {
          els.projectSelect.value = "";
        }

        if (els.projectInput) {
          els.projectInput.value = String(els.projectSelect.value || "").trim();
        }
      }

      function renderView() {
        const query = String(els.inlineSearchInput?.value || "").trim();

        if (query) {
          if (els.foldersEmpty) els.foldersEmpty.classList.add("hidden");
          renderInlineSearchResults();
          renderRecent();
          renderProjectOptions();
          return;
        }

        renderFolders();
        renderRecent();
        renderProjectOptions();
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
          requests.push(apiClient.fetchTasks({ status: "open" }));
          requests.push(apiClient.fetchFolders());

          const results = await Promise.allSettled(requests);
          const recentResult = results[0];
          const searchResult = includeSearch ? results[1] : null;
          const tasksResult = includeSearch ? results[2] : results[1];
          const foldersResult = includeSearch ? results[3] : results[2];

          if (recentResult.status !== "fulfilled") throw recentResult.reason;

          if (!isMounted) return;
          recentNotes = Array.isArray(recentResult.value?.items) ? recentResult.value.items : [];
          hasMoreNotes = recentResult.value?.hasMore || false;
          searchResults =
            includeSearch && searchResult?.status === "fulfilled" && Array.isArray(searchResult.value?.items)
              ? searchResult.value.items
              : [];
          setState({ notes: recentNotes });
          openTasks =
            tasksResult.status === "fulfilled" && Array.isArray(tasksResult.value?.items)
              ? tasksResult.value.items
              : [];
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
          openTasks = [];
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

      function clearAttachment() {
        attachment = {
          name: "",
          fileDataUrl: null,
          fileMimeType: "",
          isImage: false,
        };

        if (els.fileInput) {
          els.fileInput.value = "";
        }

        if (els.selectedFileName) {
          els.selectedFileName.textContent = "";
        }

        els.selectedFilePill?.classList.add("hidden");
      }

      function setAttachment(fileName, fileDataUrl = null, fileMimeType = "") {
        const normalizedMime = String(fileMimeType || "").toLowerCase();
        attachment = {
          name: fileName,
          fileDataUrl,
          fileMimeType: normalizedMime,
          isImage: normalizedMime.startsWith("image/"),
        };

        if (els.selectedFileName) {
          els.selectedFileName.textContent = fileName;
        }

        els.selectedFilePill?.classList.remove("hidden");
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
        if (els.selectBtn) els.selectBtn.classList.toggle("is-active", selectMode);
        if (els.selectBtn) els.selectBtn.textContent = selectMode ? "Done" : "Select";
        updateBatchBar();
        renderView();
      }

      function updateBatchBar() {
        if (!els.batchActionBar) return;
        if (!selectMode || selectedIds.size === 0) {
          els.batchActionBar.classList.add("hidden");
          return;
        }
        els.batchActionBar.classList.remove("hidden");
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

      on(els.selectBtn, "click", () => {
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
        const target = window.prompt("Move to folder:");
        if (!target || !target.trim()) return;
        try {
          await apiClient.batchMoveNotes([...selectedIds], target.trim());
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
        els.viewGridBtn?.classList.remove("is-active");
        els.viewListBtn?.classList.add("is-active");
        els.foldersList?.classList.add("view-list");
      }

      on(els.viewGridBtn, "click", () => {
        setState({ viewMode: "grid" });
        els.viewGridBtn?.classList.add("is-active");
        els.viewListBtn?.classList.remove("is-active");
        els.foldersList?.classList.remove("view-list");
        renderView();
      });

      on(els.viewListBtn, "click", () => {
        setState({ viewMode: "list" });
        els.viewListBtn?.classList.add("is-active");
        els.viewGridBtn?.classList.remove("is-active");
        els.foldersList?.classList.add("view-list");
        renderView();
      });

      // Sort/filter via extracted component
      on(els.topbarSortBtn, "click", (event) => {
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

      on(els.attachmentToggle, "click", () => {
        els.fileInput?.click();
      });

      on(els.fileInput, "change", async () => {
        const file = els.fileInput?.files?.[0];
        if (!file) return;

        try {
          const fileDataUrl = await fileToDataUrl(file);
          setAttachment(file.name || "file", fileDataUrl, file.type || "");
        } catch (error) {
          setCaptureHint(conciseTechnicalError(error, "File read failed"), "warn");
          toast("File read failed", "error");
        }
      });

      on(els.clearFileBtn, "click", () => {
        clearAttachment();
      });

      const composerShell = mountNode.querySelector('.composer-shell');
      if (composerShell) {
        on(composerShell, 'dragover', (e) => {
          e.preventDefault();
          composerShell.classList.add('drag-active');
        });
        on(composerShell, 'dragleave', (e) => {
          if (!composerShell.contains(e.relatedTarget)) {
            composerShell.classList.remove('drag-active');
          }
        });
        on(composerShell, 'drop', async (e) => {
          e.preventDefault();
          composerShell.classList.remove('drag-active');
          const file = e.dataTransfer?.files?.[0];
          if (!file) return;
          try {
            const dataUrl = await fileToDataUrl(file);
            setAttachment(file.name || 'file', dataUrl, file.type || '');
          } catch (err) {
            toast('File read failed', 'error');
          }
        });
      }

      // Full-page drop zone
      const pageEl = mountNode.querySelector('.page-home');
      if (pageEl) {
        on(pageEl, 'dragover', (e) => {
          e.preventDefault();
          pageEl.classList.add('page-drag-active');
        });
        on(pageEl, 'dragleave', (e) => {
          if (!pageEl.contains(e.relatedTarget)) {
            pageEl.classList.remove('page-drag-active');
          }
        });
        on(pageEl, 'drop', async (e) => {
          e.preventDefault();
          pageEl.classList.remove('page-drag-active');
          const file = e.dataTransfer?.files?.[0];
          if (!file) return;
          try {
            const dataUrl = await fileToDataUrl(file);
            setAttachment(file.name || 'file', dataUrl, file.type || '');
            els.contentInput?.focus();
          } catch {
            toast('File read failed', 'error');
          }
        });
      }

      on(els.projectSelect, "change", () => {
        if (!els.projectInput) return;
        els.projectInput.value = String(els.projectSelect?.value || "").trim();
      });

      on(els.captureForm, "submit", async (event) => {
        event.preventDefault();
        if (getState().loading) return;

        const rawContent = (els.contentInput?.value || "").trim();
        const project = String(els.projectSelect?.value || els.projectInput?.value || "").trim();
        const content = rawContent;

        if (!content && !attachment.fileDataUrl) {
          setCaptureHint("Add text, link, image, or file.", "warn");
          toast("Add content first", "error");
          els.contentInput?.focus();
          return;
        }

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
        const pendingContent = rawContent;
        const pendingAttachment = { ...attachment };

        setState({ loading: true });
        setSubmitting(true);
        setCaptureHint("Processing item...");
        if (els.contentInput) {
          els.contentInput.value = "";
        }
        clearAttachment();

        try {
          await apiClient.saveNote(payload);
          if (!isMounted) return;

          setCaptureHint("Saved.");
          toast("Item saved");
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;

          const message = conciseTechnicalError(error, "Save endpoint unavailable");
          const validationLike = /missing content|invalid image|invalid file|invalid json|request failed \(4\d\d\)/i.test(message);

          if (validationLike) {
            if (els.contentInput) {
              els.contentInput.value = pendingContent;
            }
            if (pendingAttachment.fileDataUrl) {
              setAttachment(pendingAttachment.name || "file", pendingAttachment.fileDataUrl, pendingAttachment.fileMimeType || "");
            }
            setCaptureHint(message, "warn");
            toast("Save failed", "error");
          } else {
            const nextMock = [buildLocalFallbackNote(payload), ...getState().mockNotes];
            const activeQuery = (els.inlineSearchInput?.value || "").trim();
            recentNotes = filterAndRankMockNotes(nextMock, { limit: 120 });
            searchResults = activeQuery ? filterAndRankMockNotes(nextMock, { query: activeQuery, limit: 120 }) : [];
            setState({ mockNotes: nextMock, notes: recentNotes });

            setCaptureHint("Saved locally.", "warn");
            toast("Saved locally");
            setFallbackHint(true);
            renderView();
            apiClient.adapterLog("save_fallback", message);
          }
        } finally {
          if (!isMounted) return;
          setState({ loading: false });
          setSubmitting(false);
        }
      });

      on(els.refreshBtn, "click", async () => {
        await refreshNotes();
      });

      on(els.newFolderBtn, "click", () => {
        openFolderModal(els, { color: "green", kind: "folder" });
        setFolderModalKind("folder");
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
      });
      disposers.push(cleanupItemModal);

      // Chat panel
      const chatPanel = initChatPanel(els, { apiClient, toast });
      disposers.push(chatPanel.dispose);

      on(els.chatBtn, "click", () => {
        chatPanel.toggle();
      });

      on(els.signOutBtn, "click", async () => {
        try {
          await auth?.onSignOut?.();
        } catch {
          // no-op
        }
      });

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
            setCaptureHint(conciseTechnicalError(error, "Task save failed"), "warn");
            toast("Task save failed", "error");
          }
          return;
        }

        const description = String(els.folderDescriptionInput?.value || "").trim();
        const color = getSelectedFolderColor(els);

        try {
          await apiClient.createFolder({ name, description, color });
        } catch {
          // Fallback to draft folder if API fails
          upsertDraftFolder({ name, description, color });
        }
        closeFolderModal(els);
        navigate(`#/folder/${encodeURIComponent(name)}`);
      });

      setFolderModalKind("folder");
      clearAttachment();
      setCaptureHint("");

      const cleanupAutoResize = initComposerAutoResize(mountNode);
      disposers.push(cleanupAutoResize);

      function showSkeletons() {
        if (els.recentNotesList) {
          els.recentNotesList.innerHTML = Array.from({ length: 5 }, () =>
            `<div class="skeleton-row"><div class="skeleton-dot skeleton-pulse"></div><div class="skeleton-line skeleton-pulse w-80" style="flex:1"></div></div>`
          ).join('');
        }
      }
      showSkeletons();

      await refreshNotes();

      // Global keyboard shortcuts
      const cleanupKeyboard = initKeyboardShortcuts({
        onSearch: () => {
          els.inlineSearchInput?.focus();
        },
        onComposer: () => {
          els.contentInput?.focus();
        },
        onEscape: () => {
          if ((els.inlineSearchInput?.value || "").trim()) {
            clearInlineSearch();
          }
          closeItemModal(els);
          closeFolderModal(els);
        },
      });

      // Subscribe to SSE for real-time enrichment updates
      const unsubscribeSSE = apiClient.subscribeToEvents?.((event) => {
        if (!isMounted) return;
        if (event.type === "job:complete" && event.result) {
          const enrichedNote = event.result;
          // Update note in-place in our local arrays
          for (let i = 0; i < recentNotes.length; i++) {
            const entry = recentNotes[i];
            const noteObj = entry?.note || entry;
            if (noteObj.id === enrichedNote.id) {
              if (entry?.note) {
                recentNotes[i] = { ...entry, note: enrichedNote };
              } else {
                recentNotes[i] = enrichedNote;
              }
              break;
            }
          }
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
        disposers.forEach((dispose) => {
          dispose();
        });
      };
    },
  };
}
