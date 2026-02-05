import { renderComposer } from "../components/composer/composer.js";
import { renderFolderHeroToolbar } from "../components/folder-hero-toolbar/folder-hero-toolbar.js";
import { renderFolderItemGrid } from "../components/folder-item-grid/folder-item-grid.js";
import { renderHomeRecentList } from "../components/home-recent-list/home-recent-list.js";
import { renderTopbar } from "../components/topbar/topbar.js";
import {
  buildNoteDescription,
  buildContentPreview,
  buildLocalFallbackNote,
  buildNoteTitle,
  conciseTechnicalError,
  filterAndRankMockNotes,
  inferCaptureType,
  normalizeCitation,
} from "../services/mappers.js";

const FOLDER_COLOR_TOKENS = ["sky", "mint", "sand", "rose", "violet", "slate"];
const FOLDER_SYMBOL_OPTIONS = ["DOC", "PLAN", "CODE", "LINK", "MEDIA", "NOTE"];

function normalizeFolderColor(value, fallback = "sky") {
  const normalized = String(value || "").toLowerCase().trim();
  return FOLDER_COLOR_TOKENS.includes(normalized) ? normalized : fallback;
}

function normalizeFolderSymbol(value, fallback = "DOC") {
  const normalized = String(value || "")
    .toUpperCase()
    .trim();
  return FOLDER_SYMBOL_OPTIONS.includes(normalized) ? normalized : fallback;
}

function fallbackColorForFolder(name = "") {
  const total = String(name)
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return FOLDER_COLOR_TOKENS[total % FOLDER_COLOR_TOKENS.length] || "sky";
}

function normalizeFolderDrafts(rawDrafts = []) {
  const map = new Map();

  (Array.isArray(rawDrafts) ? rawDrafts : []).forEach((entry) => {
    const draft =
      typeof entry === "string"
        ? { name: entry, description: "", color: fallbackColorForFolder(entry), symbol: "DOC" }
        : {
            name: entry?.name || "",
            description: entry?.description || "",
            color: normalizeFolderColor(entry?.color, fallbackColorForFolder(entry?.name || "")),
            symbol: normalizeFolderSymbol(entry?.symbol, "DOC"),
          };

    const name = String(draft.name || "").trim();
    if (!name) return;

    map.set(name.toLowerCase(), {
      name,
      description: String(draft.description || "").trim(),
      color: normalizeFolderColor(draft.color, fallbackColorForFolder(name)),
      symbol: normalizeFolderSymbol(draft.symbol, "DOC"),
    });
  });

  return [...map.values()];
}

