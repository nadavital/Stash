/**
 * SSE enrichment handler shared by home-page, folder-page, and item-page.
 *
 * @param {object} opts
 * @param {object} opts.apiClient       – client with subscribeToEvents
 * @param {() => Array} opts.getNotes   – returns current notes array
 * @param {(next: Array) => void} opts.setNotes – replaces notes + triggers render
 * @param {() => boolean} opts.isMounted
 * @param {(note: object) => boolean} [opts.shouldAccept] – optional filter for job:complete
 * @param {(event: object) => void} [opts.onEvent] – optional passthrough for non-enrichment events
 * @returns {() => void} unsubscribe function
 */
export function subscribeNoteEnrichment({ apiClient, getNotes, setNotes, isMounted, shouldAccept, onEvent }) {
  function updateNoteById(noteId, patchFn) {
    const normalizedId = String(noteId || "").trim();
    if (!normalizedId) return false;
    const notes = getNotes();
    let changed = false;

    for (let i = 0; i < notes.length; i++) {
      const entry = notes[i];
      const noteObj = entry?.note || entry;
      if (String(noteObj?.id || "") !== normalizedId) continue;
      const nextNote = patchFn(noteObj);
      if (entry?.note) {
        notes[i] = { ...entry, note: nextNote };
      } else {
        notes[i] = nextNote;
      }
      changed = true;
      break;
    }

    return changed;
  }

  const unsubscribe = apiClient.subscribeToEvents?.((event) => {
    if (!isMounted()) return;
    if (typeof onEvent === "function") onEvent(event);

    if (event.type === "job:start" && event.id) {
      const changed = updateNoteById(event.id, (noteObj) => ({ ...noteObj, status: "enriching" }));
      if (changed) setNotes(getNotes());
      return;
    }

    if (event.type === "job:error" && event.id) {
      const changed = updateNoteById(event.id, (noteObj) => ({
        ...noteObj,
        status: "failed",
        metadata: {
          ...(noteObj.metadata || {}),
          enrichmentError: String(event.error || ""),
        },
      }));
      if (changed) setNotes(getNotes());
      return;
    }

    if (event.type === "job:complete" && event.result) {
      const enrichedNote = event.result;
      if (shouldAccept && !shouldAccept(enrichedNote)) return;
      const changed = updateNoteById(enrichedNote.id, (noteObj) => ({
        ...noteObj,
        ...enrichedNote,
        status: "ready",
      }));
      if (changed) setNotes(getNotes());
    }
  });

  return () => { if (unsubscribe) unsubscribe(); };
}
