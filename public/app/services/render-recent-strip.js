import { buildNoteTitle, normalizeCitation } from "./mappers.js";
import { iconTypeFor, getNoteProcessingState, relativeTime } from "./note-utils.js";

/**
 * Renders the horizontal recent-notes strip shared by home-page and folder-page.
 *
 * @param {HTMLElement} container – the #recent-notes-list element
 * @param {Array} notes          – citation-shaped entries
 * @param {object} opts
 * @param {(note: object) => void} opts.onOpen – called when a card is clicked
 * @param {number} [opts.limit=12]
 */
export function renderRecentNoteStrip(container, notes, { onOpen, limit = 12 }) {
  if (!container) return;
  container.innerHTML = "";

  const noteItems = Array.isArray(notes) ? notes.slice(0, limit) : [];

  if (!noteItems.length) {
    const emptyNotes = document.createElement("p");
    emptyNotes.className = "ui-empty";
    emptyNotes.textContent = "No recent notes.";
    container.appendChild(emptyNotes);
    return;
  }

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

    item.addEventListener("click", () => onOpen(note));

    container.appendChild(item);
  });
}
