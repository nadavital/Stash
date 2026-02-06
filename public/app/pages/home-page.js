import { renderComposer } from "../components/composer/composer.js";
import { renderHomeFolderGrid } from "../components/home-folder-grid/home-folder-grid.js";
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

function renderFolderColorChoices() {
  return FOLDER_COLOR_TOKENS.map((color, index) => {
    const activeClass = index === 0 ? " is-selected" : "";
    const activePressed = index === 0 ? "true" : "false";
    return `
      <button class="folder-color-choice${activeClass}" type="button" data-color="${color}" aria-pressed="${activePressed}">
        <span class="folder-color-dot" data-color="${color}" aria-hidden="true"></span>
      </button>
    `;
  }).join("");
}

function renderFolderSymbolChoices() {
  return FOLDER_SYMBOL_OPTIONS.map((symbol, index) => {
    const activeClass = index === 0 ? " is-selected" : "";
    const activePressed = index === 0 ? "true" : "false";
    return `
      <button class="folder-symbol-choice${activeClass}" type="button" data-symbol="${symbol}" aria-pressed="${activePressed}">
        <span class="folder-symbol-badge">${symbol}</span>
      </button>
    `;
  }).join("");
}

function renderHomePageShell() {
  return `
    <section class="page page-home">
      ${renderTopbar({ showNewFolder: true })}

      <section class="home-layout">
        <div class="home-explorer-pane">
          ${renderHomeFolderGrid()}
        </div>

        ${renderHomeRecentList()}
      </section>

      ${renderComposer({ mode: "home" })}
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

    <div id="folder-modal" class="folder-modal hidden" aria-hidden="true">
      <div id="folder-modal-backdrop" class="folder-modal-backdrop"></div>
      <article class="folder-modal-panel" role="dialog" aria-modal="true">
        <button id="folder-modal-close" class="folder-modal-close" type="button" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
        </button>

        <h3 id="folder-modal-heading" class="folder-modal-heading">New Folder</h3>

        <div class="folder-kind-row" id="folder-kind-row" role="radiogroup" aria-label="Create type">
          <button id="folder-kind-folder" class="folder-kind-choice is-selected" type="button" data-kind="folder" aria-pressed="true">
            Folder
          </button>
          <button id="folder-kind-task" class="folder-kind-choice" type="button" data-kind="task" aria-pressed="false">
            Task
          </button>
        </div>

        <form id="folder-form" class="folder-form">
          <label id="folder-name-label" class="folder-form-label" for="folder-name-input">Name</label>
          <input id="folder-name-input" class="folder-input" type="text" maxlength="64" placeholder="e.g. Launch Plan" autocomplete="off" />

          <div id="folder-description-wrap">
            <label class="folder-form-label" for="folder-description-input">Description</label>
            <textarea id="folder-description-input" class="folder-textarea" rows="2" maxlength="180" placeholder="Short description"></textarea>
          </div>

          <div id="folder-style-wrap">
            <div class="folder-color-row" id="folder-color-row">
              ${renderFolderColorChoices()}
            </div>

            <div class="folder-symbol-row" id="folder-symbol-row">
              ${renderFolderSymbolChoices()}
            </div>
          </div>

          <div class="folder-form-actions">
            <button id="folder-create-btn" class="folder-create-btn" type="submit">Create Folder</button>
          </div>
        </form>
      </article>
    </div>

    <div id="search-overlay" class="search-overlay hidden" aria-hidden="true">
      <div id="search-overlay-backdrop" class="search-overlay-backdrop"></div>
      <article class="search-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="search-overlay-title">
        <div class="search-overlay-head">
          <p id="search-overlay-title" class="search-overlay-title">Search Results</p>
          <button id="search-overlay-close" class="search-overlay-close" type="button" aria-label="Close search results">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
          </button>
        </div>
        <label class="search-overlay-input-wrap" for="search-overlay-input">
          <span class="topbar-visually-hidden">Search memory</span>
          <input id="search-overlay-input" class="search-overlay-input" type="search" placeholder="Search" />
        </label>
        <div id="search-overlay-list" class="search-overlay-list"></div>
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
    foldersList: mountNode.querySelector("#home-folders-list"),
    foldersEmpty: mountNode.querySelector("#home-folders-empty"),
    foldersError: mountNode.querySelector("#home-folders-error"),
    searchOverlay: mountNode.querySelector("#search-overlay"),
    searchOverlayBackdrop: mountNode.querySelector("#search-overlay-backdrop"),
    searchOverlayTitle: mountNode.querySelector("#search-overlay-title"),
    searchOverlayClose: mountNode.querySelector("#search-overlay-close"),
    searchOverlayInput: mountNode.querySelector("#search-overlay-input"),
    searchOverlayList: mountNode.querySelector("#search-overlay-list"),
    newFolderBtn: mountNode.querySelector("#topbar-new-folder-btn"),
    itemModal: mountNode.querySelector("#item-modal"),
    itemModalBackdrop: mountNode.querySelector("#item-modal-backdrop"),
    itemModalClose: mountNode.querySelector("#item-modal-close"),
    itemModalProject: mountNode.querySelector("#item-modal-project"),
    itemModalTitle: mountNode.querySelector("#item-modal-title"),
    itemModalContent: mountNode.querySelector("#item-modal-content"),
    itemModalToggle: mountNode.querySelector("#item-modal-toggle"),
    itemModalFullContent: mountNode.querySelector("#item-modal-full-content"),
    itemModalImage: mountNode.querySelector("#item-modal-image"),
    folderModal: mountNode.querySelector("#folder-modal"),
    folderModalBackdrop: mountNode.querySelector("#folder-modal-backdrop"),
    folderModalClose: mountNode.querySelector("#folder-modal-close"),
    folderModalHeading: mountNode.querySelector("#folder-modal-heading"),
    folderKindRow: mountNode.querySelector("#folder-kind-row"),
    folderKindFolder: mountNode.querySelector("#folder-kind-folder"),
    folderKindTask: mountNode.querySelector("#folder-kind-task"),
    folderForm: mountNode.querySelector("#folder-form"),
    folderNameLabel: mountNode.querySelector("#folder-name-label"),
    folderNameInput: mountNode.querySelector("#folder-name-input"),
    folderDescriptionWrap: mountNode.querySelector("#folder-description-wrap"),
    folderDescriptionInput: mountNode.querySelector("#folder-description-input"),
    folderStyleWrap: mountNode.querySelector("#folder-style-wrap"),
    folderColorRow: mountNode.querySelector("#folder-color-row"),
    folderSymbolRow: mountNode.querySelector("#folder-symbol-row"),
    folderCreateBtn: mountNode.querySelector("#folder-create-btn"),
    toast: document.getElementById("toast"),
  };
}

function iconTypeFor(note) {
  if (note.sourceType === "image") return "image";
  if (note.sourceType === "link") return "link";
  if ((note.sourceType || "").toLowerCase() === "file") return "file";
  return "text";
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

function folderKindIconMarkup() {
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d="M2.5 5.5A2.5 2.5 0 0 1 5 3h3.7c.7 0 1.3.3 1.8.8l.9 1H15A2.5 2.5 0 0 1 17.5 7v7.5A2.5 2.5 0 0 1 15 17H5a2.5 2.5 0 0 1-2.5-2.5v-9Z"/>
    </svg>
  `;
}

