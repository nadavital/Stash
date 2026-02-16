import {
  closeItemModal,
  initItemModalHandlers,
} from "../components/item-modal/item-modal.js";
import {
  normalizeCitation,
  conciseTechnicalError,
} from "./mappers.js";

/**
 * Creates an item modal controller shared by home-page and folder-page.
 *
 * Handles onSave, onAddComment, onChatAbout with identical logic.
 *
 * @param {object} opts
 * @param {object} opts.els            – merged page elements
 * @param {object} opts.apiClient
 * @param {(msg: string, tone?: string) => void} opts.toast
 * @param {() => boolean} opts.isMounted
 * @param {() => Promise<void>} opts.refreshNotes
 * @param {() => Array} opts.getNotes  – get current notes list
 * @param {(notes: Array) => void} opts.setNotes – set notes list + state
 * @param {() => void} opts.renderView
 * @param {(note: object) => void} [opts.onChatAbout]
 * @returns {{ cleanup: () => void }}
 */
export function createItemModalController({
  els,
  apiClient,
  toast,
  isMounted,
  refreshNotes,
  getNotes,
  setNotes,
  renderView,
  onChatAbout,
}) {
  const cleanup = initItemModalHandlers(els, {
    onClose() {
      closeItemModal(els);
    },

    async onSave(noteId, payload) {
      try {
        await apiClient.updateNote(noteId, payload);
        if (!isMounted()) return;
        closeItemModal(els);
        toast("Note updated");
        await refreshNotes();
      } catch (error) {
        if (!isMounted()) return;
        toast(conciseTechnicalError(error, "Update failed"), "error");
      }
    },

    async onAddComment(noteId, text) {
      try {
        const result = await apiClient.addNoteComment(noteId, { text });
        if (!isMounted()) return null;
        const normalizedId = String(noteId || "");
        let updated = null;
        if (result?.note) {
          const notes = getNotes();
          const nextNotes = notes.map((entry, index) => {
            const normalized = normalizeCitation(entry, index).note;
            if (String(normalized.id || "") !== normalizedId) return entry;
            updated = normalizeCitation(result.note, 0).note;
            if (entry?.note) {
              return { ...entry, note: updated };
            }
            return updated;
          });
          if (updated) {
            setNotes(nextNotes);
            renderView();
          }
        }
        toast("Comment added");
        return updated;
      } catch (error) {
        if (!isMounted()) return null;
        toast(conciseTechnicalError(error, "Comment failed"), "error");
        throw error;
      }
    },

    onChatAbout(note) {
      closeItemModal(els);
      if (onChatAbout) onChatAbout(note);
    },
  });

  return { cleanup };
}
