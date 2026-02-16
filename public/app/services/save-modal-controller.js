import {
  closeSaveModal,
  initSaveModalHandlers,
} from "../components/save-modal/save-modal.js";
import {
  buildLocalFallbackNote,
  conciseTechnicalError,
  inferCaptureType,
  normalizeCitation,
} from "./mappers.js";

/**
 * Creates a save modal controller shared by home-page and folder-page.
 *
 * @param {object} opts
 * @param {object} opts.els
 * @param {object} opts.apiClient
 * @param {object} opts.store
 * @param {(msg: string, tone?: string) => void} opts.toast
 * @param {() => boolean} opts.isMounted
 * @param {() => Array} opts.getNotes
 * @param {(notes: Array) => void} opts.setNotes
 * @param {() => void} opts.renderView
 * @param {() => Promise<void>} opts.refreshNotes
 * @param {string|null} [opts.defaultProject]       — folder pages set this
 * @param {(entry: object) => boolean} [opts.shouldInsert] — gates optimistic insert
 * @param {object|null} [opts.fallbackState]         — fallback state manager
 * @param {string} [opts.logLabel]
 * @returns {{ cleanup: () => void }}
 */
export function createSaveModalController({
  els,
  apiClient,
  store,
  toast,
  isMounted,
  getNotes,
  setNotes,
  renderView,
  refreshNotes,
  defaultProject = null,
  shouldInsert = () => true,
  fallbackState = null,
  logLabel = "save_fallback",
}) {
  const cleanup = initSaveModalHandlers(els, {
    onClose() {
      closeSaveModal(els);
    },

    async onSubmit({ content, project, attachment }) {
      if (store.getState().loading) return;

      const rawContent = String(content || "").trim();
      const att = attachment || {};

      // Folder pages require content or attachment
      if (defaultProject && !rawContent && !att.fileDataUrl) {
        toast("Add content first", "error");
        return;
      }

      const selectedProject = defaultProject
        ? String(project || defaultProject).trim() || defaultProject
        : project;

      const inferred = att.fileDataUrl
        ? { sourceType: att.isImage ? "image" : "file", sourceUrl: "" }
        : inferCaptureType(defaultProject ? rawContent : content, null);

      const payload = {
        sourceType: inferred.sourceType,
        content: defaultProject ? rawContent : content,
        sourceUrl: inferred.sourceUrl,
        project: selectedProject,
        imageDataUrl: att.isImage ? att.fileDataUrl : null,
        fileDataUrl: att.fileDataUrl || null,
        fileName: att.name || "",
        fileMimeType: att.fileMimeType || "",
      };

      store.setState({ loading: true });
      closeSaveModal(els);

      try {
        const saveResult = await apiClient.saveNote(payload);
        if (!isMounted()) return;

        if (saveResult?.note) {
          const savedEntry = normalizeCitation(saveResult.note, 0);
          const savedId = String(savedEntry?.note?.id || "");

          if (savedId && shouldInsert(savedEntry)) {
            const notes = getNotes();
            const deduped = notes.filter(
              (e) => String((e?.note || e)?.id || "") !== savedId
            );
            setNotes([savedEntry, ...deduped].slice(0, 120));
            renderView();
          }
        }

        toast("Item saved");
        refreshNotes().catch(() => {});
      } catch (error) {
        if (!isMounted()) return;

        const message = conciseTechnicalError(error, "Save endpoint unavailable");
        const isValidation =
          /missing content|invalid image|invalid file|invalid json|request failed \(4\d\d\)/i.test(
            message
          );

        if (isValidation) {
          toast("Save failed", "error");
        } else if (fallbackState) {
          fallbackState.addNote(buildLocalFallbackNote(payload));
          toast("Saved locally");
          apiClient.adapterLog(logLabel, message);
        } else {
          toast("Save failed", "error");
        }
      } finally {
        if (isMounted()) store.setState({ loading: false });
      }
    },
  });

  return { cleanup };
}
