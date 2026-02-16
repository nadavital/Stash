import {
  openMoveModal,
  closeMoveModal,
  renderMoveModalSuggestions,
  initMoveModalHandlers,
} from "../components/move-modal/move-modal.js";

/**
 * Creates a reusable move-dialog controller wrapping the promise-based
 * moveModalResolver pattern used by home-page, folder-page, and item-page.
 *
 * @param {object} els                   – page element refs (must include move-modal els)
 * @param {object} opts
 * @param {() => string[]} opts.getSuggestions – returns folder name suggestions
 * @returns {{ open(opts): Promise<string|null>, resolve(value), cleanup(): void }}
 */
export function createMoveDialogController(els, { getSuggestions }) {
  let moveModalResolver = null;

  function resolve(value) {
    if (!moveModalResolver) return;
    const resolver = moveModalResolver;
    moveModalResolver = null;
    resolver(value);
  }

  function open({ title = "Move to folder", confirmLabel = "Move", initialValue = "" } = {}) {
    if (moveModalResolver) resolve(null);

    openMoveModal(els, {
      title,
      confirmLabel,
      value: initialValue,
      suggestions: getSuggestions(),
    });

    return new Promise((r) => { moveModalResolver = r; });
  }

  const cleanupHandlers = initMoveModalHandlers(els, {
    onClose() {
      closeMoveModal(els);
      resolve(null);
    },
    onSubmit(value) {
      const target = String(value || "").trim();
      if (!target) { els.moveModalInput?.focus(); return; }
      closeMoveModal(els);
      resolve(target);
    },
    onInput(value) {
      renderMoveModalSuggestions(els, getSuggestions(), value);
    },
    onSuggestionPick(value) {
      renderMoveModalSuggestions(els, getSuggestions(), value);
    },
  });

  function cleanup() {
    closeMoveModal(els);
    resolve(null);
    cleanupHandlers();
  }

  return { open, resolve, cleanup };
}
