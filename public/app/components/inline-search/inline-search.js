import { buildNoteTitle, buildContentPreview, normalizeCitation } from "../../services/mappers.js";
import { iconTypeFor, noteTypeIconMarkup, deleteIconMarkup } from "../../services/note-utils.js";

export function renderInlineSearchHTML({ placeholder = "Search..." } = {}) {
  return `
    <div class="inline-search">
      <input id="inline-search-input" class="inline-search-input" type="search" placeholder="${placeholder}" />
    </div>
  `;
}

export function queryInlineSearchEls(root) {
  return {
    inlineSearchInput: root.querySelector("#inline-search-input"),
  };
}

/**
 * Render search result rows into a container element.
 * @param {HTMLElement} container - The element to render results into
 * @param {Array} results - Search result entries
 * @param {{ onOpen: (note: any) => void, onDelete: (noteId: string) => void }} callbacks
 */
export function renderSearchResults(container, results, { onOpen, onDelete }) {
  container.innerHTML = "";

  if (!Array.isArray(results) || !results.length) {
    const empty = document.createElement("p");
    empty.className = "ui-empty";
    empty.textContent = "No matching items.";
    container.appendChild(empty);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "inline-search-results";

  results.slice(0, 40).forEach((entry, index) => {
    const note = normalizeCitation(entry, index).note;
    const row = document.createElement("div");
    row.className = "inline-search-result-row";

    const card = document.createElement("button");
    card.type = "button";
    card.className = "inline-search-result";
    card.title = buildNoteTitle(note);

    const icon = document.createElement("span");
    icon.className = "inline-search-result-icon";
    icon.dataset.type = iconTypeFor(note);
    icon.innerHTML = noteTypeIconMarkup(icon.dataset.type);

    const body = document.createElement("span");
    body.className = "inline-search-result-body";

    const title = document.createElement("span");
    title.className = "inline-search-result-title";
    title.textContent = buildNoteTitle(note);

    const preview = document.createElement("span");
    preview.className = "inline-search-result-preview";
    preview.textContent = buildContentPreview(note);

    body.append(title, preview);
    card.append(icon, body);

    card.addEventListener("click", () => onOpen(note));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "inline-search-delete";
    deleteBtn.title = `Delete item ${buildNoteTitle(note)}`;
    deleteBtn.setAttribute("aria-label", `Delete item ${buildNoteTitle(note)}`);
    deleteBtn.innerHTML = deleteIconMarkup();
    deleteBtn.addEventListener("click", async () => onDelete(note.id));

    row.append(card, deleteBtn);
    wrapper.appendChild(row);
  });

  container.appendChild(wrapper);
}

export function clearSearch(els, renderDefault) {
  if (els.inlineSearchInput) {
    els.inlineSearchInput.value = "";
  }
  if (renderDefault) renderDefault();
}

export function initInlineSearchHandlers(els, { onInput, onClear, onKeydown }) {
  const handlers = [];

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  addHandler(els.inlineSearchInput, "input", () => {
    if (onInput) onInput((els.inlineSearchInput?.value || "").trim());
  });

  addHandler(els.inlineSearchInput, "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (onKeydown) onKeydown("enter");
    } else if (event.key === "Escape") {
      if (onClear) onClear();
      els.inlineSearchInput?.blur();
    }
  });

  return () => handlers.forEach((dispose) => dispose());
}
