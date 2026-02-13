import { buildNoteTitle } from "../../services/mappers.js";
import {
  compactInlineText,
  buildModalSummary,
  buildModalFullExtract,
} from "../../services/note-utils.js";

let currentNote = null;

export function renderItemModalHTML() {
  return `
    <div id="item-modal" class="item-modal hidden" aria-hidden="true">
      <div id="item-modal-backdrop" class="item-modal-backdrop"></div>
      <article class="item-modal-panel" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
        <div class="item-modal-header">
          <p id="item-modal-project" class="item-modal-project"></p>
          <button id="item-modal-edit-btn" class="item-modal-edit-btn" type="button" aria-label="Edit">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8.5 2.5l3 3M1.5 9.5l6-6 3 3-6 6H1.5v-3z"/></svg>
          </button>
          <button id="item-modal-close" class="item-modal-close" type="button" aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
          </button>
        </div>
        <div class="item-modal-body">
          <h3 id="item-modal-title" class="item-modal-title"></h3>
          <div id="item-modal-content" class="item-modal-content"></div>
          <img id="item-modal-image" class="item-modal-image hidden" alt="Item preview" />
          <button id="item-modal-toggle" class="item-modal-toggle hidden" type="button" aria-expanded="false">Show full text</button>
          <pre id="item-modal-full-content" class="item-modal-full-content hidden"></pre>
        </div>
        <form id="item-modal-edit-form" class="item-modal-edit-form hidden">
          <label class="item-modal-edit-label">Content
            <textarea id="item-modal-edit-content" class="item-modal-edit-textarea" rows="5"></textarea>
          </label>
          <label class="item-modal-edit-label">Tags (comma-separated)
            <input id="item-modal-edit-tags" class="item-modal-edit-input" type="text" placeholder="tag1, tag2" />
          </label>
          <label class="item-modal-edit-label">Folder
            <input id="item-modal-edit-project" class="item-modal-edit-input" type="text" placeholder="Project name" />
          </label>
          <div class="item-modal-edit-actions">
            <button id="item-modal-edit-cancel" class="item-modal-action-btn item-modal-cancel-btn" type="button">Cancel</button>
            <button id="item-modal-edit-save" class="item-modal-action-btn item-modal-save-btn" type="submit">Save</button>
          </div>
        </form>
      </article>
    </div>
  `;
}

export function queryItemModalEls(root) {
  return {
    itemModal: root.querySelector("#item-modal"),
    itemModalBackdrop: root.querySelector("#item-modal-backdrop"),
    itemModalClose: root.querySelector("#item-modal-close"),
    itemModalProject: root.querySelector("#item-modal-project"),
    itemModalTitle: root.querySelector("#item-modal-title"),
    itemModalContent: root.querySelector("#item-modal-content"),
    itemModalToggle: root.querySelector("#item-modal-toggle"),
    itemModalFullContent: root.querySelector("#item-modal-full-content"),
    itemModalImage: root.querySelector("#item-modal-image"),
    itemModalEditBtn: root.querySelector("#item-modal-edit-btn"),
    itemModalEditForm: root.querySelector("#item-modal-edit-form"),
    itemModalEditContent: root.querySelector("#item-modal-edit-content"),
    itemModalEditTags: root.querySelector("#item-modal-edit-tags"),
    itemModalEditProject: root.querySelector("#item-modal-edit-project"),
    itemModalEditCancel: root.querySelector("#item-modal-edit-cancel"),
    itemModalEditSave: root.querySelector("#item-modal-edit-save"),
  };
}

function exitEditMode(els) {
  if (!els.itemModal) return;
  els.itemModal.classList.remove("item-modal--editing");
  if (els.itemModalEditForm) els.itemModalEditForm.classList.add("hidden");
}

function enterEditMode(els) {
  if (!els.itemModal || !currentNote) return;
  els.itemModal.classList.add("item-modal--editing");
  if (els.itemModalEditForm) els.itemModalEditForm.classList.remove("hidden");
  if (els.itemModalEditContent) els.itemModalEditContent.value = currentNote.content || "";
  if (els.itemModalEditTags) els.itemModalEditTags.value = (currentNote.tags || []).join(", ");
  if (els.itemModalEditProject) els.itemModalEditProject.value = currentNote.project || "";
  els.itemModalEditContent?.focus();
}

export function openItemModal(els, note) {
  if (!els.itemModal || !note) return;
  currentNote = note;

  exitEditMode(els);

  els.itemModalTitle.textContent = buildNoteTitle(note);
  const projectParts = [note.project || "General"];
  if (note.fileName) {
    projectParts.push(note.fileName);
  }
  els.itemModalProject.textContent = projectParts.join(" \u2022 ");
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

export function closeItemModal(els) {
  if (!els.itemModal) return;
  currentNote = null;
  exitEditMode(els);
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

export function getCurrentNote() {
  return currentNote;
}

export function initItemModalHandlers(els, { onClose, onSave }) {
  const handlers = [];

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  addHandler(els.itemModalClose, "click", () => onClose());
  addHandler(els.itemModalBackdrop, "click", () => onClose());

  addHandler(els.itemModalEditBtn, "click", () => {
    enterEditMode(els);
  });

  addHandler(els.itemModalEditCancel, "click", () => {
    exitEditMode(els);
  });

  addHandler(els.itemModalEditForm, "submit", (e) => {
    e.preventDefault();
    if (!currentNote || !onSave) return;
    const payload = {
      content: (els.itemModalEditContent?.value || "").trim(),
      tags: (els.itemModalEditTags?.value || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      project: (els.itemModalEditProject?.value || "").trim(),
    };
    onSave(currentNote.id, payload);
  });

  return () => handlers.forEach((dispose) => dispose());
}