function deleteIconMarkup() {
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path fill="currentColor" d="M8.5 3a1 1 0 0 0-1 1v.5H5.2a.8.8 0 1 0 0 1.6h.5v9.2A1.7 1.7 0 0 0 7.4 17h5.2a1.7 1.7 0 0 0 1.7-1.7V6.1h.5a.8.8 0 1 0 0-1.6h-2.3V4a1 1 0 0 0-1-1h-3Zm.6 3.1a.8.8 0 0 1 .8.8v6a.8.8 0 1 1-1.6 0v-6a.8.8 0 0 1 .8-.8Zm2.4 0a.8.8 0 0 1 .8.8v6a.8.8 0 1 1-1.6 0v-6a.8.8 0 0 1 .8-.8Z"/>
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

function openItemModal(els, note) {
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

function closeItemModal(els) {
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

function openFolderModal(els, selectedColor = "sky", selectedSymbol = "DOC", createKind = "folder") {
  if (!els.folderModal) return;

  els.folderModal.dataset.createKind = createKind;
  els.folderNameInput.value = "";
  els.folderDescriptionInput.value = "";

  els.folderColorRow?.querySelectorAll(".folder-color-choice").forEach((button) => {
    const isSelected = button.dataset.color === selectedColor;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });

  els.folderSymbolRow?.querySelectorAll(".folder-symbol-choice").forEach((button) => {
    const isSelected = button.dataset.symbol === selectedSymbol;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });

  els.folderModal.classList.remove("hidden");
  els.folderModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.folderNameInput?.focus();
}

function closeFolderModal(els) {
  if (!els.folderModal) return;
  els.folderModal.classList.add("hidden");
  els.folderModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function createHomePage({ store, apiClient }) {
  return {
    async mount({ mountNode, navigate }) {
      mountNode.innerHTML = renderHomePageShell();
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

      function upsertDraftFolder({ name, description = "", color = "sky", symbol = "DOC" }) {
        const normalizedName = String(name || "").trim();
        if (!normalizedName) return;

        const normalizedDescription = String(description || "").trim();
        const normalizedColor = normalizeFolderColor(color, fallbackColorForFolder(normalizedName));
        const normalizedSymbol = normalizeFolderSymbol(symbol, "DOC");
        const drafts = normalizeFolderDrafts(getState().draftFolders);
        const key = normalizedName.toLowerCase();
        const index = drafts.findIndex((entry) => entry.name.toLowerCase() === key);

        if (index >= 0) {
          drafts[index] = {
            ...drafts[index],
            name: normalizedName,
            description: normalizedDescription || drafts[index].description || "",
            color: normalizedColor,
            symbol: normalizedSymbol,
          };
        } else {
          drafts.push({
            name: normalizedName,
            description: normalizedDescription,
            color: normalizedColor,
            symbol: normalizedSymbol,
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

      function setSearchQuery(value) {
        const nextValue = String(value ?? "");
        if (els.topbarSearchInput && els.topbarSearchInput.value !== nextValue) {
          els.topbarSearchInput.value = nextValue;
        }
        if (els.searchOverlayInput && els.searchOverlayInput.value !== nextValue) {
          els.searchOverlayInput.value = nextValue;
        }
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
        const activeQuery = (els.topbarSearchInput?.value || "").trim();
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
        const activeQuery = (els.topbarSearchInput?.value || "").trim();
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
          showToast("Item deleted");
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Delete endpoint unavailable");
          const alreadyDeleted = /not found|request failed \(404\)/i.test(message);
          if (alreadyDeleted) {
            showToast("Item already deleted");
            await refreshNotes();
            return;
          }

          removeNoteFromFallback(normalizedId);
          showToast("Deleted locally");
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
          dismissSearchOverlay({ clearQuery: true });
          const deletedCount = Number(result?.deletedCount || 0);
          showToast(deletedCount > 0 ? `Deleted ${deletedCount} item${deletedCount === 1 ? "" : "s"}` : "Folder deleted");
          await refreshNotes();
        } catch (error) {
          if (!isMounted) return;
          const message = conciseTechnicalError(error, "Folder delete endpoint unavailable");
          removeDraftFolder(normalizedFolder);
          removeFolderFromFallback(normalizedFolder);
          dismissSearchOverlay({ clearQuery: true });
          showToast("Folder removed locally");
          apiClient.adapterLog("delete_folder_fallback", message);
        }
      }

      function renderFolders() {
        if (!els.foldersList || !els.foldersEmpty) return;
        const state = getState();
        const folderMap = new Map();

        normalizeFolderDrafts(state.draftFolders).forEach((folder) => {
          folderMap.set(folder.name.toLowerCase(), {
            ...folder,
            count: 0,
          });
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

        folders.slice(0, 40).forEach((folder) => {
          const card = document.createElement("article");
          card.className = "folder-pill";
          card.tabIndex = 0;
          card.setAttribute("role", "link");
          card.dataset.color = folder.color;
          card.dataset.symbol = folder.symbol;

          const top = document.createElement("div");
          top.className = "folder-pill-top";

          const kindIcon = document.createElement("span");
          kindIcon.className = "folder-pill-kind-icon";
          kindIcon.innerHTML = folderKindIconMarkup();

          const symbolEl = document.createElement("span");
          symbolEl.className = "folder-symbol-badge";
          symbolEl.textContent = normalizeFolderSymbol(folder.symbol, "DOC");

          const countEl = document.createElement("span");
          countEl.className = "folder-pill-count";
          countEl.textContent = `${folder.count}`;

          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "folder-pill-delete";
          deleteBtn.title = `Delete folder ${folder.name}`;
          deleteBtn.setAttribute("aria-label", `Delete folder ${folder.name}`);
          deleteBtn.innerHTML = deleteIconMarkup();

          top.append(kindIcon, symbolEl, countEl, deleteBtn);

          const nameEl = document.createElement("span");
          nameEl.className = "folder-pill-name";
          nameEl.textContent = folder.name;

          const descriptionEl = document.createElement("p");
          descriptionEl.className = "folder-pill-desc";
          descriptionEl.textContent = folder.description || "No description";

          card.append(top, nameEl, descriptionEl);

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
        });
      }

      function renderRecent() {
        if (!els.recentNotesList || !els.recentTasksList) return;
        els.recentNotesList.innerHTML = "";
        els.recentTasksList.innerHTML = "";

        const noteItems = Array.isArray(recentNotes) ? recentNotes.slice(0, 16) : [];
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
            item.append(icon, label, states);

            item.addEventListener("click", () => {
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

      function renderSearchResults(query) {
        if (!els.searchOverlay || !els.searchOverlayList) return;

        const normalizedQuery = String(query || "").trim();
        if (!normalizedQuery) {
          els.searchOverlay.classList.add("hidden");
          els.searchOverlay.setAttribute("aria-hidden", "true");
          els.searchOverlayList.innerHTML = "";
          return;
        }

        els.searchOverlay.classList.remove("hidden");
        els.searchOverlay.setAttribute("aria-hidden", "false");
        setSearchQuery(query);
        if (document.activeElement === els.topbarSearchInput) {
          els.searchOverlayInput?.focus();
          const end = els.searchOverlayInput?.value?.length || 0;
          els.searchOverlayInput?.setSelectionRange(end, end);
        }
        if (els.searchOverlayTitle) {
          const count = Array.isArray(searchResults) ? searchResults.length : 0;
          els.searchOverlayTitle.textContent = `Search Results (${count})`;
        }

        els.searchOverlayList.innerHTML = "";
        if (!Array.isArray(searchResults) || !searchResults.length) {
          const empty = document.createElement("p");
          empty.className = "ui-empty";
          empty.textContent = "No matching items.";
          els.searchOverlayList.appendChild(empty);
          return;
        }

        searchResults.slice(0, 40).forEach((entry, index) => {
          const note = normalizeCitation(entry, index).note;
          const row = document.createElement("div");
          row.className = "search-overlay-result-row";

          const card = document.createElement("button");
          card.type = "button";
          card.className = "search-overlay-result";
          card.title = buildNoteTitle(note);

          const icon = document.createElement("span");
          icon.className = "search-overlay-result-icon";
          icon.dataset.type = iconTypeFor(note);
          icon.innerHTML = noteTypeIconMarkup(icon.dataset.type);

          const body = document.createElement("span");
          body.className = "search-overlay-result-body";

          const title = document.createElement("span");
          title.className = "search-overlay-result-title";
          title.textContent = buildNoteTitle(note);

          const preview = document.createElement("span");
          preview.className = "search-overlay-result-preview";
          preview.textContent = buildContentPreview(note);

          body.append(title, preview);
          card.append(icon, body);

          card.addEventListener("click", () => {
            openItemModal(els, note);
            markAccessed(note.id);
            setSearchQuery("");
            renderSearchResults("");
            renderRecent();
          });

          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = "search-overlay-delete";
          deleteBtn.title = `Delete item ${buildNoteTitle(note)}`;
          deleteBtn.setAttribute("aria-label", `Delete item ${buildNoteTitle(note)}`);
          deleteBtn.innerHTML = deleteIconMarkup();
          deleteBtn.addEventListener("click", async () => {
            await deleteNoteById(note.id);
          });

          row.append(card, deleteBtn);
          els.searchOverlayList.appendChild(row);
        });
      }

      function dismissSearchOverlay({ clearQuery = false } = {}) {
        const hadQuery = Boolean((els.topbarSearchInput?.value || "").trim());
        if (clearQuery) {
          setSearchQuery("");
        }
        renderSearchResults("");
        if (clearQuery && hadQuery) {
          scheduleSearchRefresh({ immediate: true });
        }
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
        const query = String(els.topbarSearchInput?.value || "").trim();
        renderFolders();
        renderRecent();
        renderSearchResults(query);
        renderProjectOptions();
      }

      async function refreshNotes() {
        const query = (els.topbarSearchInput?.value || "").trim();
        const includeSearch = Boolean(query);

        try {
          const requests = [apiClient.fetchNotes({ limit: 120 })];
          if (includeSearch) {
            requests.push(apiClient.fetchNotes({ query, limit: 120 }));
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

      function getSelectedFolderColor() {
        const selected = els.folderColorRow?.querySelector(".folder-color-choice.is-selected");
        return normalizeFolderColor(selected?.dataset.color, "sky");
      }

      function getSelectedFolderSymbol() {
        const selected = els.folderSymbolRow?.querySelector(".folder-symbol-choice.is-selected");
        return normalizeFolderSymbol(selected?.dataset.symbol, "DOC");
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
        const query = String(els.topbarSearchInput?.value || "");
        setSearchQuery(query);
        scheduleSearchRefresh({ immediate: query.trim().length === 0 });
      });

      on(els.searchOverlayInput, "keydown", async (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        scheduleSearchRefresh({ immediate: true });
      });

      on(els.searchOverlayInput, "input", () => {
        const query = String(els.searchOverlayInput?.value || "");
        setSearchQuery(query);
        scheduleSearchRefresh({ immediate: query.trim().length === 0 });
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
        const project = String(els.projectSelect?.value || els.projectInput?.value || "").trim();
        const content = rawContent;

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
            recentNotes = filterAndRankMockNotes(nextMock, { limit: 120 });
            searchResults = activeQuery ? filterAndRankMockNotes(nextMock, { query: activeQuery, limit: 120 }) : [];
            setState({ mockNotes: nextMock, notes: recentNotes });

            setCaptureHint("Saved locally.", "warn");
            showToast("Saved locally");
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
        openFolderModal(els, "sky", "DOC", "folder");
        setFolderModalKind("folder");
      });

      on(els.folderKindRow, "click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest(".folder-kind-choice");
        if (!(button instanceof HTMLButtonElement)) return;
        setFolderModalKind(button.dataset.kind || "folder");
      });

      on(els.folderColorRow, "click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest(".folder-color-choice");
        if (!(button instanceof HTMLButtonElement)) return;

        els.folderColorRow?.querySelectorAll(".folder-color-choice").forEach((entry) => {
          const active = entry === button;
          entry.classList.toggle("is-selected", active);
          entry.setAttribute("aria-pressed", active ? "true" : "false");
        });
      });

      on(els.folderSymbolRow, "click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest(".folder-symbol-choice");
        if (!(button instanceof HTMLButtonElement)) return;

        els.folderSymbolRow?.querySelectorAll(".folder-symbol-choice").forEach((entry) => {
          const active = entry === button;
          entry.classList.toggle("is-selected", active);
          entry.setAttribute("aria-pressed", active ? "true" : "false");
        });
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
            showToast("Task created");
            await refreshNotes();
          } catch (error) {
            setCaptureHint(conciseTechnicalError(error, "Task save failed"), "warn");
            showToast("Task save failed", "error");
          }
          return;
        }

        const description = String(els.folderDescriptionInput?.value || "").trim();
        const color = getSelectedFolderColor();
        const symbol = getSelectedFolderSymbol();

        upsertDraftFolder({ name, description, color, symbol });
        renderFolders();
        renderProjectOptions();
        closeFolderModal(els);
        navigate(`#/folder/${encodeURIComponent(name)}`);
      });

      on(els.folderModalClose, "click", () => {
        closeFolderModal(els);
      });

      on(els.folderModalBackdrop, "click", () => {
        closeFolderModal(els);
      });

      on(els.searchOverlayClose, "click", () => {
        dismissSearchOverlay({ clearQuery: true });
      });

      on(els.searchOverlayBackdrop, "click", () => {
        dismissSearchOverlay({ clearQuery: true });
      });

      on(els.itemModalClose, "click", () => {
        closeItemModal(els);
      });

      on(els.itemModalBackdrop, "click", () => {
        closeItemModal(els);
      });

      on(document, "keydown", (event) => {
        if (event.key !== "Escape") return;
        dismissSearchOverlay({ clearQuery: true });
        closeItemModal(els);
        closeFolderModal(els);
      });

      setFolderModalKind("folder");
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
        closeItemModal(els);
        closeFolderModal(els);
        disposers.forEach((dispose) => {
          dispose();
        });
      };
    },
  };
}
