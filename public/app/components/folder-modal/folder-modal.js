import {
  FOLDER_COLOR_TOKENS,
  normalizeFolderColor,
} from "../../services/folder-utils.js";

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

/**
 * @param {{ showKindRow?: boolean }} options
 */
export function renderFolderModalHTML({ showKindRow = false } = {}) {
  const kindRowHTML = showKindRow
    ? `
        <div class="folder-kind-row" id="folder-kind-row" role="radiogroup" aria-label="Create type">
          <button id="folder-kind-folder" class="folder-kind-choice is-selected" type="button" data-kind="folder" aria-pressed="true">
            Folder
          </button>
          <button id="folder-kind-task" class="folder-kind-choice" type="button" data-kind="task" aria-pressed="false">
            Task
          </button>
        </div>
      `
    : "";

  return `
    <div id="folder-modal" class="folder-modal hidden" aria-hidden="true">
      <div id="folder-modal-backdrop" class="folder-modal-backdrop"></div>
      <article class="folder-modal-panel" role="dialog" aria-modal="true">
        <button id="folder-modal-close" class="folder-modal-close" type="button" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
        </button>

        <h3 id="folder-modal-heading" class="folder-modal-heading">New Folder</h3>

        ${kindRowHTML}

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
          </div>

          <div class="folder-form-actions">
            <button id="folder-create-btn" class="folder-create-btn" type="submit">Create Folder</button>
          </div>
        </form>
      </article>
    </div>
  `;
}

export function queryFolderModalEls(root) {
  return {
    folderModal: root.querySelector("#folder-modal"),
    folderModalBackdrop: root.querySelector("#folder-modal-backdrop"),
    folderModalClose: root.querySelector("#folder-modal-close"),
    folderModalHeading: root.querySelector("#folder-modal-heading"),
    folderKindRow: root.querySelector("#folder-kind-row"),
    folderKindFolder: root.querySelector("#folder-kind-folder"),
    folderKindTask: root.querySelector("#folder-kind-task"),
    folderForm: root.querySelector("#folder-form"),
    folderNameLabel: root.querySelector("#folder-name-label"),
    folderNameInput: root.querySelector("#folder-name-input"),
    folderDescriptionWrap: root.querySelector("#folder-description-wrap"),
    folderDescriptionInput: root.querySelector("#folder-description-input"),
    folderStyleWrap: root.querySelector("#folder-style-wrap"),
    folderColorRow: root.querySelector("#folder-color-row"),
    folderCreateBtn: root.querySelector("#folder-create-btn"),
  };
}

export function openFolderModal(els, { color = "green", kind = "folder" } = {}) {
  if (!els.folderModal) return;

  if (els.folderModal.dataset) {
    els.folderModal.dataset.createKind = kind;
  }
  if (els.folderNameInput) els.folderNameInput.value = "";
  if (els.folderDescriptionInput) els.folderDescriptionInput.value = "";

  els.folderColorRow?.querySelectorAll(".folder-color-choice").forEach((button) => {
    const isSelected = button.dataset.color === color;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  });

  els.folderModal.classList.remove("hidden");
  els.folderModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.folderNameInput?.focus();
}

export function closeFolderModal(els) {
  if (!els.folderModal) return;
  els.folderModal.classList.add("hidden");
  els.folderModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function getSelectedFolderColor(els) {
  const selected = els.folderColorRow?.querySelector(".folder-color-choice.is-selected");
  return normalizeFolderColor(selected?.dataset.color, "green");
}

export function initFolderModalHandlers(els, { onClose, onColorSelect }) {
  const handlers = [];

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  addHandler(els.folderModalClose, "click", () => onClose());
  addHandler(els.folderModalBackdrop, "click", () => onClose());

  addHandler(els.folderColorRow, "click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".folder-color-choice");
    if (!(button instanceof HTMLButtonElement)) return;

    els.folderColorRow?.querySelectorAll(".folder-color-choice").forEach((entry) => {
      const active = entry === button;
      entry.classList.toggle("is-selected", active);
      entry.setAttribute("aria-pressed", active ? "true" : "false");
    });

    if (onColorSelect) onColorSelect(button.dataset.color);
  });

  return () => handlers.forEach((dispose) => dispose());
}
