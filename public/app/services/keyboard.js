/**
 * Global keyboard shortcuts.
 * Returns a cleanup function to remove the listener.
 */
export function initKeyboardShortcuts({ onSearch, onComposer, onEscape } = {}) {
  function handler(event) {
    const isMod = event.metaKey || event.ctrlKey;

    // Cmd/Ctrl+K — focus search
    if (isMod && event.key === "k") {
      event.preventDefault();
      if (typeof onSearch === "function") onSearch();
      return;
    }

    // Cmd/Ctrl+N — focus composer
    if (isMod && event.key === "n") {
      event.preventDefault();
      if (typeof onComposer === "function") onComposer();
      return;
    }

    // Escape — close modals
    if (event.key === "Escape") {
      if (typeof onEscape === "function") onEscape();
    }
  }

  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}
