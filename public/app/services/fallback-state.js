import {
  filterAndRankMockNotes,
  normalizeCitation,
} from "./mappers.js";

/**
 * Creates fallback state helpers for offline/error mode.
 *
 * Manages mockNotes in store and recomputes derived lists
 * (recentNotes, searchResults) when fallback data changes.
 *
 * @param {object} opts
 * @param {object} opts.store
 * @param {() => string} opts.getActiveQuery
 * @param {(notes: Array) => void} opts.setRecentNotes
 * @param {(results: Array) => void} opts.setSearchResults
 * @param {() => void} opts.renderView
 * @param {string|null} [opts.filterProject]
 * @param {(active: boolean) => void} [opts.onFallbackHint]
 * @returns {{ removeNote, removeFolder, renameFolder, addNote, refresh }}
 */
export function createFallbackStateManager({
  store,
  getActiveQuery,
  setRecentNotes,
  setSearchResults,
  renderView,
  filterProject = null,
  onFallbackHint = null,
}) {
  function getMockNotes() {
    const s = store.getState();
    return Array.isArray(s.mockNotes) ? s.mockNotes : [];
  }

  function recompute(nextMock, { hint = false } = {}) {
    const opts = { limit: 120 };
    if (filterProject) opts.project = filterProject;

    const query = getActiveQuery();
    const notes = filterAndRankMockNotes(nextMock, opts);
    const results = query
      ? filterAndRankMockNotes(nextMock, { ...opts, query })
      : [];

    setRecentNotes(notes);
    setSearchResults(results);
    store.setState({ mockNotes: nextMock, notes });
    if (hint && onFallbackHint) onFallbackHint(true);
    renderView();
  }

  function removeNote(noteId) {
    const id = String(noteId || "").trim();
    if (!id) return;
    const nextMock = getMockNotes().filter(
      (entry, i) => normalizeCitation(entry, i).note.id !== id
    );
    recompute(nextMock, { hint: true });
  }

  function removeFolder(folderName) {
    const key = String(folderName || "").trim().toLowerCase();
    if (!key) return;
    const nextMock = getMockNotes().filter((entry, i) => {
      const note = normalizeCitation(entry, i).note;
      return String(note.project || "").trim().toLowerCase() !== key;
    });
    recompute(nextMock, { hint: true });
  }

  function renameFolder(oldName, newName) {
    const oldKey = String(oldName || "").trim().toLowerCase();
    const newKey = String(newName || "").trim();
    if (!oldKey || !newKey) return;

    const nextMock = getMockNotes().map((entry, i) => {
      const note = normalizeCitation(entry, i).note;
      if (String(note.project || "").trim().toLowerCase() !== oldKey) return entry;
      const updated = { ...note, project: newKey };
      return entry?.note ? { ...entry, note: updated } : updated;
    });
    recompute(nextMock);
  }

  /** Push a new fallback note and recompute. */
  function addNote(fallbackNote) {
    const nextMock = [fallbackNote, ...getMockNotes()];
    recompute(nextMock, { hint: true });
  }

  /** Recompute from current mockNotes without modifying them. */
  function refresh({ hint = false } = {}) {
    recompute(getMockNotes(), { hint });
  }

  return { removeNote, removeFolder, renameFolder, addNote, refresh };
}
