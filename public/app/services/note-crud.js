import { conciseTechnicalError } from "./mappers.js";

/**
 * Note deletion controller shared by home-page and folder-page.
 *
 * @param {object} opts
 * @param {object} opts.apiClient
 * @param {(msg: string, tone?: string) => void} opts.toast
 * @param {() => Promise<void>} opts.refreshNotes
 * @param {() => boolean} opts.isMounted
 * @param {(noteId: string) => void} [opts.removeFromFallback] – fallback removal when API is unreachable
 * @param {() => void} [opts.beforeDelete]                     – called before API call (e.g. close modal)
 * @returns {{ deleteNote(noteId: string): Promise<void> }}
 */
export function createNoteCrudController({ apiClient, toast, refreshNotes, isMounted, removeFromFallback, beforeDelete }) {
  async function deleteNote(noteId) {
    const normalizedId = String(noteId || "").trim();
    if (!normalizedId) return;

    const confirmed = window.confirm("Delete this item? This action cannot be undone.");
    if (!confirmed) return;

    if (beforeDelete) beforeDelete();

    try {
      await apiClient.deleteNote(normalizedId);
      if (!isMounted()) return;
      toast("Item deleted");
      await refreshNotes();
    } catch (error) {
      if (!isMounted()) return;
      const message = conciseTechnicalError(error, "Delete endpoint unavailable");
      const alreadyDeleted = /not found|request failed \(404\)/i.test(message);
      if (alreadyDeleted) {
        toast("Item already deleted");
        await refreshNotes();
        return;
      }

      if (removeFromFallback) removeFromFallback(normalizedId);
      toast("Deleted locally");
      apiClient.adapterLog("delete_note_fallback", message);
    }
  }

  return { deleteNote };
}
