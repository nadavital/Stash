function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMoveModalHTML() {
  return `
    <div id="move-modal" class="move-modal hidden" aria-hidden="true">
      <div id="move-modal-backdrop" class="move-modal-backdrop"></div>
      <article class="move-modal-panel" role="dialog" aria-modal="true" aria-labelledby="move-modal-heading">
        <button id="move-modal-close" class="move-modal-close" type="button" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
        </button>

        <h3 id="move-modal-heading" class="move-modal-heading">Move to folder</h3>

        <form id="move-modal-form" class="move-modal-form">
          <label class="move-modal-label" for="move-modal-input">Destination</label>
          <input
            id="move-modal-input"
            class="move-modal-input"
            type="text"
            maxlength="64"
            autocomplete="off"
            placeholder="Type a folder name"
          />

          <p id="move-modal-hint" class="move-modal-hint">Pick an existing folder or type a new one.</p>
          <div id="move-modal-suggestions" class="move-modal-suggestions" aria-label="Folder suggestions"></div>

          <div class="move-modal-actions">
            <button id="move-modal-cancel" class="minimal-action" type="button">Cancel</button>
            <button id="move-modal-submit" class="btn-primary" type="submit">Move</button>
          </div>
        </form>
      </article>
    </div>
  `;
}

export function queryMoveModalEls(root) {
  return {
    moveModal: root.querySelector("#move-modal"),
    moveModalBackdrop: root.querySelector("#move-modal-backdrop"),
    moveModalClose: root.querySelector("#move-modal-close"),
    moveModalHeading: root.querySelector("#move-modal-heading"),
    moveModalForm: root.querySelector("#move-modal-form"),
    moveModalInput: root.querySelector("#move-modal-input"),
    moveModalHint: root.querySelector("#move-modal-hint"),
    moveModalSuggestions: root.querySelector("#move-modal-suggestions"),
    moveModalCancel: root.querySelector("#move-modal-cancel"),
    moveModalSubmit: root.querySelector("#move-modal-submit"),
  };
}

export function renderMoveModalSuggestions(els, suggestions = [], currentValue = "") {
  if (!els.moveModalSuggestions) return;
  const normalizedCurrent = String(currentValue || "").trim().toLowerCase();
  const values = [...new Set((Array.isArray(suggestions) ? suggestions : [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean))]
    .slice(0, 10);

  els.moveModalSuggestions.innerHTML = "";
  if (!values.length) {
    const empty = document.createElement("p");
    empty.className = "move-modal-empty";
    empty.textContent = "No folder suggestions yet.";
    els.moveModalSuggestions.appendChild(empty);
    return;
  }

  values.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "move-modal-suggestion";
    button.dataset.value = entry;
    button.setAttribute("aria-label", `Use folder ${escapeHtml(entry)}`);
    button.textContent = entry;
    if (entry.toLowerCase() === normalizedCurrent) {
      button.classList.add("is-selected");
    }
    els.moveModalSuggestions.appendChild(button);
  });
}

export function openMoveModal(
  els,
  {
    title = "Move to folder",
    confirmLabel = "Move",
    value = "",
    placeholder = "Type a folder name",
    hint = "Pick an existing folder or type a new one.",
    suggestions = [],
  } = {}
) {
  if (!els.moveModal) return;
  if (els.moveModalHeading) els.moveModalHeading.textContent = title;
  if (els.moveModalSubmit) els.moveModalSubmit.textContent = confirmLabel;
  if (els.moveModalInput) {
    els.moveModalInput.value = value;
    els.moveModalInput.placeholder = placeholder;
  }
  if (els.moveModalHint) {
    els.moveModalHint.textContent = hint;
  }
  renderMoveModalSuggestions(els, suggestions, value);
  els.moveModal.classList.remove("hidden");
  els.moveModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.moveModalInput?.focus();
  els.moveModalInput?.select();
}

export function closeMoveModal(els) {
  if (!els.moveModal) return;
  els.moveModal.classList.add("hidden");
  els.moveModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function setMoveModalLoading(els, loading) {
  const isLoading = Boolean(loading);
  if (els.moveModalInput) els.moveModalInput.disabled = isLoading;
  if (els.moveModalCancel) els.moveModalCancel.disabled = isLoading;
  if (els.moveModalClose) els.moveModalClose.disabled = isLoading;
  if (els.moveModalSubmit) els.moveModalSubmit.disabled = isLoading;
  if (els.moveModal) {
    els.moveModal.classList.toggle("is-loading", isLoading);
  }
}

export function initMoveModalHandlers(els, { onClose, onSubmit, onInput, onSuggestionPick } = {}) {
  const handlers = [];

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  addHandler(els.moveModalClose, "click", () => onClose?.());
  addHandler(els.moveModalBackdrop, "click", () => onClose?.());
  addHandler(els.moveModalCancel, "click", () => onClose?.());

  addHandler(els.moveModalForm, "submit", (event) => {
    event.preventDefault();
    onSubmit?.((els.moveModalInput?.value || "").trim());
  });

  addHandler(els.moveModalInput, "input", () => {
    onInput?.((els.moveModalInput?.value || "").trim());
  });

  addHandler(els.moveModal, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
    }
  });

  addHandler(els.moveModalSuggestions, "click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".move-modal-suggestion");
    if (!(button instanceof HTMLButtonElement)) return;
    const value = String(button.dataset.value || "").trim();
    if (!value) return;
    if (els.moveModalInput) {
      els.moveModalInput.value = value;
      els.moveModalInput.focus();
    }
    onSuggestionPick?.(value);
  });

  return () => handlers.forEach((dispose) => dispose());
}