function resolveFolderMeta(folderName, draftFolders) {
  const normalizedName = String(folderName || "").trim() || "General";
  const drafts = normalizeFolderDrafts(draftFolders);
  const found = drafts.find((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase());

  if (found) return found;

  return {
    name: normalizedName,
    description: "",
    color: fallbackColorForFolder(normalizedName),
    symbol: "DOC",
  };
}

function iconTypeFor(note) {
  if (note.sourceType === "image") return "image";
  if (note.sourceType === "link") return "link";
  if ((note.sourceType || "").toLowerCase() === "file") return "file";
  return "text";
}

function noteTypeIconMarkup(type) {
  if (type === "image") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path fill="currentColor" d="M4.5 3A2.5 2.5 0 0 0 2 5.5v9A2.5 2.5 0 0 0 4.5 17h11a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 15.5 3h-11Zm8.7 3.8a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Zm-8.7 8V13l2.8-2.8a1 1 0 0 1 1.4 0L11 12.5l1.4-1.4a1 1 0 0 1 1.4 0l2.2 2.2v1.5h-11Z"/>
      </svg>
    `;
  }
  if (type === "link") {
    return `
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path fill="currentColor" d="M7.6 6.2a3 3 0 0 1 4.2 0 .8.8 0 1 1-1.1 1.1 1.4 1.4 0 0 0-2 2l.6.6a1.4 1.4 0 0 0 2 0 .8.8 0 0 1 1.1 1.1 3 3 0 0 1-4.2 0l-.6-.6a3 3 0 0 1 0-4.2Zm4.8 3.6a.8.8 0 0 1 1.1-1.1l.6.6a3 3 0 1 1-4.2 4.2.8.8 0 1 1 1.1-1.1 1.4 1.4 0 1 0 2-2l-.6-.6Z"/>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d="M5 2.5A2.5 2.5 0 0 0 2.5 5v10A2.5 2.5 0 0 0 5 17.5h10a2.5 2.5 0 0 0 2.5-2.5V8.8a2.5 2.5 0 0 0-.7-1.8l-3.8-3.8a2.5 2.5 0 0 0-1.8-.7H5Zm5.4 1.6L15.9 9h-4a1.5 1.5 0 0 1-1.5-1.5v-3.4Z"/>
    </svg>
  `;
}

function compactInlineText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildModalSummary(note) {
  const summary = String(note.summary || "").trim();
  if (summary && summary.toLowerCase() !== "(no summary)") {
    return summary;
  }
  return buildNoteDescription(note);
}

function buildModalFullExtract(note) {
  const extracted = String(note.markdownContent || note.rawContent || "").trim();
  if (extracted) return extracted;

  const content = String(note.content || "").trim();
  if (content && !/^file:|^uploaded file:/i.test(content)) {
    return content;
  }
  return "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isProcessedNote(note) {
  return Boolean(String(note.summary || "").trim()) && String(note.summary || "").trim() !== "(no summary)";
}

function renderFolderPageShell(folderMeta) {
  return `
    <section class="page page-folder">
      ${renderTopbar()}

      <section class="folder-layout">
        <div class="folder-explorer-pane">
          ${renderFolderHeroToolbar({
            folderName: folderMeta.name,
            folderDescription: folderMeta.description,
            folderColor: folderMeta.color,
            folderSymbol: folderMeta.symbol,
          })}
          ${renderFolderItemGrid()}
        </div>

        ${renderHomeRecentList()}
      </section>

      ${renderComposer({ mode: "folder" })}
    </section>

    <div id="item-modal" class="item-modal hidden" aria-hidden="true">
      <div id="item-modal-backdrop" class="item-modal-backdrop"></div>
      <article class="item-modal-panel" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
        <button id="item-modal-close" class="item-modal-close" type="button" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
        </button>
        <p id="item-modal-project" class="item-modal-project"></p>
        <h3 id="item-modal-title" class="item-modal-title"></h3>
        <div id="item-modal-content" class="item-modal-content"></div>
        <button id="item-modal-toggle" class="item-modal-toggle hidden" type="button" aria-expanded="false">Show full extracted text</button>
        <pre id="item-modal-full-content" class="item-modal-full-content hidden"></pre>
        <img id="item-modal-image" class="item-modal-image hidden" alt="Item preview" />
      </article>
    </div>
  `;
}

function queryElements(mountNode) {
  return {
    topbarSearchWrap: mountNode.querySelector("#topbar-search-wrap"),
    topbarSearchToggle: mountNode.querySelector("#topbar-search-toggle"),
    topbarSearchInput: mountNode.querySelector("#topbar-search-input"),
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
    folderItemsGrid: mountNode.querySelector("#folder-items-grid"),
    itemModal: mountNode.querySelector("#item-modal"),
    itemModalBackdrop: mountNode.querySelector("#item-modal-backdrop"),
    itemModalClose: mountNode.querySelector("#item-modal-close"),
    itemModalProject: mountNode.querySelector("#item-modal-project"),
    itemModalTitle: mountNode.querySelector("#item-modal-title"),
    itemModalContent: mountNode.querySelector("#item-modal-content"),
    itemModalToggle: mountNode.querySelector("#item-modal-toggle"),
    itemModalFullContent: mountNode.querySelector("#item-modal-full-content"),
    itemModalImage: mountNode.querySelector("#item-modal-image"),
    toast: document.getElementById("toast"),
  };
}

function openModalForItem(els, note) {
  if (!els.itemModal || !note) return;

  els.itemModalTitle.textContent = buildNoteTitle(note);
  const projectParts = [note.project || "General"];
  if (note.fileName) {
    projectParts.push(note.fileName);
  }
  els.itemModalProject.textContent = projectParts.join(" • ");
  const summaryText = buildModalSummary(note);
  els.itemModalContent.textContent = summaryText || "No AI description available yet.";

  const fullExtract = buildModalFullExtract(note);
  const hasDistinctFull =
    fullExtract &&
    compactInlineText(fullExtract) !== compactInlineText(summaryText) &&
    fullExtract.length > 60;

  if (els.itemModalToggle && els.itemModalFullContent) {
    els.itemModalToggle.classList.toggle("hidden", !hasDistinctFull);
    els.itemModalFullContent.classList.add("hidden");
    els.itemModalToggle.textContent = "Show full extracted text";
    els.itemModalToggle.setAttribute("aria-expanded", "false");
    els.itemModalFullContent.textContent = hasDistinctFull ? fullExtract : "";
    els.itemModalToggle.onclick = hasDistinctFull
      ? () => {
          const expanded = els.itemModalToggle.getAttribute("aria-expanded") === "true";
          const nextExpanded = !expanded;
          els.itemModalToggle.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
          els.itemModalToggle.textContent = nextExpanded ? "Hide full extracted text" : "Show full extracted text";
          els.itemModalFullContent.classList.toggle("hidden", !nextExpanded);
        }
      : null;
  }

  if (note.imagePath) {
    els.itemModalImage.src = note.imagePath;
    els.itemModalImage.classList.remove("hidden");
  } else {
    els.itemModalImage.src = "";
    els.itemModalImage.classList.add("hidden");
  }

  els.itemModal.classList.remove("hidden");
  els.itemModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal(els) {
  if (!els.itemModal) return;
  if (els.itemModalToggle && els.itemModalFullContent) {
    els.itemModalToggle.classList.add("hidden");
    els.itemModalToggle.textContent = "Show full extracted text";
    els.itemModalToggle.setAttribute("aria-expanded", "false");
    els.itemModalToggle.onclick = null;
    els.itemModalFullContent.classList.add("hidden");
    els.itemModalFullContent.textContent = "";
  }
  els.itemModal.classList.add("hidden");
  els.itemModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function createFolderPage({ store, apiClient }) {
  return {
    async mount({ mountNode, route }) {
      const folderName = route.folderId || "general";
      const folderMeta = resolveFolderMeta(folderName, store.getState().draftFolders);

      mountNode.innerHTML = renderFolderPageShell(folderMeta);
      const els = queryElements(mountNode);
      const disposers = [];
      let isMounted = true;
      let searchTimer = null;
      let openTasks = [];
      let recentNotes = [];
      let searchResults = [];
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
          symbol: normalizeFolderSymbol(folderMeta.symbol, "DOC"),
        });

        setState({ draftFolders: drafts });
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

      function showToast(message, tone = "success") {
        if (!els.toast) return;
        const state = getState();
        els.toast.textContent = message;
        els.toast.classList.remove("hidden", "show", "error");
        if (tone === "error") {
          els.toast.classList.add("error");
        }

        requestAnimationFrame(() => {
          els.toast.classList.add("show");
        });

        if (state.toastTimer) {
          clearTimeout(state.toastTimer);
        }

        const toastTimer = window.setTimeout(() => {
          els.toast.classList.remove("show");
          window.setTimeout(() => {
            els.toast.classList.add("hidden");
          }, 180);
        }, 2200);

        setState({ toastTimer });
      }

      function setSearchExpanded(expanded) {
        const isExpanded = Boolean(expanded);
        els.topbarSearchWrap?.classList.toggle("is-open", isExpanded);
        els.topbarSearchWrap?.setAttribute("data-expanded", isExpanded ? "true" : "false");
        els.topbarSearchToggle?.setAttribute("aria-expanded", isExpanded ? "true" : "false");
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

        const accessedSet = new Set(getState().accessedIds || []);

        list.slice(0, 60).forEach((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          const tile = document.createElement("button");
          tile.type = "button";
          tile.className = "folder-file-tile";
          tile.dataset.type = iconTypeFor(note);

          const createdAt = note.createdAt ? new Date(note.createdAt) : null;
          const createdLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString() : "";

          const typeBadge = document.createElement("span");
          typeBadge.className = "folder-file-type";
          typeBadge.textContent = note.sourceType || "text";

          const typeIcon = document.createElement("span");
          typeIcon.className = "folder-file-kind-icon";
          typeIcon.dataset.type = tile.dataset.type;
          typeIcon.innerHTML = noteTypeIconMarkup(typeIcon.dataset.type);

          const topRow = document.createElement("div");
          topRow.className = "folder-file-top";
          topRow.append(typeIcon, typeBadge);

          const titleEl = document.createElement("p");
          titleEl.className = "folder-file-title";
          titleEl.textContent = buildNoteTitle(note);

          const previewEl = document.createElement("p");
          previewEl.className = "folder-file-preview";
          previewEl.textContent = buildContentPreview(note) || "No preview";

          const metaEl = document.createElement("p");
          metaEl.className = "folder-file-meta";
          metaEl.textContent = createdLabel;

          const stateRow = document.createElement("p");
          stateRow.className = "folder-file-state";
          const processed = isProcessedNote(note);
          const accessed = accessedSet.has(String(note.id || ""));
          stateRow.textContent = `${processed ? "Processed" : "Pending"}${accessed ? " • Opened" : ""}`;

          tile.append(topRow, titleEl, previewEl, metaEl, stateRow);

          tile.addEventListener("click", () => {
            openModalForItem(els, note);
            markAccessed(note.id);
            renderView();
          });

          els.folderItemsGrid.appendChild(tile);
        });
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
            item.append(icon, label, states);

            item.addEventListener("click", () => {
              openModalForItem(els, note);
              markAccessed(note.id);
              renderView();
            });

            els.recentNotesList.appendChild(item);
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
          const item = document.createElement("div");
          item.className = "recent-task-item";
          item.title = task.title || "";

          const dot = document.createElement("span");
          dot.className = "recent-task-dot";

          const label = document.createElement("span");
          label.className = "recent-task-label";
          label.textContent = String(task.title || "").trim() || "(untitled task)";

          item.append(dot, label);
          els.recentTasksList.appendChild(item);
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

      function renderView() {
        const query = String(els.topbarSearchInput?.value || "").trim();
        const visibleNotes = query ? searchResults : recentNotes;
        renderFolderItems(visibleNotes);
        renderRecent();
        renderProjectOptions();
      }

      async function refreshNotes() {
        const query = (els.topbarSearchInput?.value || "").trim();
        const includeSearch = Boolean(query);

        try {
          const requests = [
            apiClient.fetchNotes({
              project: folderMeta.name,
              limit: 120,
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

          const results = await Promise.allSettled(requests);
          const recentResult = results[0];
          const searchResult = includeSearch ? results[1] : null;
          const tasksResult = includeSearch ? results[2] : results[1];
          if (recentResult.status !== "fulfilled") throw recentResult.reason;

          if (!isMounted) return;
          recentNotes = Array.isArray(recentResult.value?.items) ? recentResult.value.items : [];
          searchResults =
            includeSearch && searchResult?.status === "fulfilled" && Array.isArray(searchResult.value?.items)
              ? searchResult.value.items
              : [];
          setState({ notes: recentNotes });
          openTasks =
            tasksResult.status === "fulfilled" && Array.isArray(tasksResult.value?.items)
              ? tasksResult.value.items
              : [];
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

      on(els.topbarSearchToggle, "click", () => {
        const expanded = els.topbarSearchWrap?.classList.contains("is-open");
        setSearchExpanded(!expanded);
        if (!expanded) {
          els.topbarSearchInput?.focus();
        }
      });

      on(els.topbarSearchInput, "keydown", async (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        scheduleSearchRefresh({ immediate: true });
      });

      on(els.topbarSearchInput, "input", () => {
        const query = String(els.topbarSearchInput?.value || "").trim();
        scheduleSearchRefresh({ immediate: query.length === 0 });
      });

      on(mountNode, "click", (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        const insideSearch = els.topbarSearchWrap?.contains(target);
        if (!insideSearch && !(els.topbarSearchInput?.value || "").trim()) {
          setSearchExpanded(false);
        }
      });

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
          showToast("File read failed", "error");
        }
      });

      on(els.clearFileBtn, "click", () => {
        clearAttachment();
      });

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
          showToast("Add content first", "error");
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
          showToast("Item saved");
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
            showToast("Save failed", "error");
          } else {
            const nextMock = [buildLocalFallbackNote(payload), ...getState().mockNotes];
            const activeQuery = (els.topbarSearchInput?.value || "").trim();
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
            showToast("Saved locally");
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

      on(els.itemModalClose, "click", () => {
        closeModal(els);
      });

      on(els.itemModalBackdrop, "click", () => {
        closeModal(els);
      });

      on(document, "keydown", (event) => {
        if (event.key === "Escape") {
          closeModal(els);
        }
      });

      ensureDraftFolder(folderMeta.name);
      setSearchExpanded(false);
      clearAttachment();
      setCaptureHint("");
      await refreshNotes();

      return () => {
        isMounted = false;
        const state = getState();
        if (state.toastTimer) {
          clearTimeout(state.toastTimer);
          setState({ toastTimer: null });
        }
        if (searchTimer) {
          clearTimeout(searchTimer);
          searchTimer = null;
        }
        closeModal(els);
        disposers.forEach((dispose) => {
          dispose();
        });
      };
    },
  };
}
