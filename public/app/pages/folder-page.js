import { renderComposer, initComposerAutoResize } from "../components/composer/composer.js";
import { renderFolderHeroToolbar } from "../components/folder-hero-toolbar/folder-hero-toolbar.js";
import { renderFolderItemGrid } from "../components/folder-item-grid/folder-item-grid.js";
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
  resolveFolderMeta,
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
  noteTypeIconMarkup,
  relativeTime,
} from "../services/note-utils.js";

function renderFolderPageShell(folderMeta, authSession = null) {
  return `
    <section class="page page-folder" style="position:relative;">
      ${renderTopbar({
        showSortFilter: true,
        showViewToggle: true,
        showSelectToggle: true,
        showChatToggle: true,
        auth: authSession,
        showSignOut: true,
      })}

      ${renderSortFilterHTML()}

      <section class="folder-layout">
        <div class="folder-explorer-pane">
          ${renderInlineSearchHTML()}
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

        ${renderHomeRecentList()}
      </section>

      ${renderComposer({ mode: "folder" })}
    </section>

    <div id="batch-action-bar" class="batch-action-bar hidden">
      <span id="batch-action-count" class="batch-action-count">0 selected</span>
      <button id="batch-move-btn" class="batch-action-btn" type="button">Move to...</button>
      <button id="batch-delete-btn" class="batch-action-btn batch-action-btn--danger" type="button">Delete All</button>
      <button id="batch-cancel-btn" class="batch-action-btn batch-cancel-btn" type="button">Cancel</button>
    </div>

    ${renderItemModalHTML()}

    ${renderFolderModalHTML()}

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
    viewGridBtn: mountNode.querySelector("#view-grid-btn"),
    viewListBtn: mountNode.querySelector("#view-list-btn"),
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
    deleteFolderBtn: mountNode.querySelector("#delete-folder-btn"),
    newFolderBtn: mountNode.querySelector("#new-folder-btn"),
    subfoldersSection: mountNode.querySelector("#subfolders-section"),
    subfoldersGrid: mountNode.querySelector("#subfolders-grid"),
    folderItemsGrid: mountNode.querySelector("#folder-items-grid"),
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

export function createFolderPage({ store, apiClient, auth = null }) {
  return {
    async mount({ mountNode, route, navigate }) {
      const folderName = route.folderId || "general";
      const folderMeta = resolveFolderMeta(folderName, store.getState().draftFolders);
      const authSession = auth?.getSession?.() || null;

      mountNode.innerHTML = renderFolderPageShell(folderMeta, authSession);
      const els = queryElements(mountNode);
      const disposers = [];
      let isMounted = true;
      let searchTimer = null;
      let openTasks = [];
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
      let attachment = {
        name: "",
        fileDataUrl: null,
        fileMimeType: "",
        isImage: false,
      };

      if (els.projectInput) {
        els.projectInput.value = folderMeta.name;
      }
      if (els.projectSelect) {
        els.projectSelect.innerHTML = `<option value="${folderMeta.name}">${folderMeta.name}</option>`;
        els.projectSelect.value = folderMeta.name;
      }

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
        const folderName = String(folderMeta.name || "").trim();
        if (!folderName) return;
        const confirmed = window.confirm(`Delete folder "${folderName}" and all its items?`);
        if (!confirmed) return;

        closeItemModal(els);
        try {
          const result = await apiClient.deleteProject(folderName);
          if (!isMounted) return;
          removeDraftFolder(folderName);
          const deletedCount = Number(result?.deletedCount || 0);
          toast(deletedCount > 0 ? `Deleted ${deletedCount} item${deletedCount === 1 ? "" : "s"}` : "Folder deleted");
          navigate("#/");
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Folder delete endpoint unavailable");
          removeDraftFolder(folderName);
          removeFolderFromFallback();
          toast("Folder removed locally");
          apiClient.adapterLog("folder_delete_fallback", message);
          navigate("#/");
        }
      }

      async function updateBreadcrumb(folder, root) {
        if (!folder?.parentId) return;
        const breadcrumb = root.querySelector(".folder-breadcrumb");
        if (!breadcrumb) return;
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
              <span class="folder-color-dot" data-color="${folder.color || 'green'}" aria-hidden="true"></span>
              <span class="folder-current-name">${folder.name}</span>
            </span>
          `;
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
            const row = document.createElement("button");
            row.className = "subfolder-row";
            row.type = "button";

            const dot = document.createElement("span");
            dot.className = "folder-row-dot";
            dot.dataset.color = folder.color || "green";

            const nameEl = document.createElement("span");
            nameEl.className = "folder-row-name";
            nameEl.textContent = folder.name;

            row.append(dot, nameEl);
            row.addEventListener("click", () => {
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

            card.appendChild(nameEl);
            card.addEventListener("click", () => {
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

          const shell = document.createElement("div");
          shell.className = "folder-file-tile-shell";
          shell.style.cssText = `animation: fadeInUp 200ms ease both;`;

          const tile = document.createElement("button");
          tile.type = "button";
          tile.className = "folder-file-tile";
          tile.dataset.type = noteType;

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

            if (isLink && note.sourceUrl) {
              const domainEl = document.createElement("p");
              domainEl.className = "folder-file-domain";
              domainEl.textContent = extractDomain(note.sourceUrl);
              body.appendChild(domainEl);
            } else {
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

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "folder-file-action-btn";
            delBtn.title = "Delete";
            delBtn.innerHTML = deleteIconMarkup();
            delBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              await deleteNoteById(note.id);
            });

            const moveBtn = document.createElement("button");
            moveBtn.type = "button";
            moveBtn.className = "folder-file-action-btn move-btn";
            moveBtn.title = "Move";
            moveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 7h10M8 4l3 3-3 3"/></svg>`;
            moveBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const target = window.prompt("Move to folder:");
              if (!target || !target.trim()) return;
              try {
                await apiClient.batchMoveNotes([note.id], target.trim());
                toast("Moved");
                await refreshNotes();
              } catch { toast("Move failed", "error"); }
            });

            actions.append(delBtn, moveBtn);
            tile.appendChild(actions);
          } else {
            const topRow = document.createElement("div");
            topRow.className = "folder-file-top-row";

            const typeIcon = document.createElement("span");
            typeIcon.className = "folder-file-kind-icon";
            typeIcon.innerHTML = noteTypeIconMarkup(noteType);

            const typeBadge = document.createElement("span");
            typeBadge.className = "folder-file-type";
            typeBadge.textContent = note.sourceType || "text";

            const spacer = document.createElement("span");
            spacer.className = "folder-file-spacer";

            const actionRow = document.createElement("div");
            actionRow.className = "folder-file-actions";

            const delActionBtn = document.createElement("button");
            delActionBtn.type = "button";
            delActionBtn.className = "folder-file-action-btn";
            delActionBtn.title = "Delete";
            delActionBtn.innerHTML = deleteIconMarkup();
            delActionBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              await deleteNoteById(note.id);
            });

            const moveBtn = document.createElement("button");
            moveBtn.type = "button";
            moveBtn.className = "folder-file-action-btn move-btn";
            moveBtn.title = "Move";
            moveBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 7h10M8 4l3 3-3 3"/></svg>`;
            moveBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const target = window.prompt("Move to folder:");
              if (!target || !target.trim()) return;
              try {
                await apiClient.batchMoveNotes([note.id], target.trim());
                toast("Moved");
                await refreshNotes();
              } catch { toast("Move failed", "error"); }
            });

            actionRow.append(delActionBtn, moveBtn);
            topRow.append(typeIcon, typeBadge, spacer, actionRow);
            tile.appendChild(topRow);

            const heroSrc = note.imagePath || (isLink && ogImage ? ogImage : "");
            if (heroSrc) {
              const thumb = document.createElement("img");
              thumb.className = "folder-file-thumb";
              thumb.src = heroSrc;
              thumb.alt = buildNoteTitle(note);
              thumb.loading = "lazy";
              thumb.onerror = () => { thumb.style.display = "none"; };
              tile.appendChild(thumb);
            }

            const body = document.createElement("div");
            body.className = "folder-file-body";

            const titleEl = document.createElement("p");
            titleEl.className = "folder-file-title";
            titleEl.textContent = buildNoteTitle(note);
            body.appendChild(titleEl);

            if (isLink && note.sourceUrl) {
              const domainEl = document.createElement("p");
              domainEl.className = "folder-file-domain";
              domainEl.textContent = extractDomain(note.sourceUrl);
              body.appendChild(domainEl);
            } else {
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

            tile.appendChild(footer);
          }

          tile.addEventListener("click", (e) => {
            if (e.target.closest(".folder-file-actions") || e.target.closest(".list-view-actions")) return;
            if (selectMode) {
              toggleNoteSelection(note.id);
              shell.classList.toggle("is-selected", selectedIds.has(String(note.id)));
              const cb = shell.querySelector(".batch-select-checkbox");
              if (cb) cb.checked = selectedIds.has(String(note.id));
              return;
            }
            openItemModal(els, note);
            markAccessed(note.id);
            renderView();
          });

          if (selectMode) {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "batch-select-checkbox";
            checkbox.checked = selectedIds.has(String(note.id));
            checkbox.style.display = "block";
            checkbox.addEventListener("change", () => {
              toggleNoteSelection(note.id);
              shell.classList.toggle("is-selected", selectedIds.has(String(note.id)));
            });
            shell.prepend(checkbox);
          }

          shell.appendChild(tile);
          els.folderItemsGrid.appendChild(shell);
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
        if (!els.recentNotesList || !els.recentTasksList) return;
        els.recentNotesList.innerHTML = "";
        els.recentTasksList.innerHTML = "";

        const noteItems = Array.isArray(recentNotes) ? recentNotes.slice(0, 15) : [];
        const taskItems = Array.isArray(openTasks) ? openTasks.slice(0, 15) : [];

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

            const accessed = accessedSet.has(String(note.id || ""));
            const accessedDot = document.createElement("span");
            accessedDot.className = `state-dot is-accessed${accessed ? "" : " hidden"}`;
            accessedDot.title = "Opened";

            states.append(processedDot, accessedDot);
            item.append(icon, label, timeEl, states);

            item.addEventListener("click", () => {
              openItemModal(els, note);
              markAccessed(note.id);
              renderView();
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

            row.append(item, deleteBtn);
            els.recentNotesList.appendChild(row);
          });
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

      function renderProjectOptions() {
        if (!els.projectSelect) return;

        const state = getState();
        const folderNames = new Set([folderMeta.name]);

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
        const currentValue = String(els.projectSelect.value || folderMeta.name).trim();

        els.projectSelect.innerHTML = '<option value="">Folder</option>';
        options.forEach((name) => {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          els.projectSelect.append(option);
        });

        if (currentValue && options.includes(currentValue)) {
          els.projectSelect.value = currentValue;
        } else if (folderMeta.name && options.includes(folderMeta.name)) {
          els.projectSelect.value = folderMeta.name;
        } else {
          els.projectSelect.value = "";
        }

        if (els.projectInput) {
          els.projectInput.value = String(els.projectSelect.value || folderMeta.name || "").trim();
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
          renderProjectOptions();
          return;
        }

        renderSubfolders();
        renderFolderItems(applySortFilter(recentNotes));
        renderRecent();
        renderProjectOptions();
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
          requests.push(apiClient.fetchTasks({ status: "open" }));
          requests.push(apiClient.getFolder(folderMeta.name).catch(() => null));

          const results = await Promise.allSettled(requests);
          const recentResult = results[0];
          const searchResult = includeSearch ? results[1] : null;
          const tasksResult = includeSearch ? results[2] : results[1];
          const folderMetaResult = includeSearch ? results[3] : results[2];
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

          if (folderMetaResult?.status === "fulfilled" && folderMetaResult.value?.folder) {
            dbFolderMeta = folderMetaResult.value.folder;
            try {
              const childrenResult = await apiClient.fetchSubfolders(dbFolderMeta.id);
              subFolders = Array.isArray(childrenResult?.items) ? childrenResult.items : [];
            } catch { subFolders = []; }
            if (dbFolderMeta.parentId) {
              updateBreadcrumb(dbFolderMeta, mountNode);
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
          openTasks = [];
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

      // Batch select mode
      function toggleSelectMode(active) {
        selectMode = typeof active === "boolean" ? active : !selectMode;
        selectedIds.clear();
        const page = mountNode.querySelector(".page-folder");
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
        els.folderItemsGrid?.classList.add("view-list");
        els.subfoldersGrid?.classList.add("view-list");
      }

      on(els.viewGridBtn, "click", () => {
        setState({ viewMode: "grid" });
        els.viewGridBtn?.classList.add("is-active");
        els.viewListBtn?.classList.remove("is-active");
        els.folderItemsGrid?.classList.remove("view-list");
        els.subfoldersGrid?.classList.remove("view-list");
        renderView();
      });

      on(els.viewListBtn, "click", () => {
        setState({ viewMode: "list" });
        els.viewListBtn?.classList.add("is-active");
        els.viewGridBtn?.classList.remove("is-active");
        els.folderItemsGrid?.classList.add("view-list");
        els.subfoldersGrid?.classList.add("view-list");
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
      const pageEl = mountNode.querySelector('.page-folder');
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
        const content = rawContent;
        const selectedProject = String(els.projectSelect?.value || folderMeta.name || "").trim();

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
          project: selectedProject || folderMeta.name,
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

            setCaptureHint("Saved locally.", "warn");
            toast("Saved locally");
            renderView();
            apiClient.adapterLog("folder_save_fallback", message);
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

      on(els.deleteFolderBtn, "click", async () => {
        await deleteCurrentFolder();
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

      const cleanupKeyboard = initKeyboardShortcuts({
        onSearch() {
          els.inlineSearchInput?.focus();
        },
        onComposer() {
          els.contentInput?.focus();
        },
        onEscape() {
          if ((els.inlineSearchInput?.value || "").trim()) {
            clearInlineSearch();
          }
          closeItemModal(els);
        },
      });

      ensureDraftFolder(folderMeta.name);
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
        if (els.folderItemsGrid) {
          els.folderItemsGrid.innerHTML = Array.from({ length: 6 }, () =>
            `<div class="skeleton-card skeleton-pulse"></div>`
          ).join('');
        }
      }
      showSkeletons();

      await refreshNotes();

      // Subscribe to SSE for real-time enrichment updates
      const unsubscribeSSE = apiClient.subscribeToEvents?.((event) => {
        if (!isMounted) return;
        if (event.type === "job:complete" && event.result) {
          const enrichedNote = event.result;
          if (enrichedNote.project !== folderMeta.name) return;
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
        disposers.forEach((dispose) => {
          dispose();
        });
      };
    },
  };
}
