import {
  normalizeFolderColor,
  fallbackColorForFolder,
  normalizeFolderDrafts,
  normalizeFolderSymbol,
} from "./folder-utils.js";
import { normalizeCitation, conciseTechnicalError } from "./mappers.js";

/**
 * Folder CRUD controller shared by home-page and folder-page.
 *
 * @param {object} opts
 * @param {object} opts.apiClient
 * @param {object} opts.store
 * @param {(msg: string, tone?: string) => void} opts.toast
 * @param {() => Promise<void>} opts.refreshNotes
 * @param {() => boolean} opts.isMounted
 * @param {(opts: object) => Promise<string|null>} opts.openMoveDialog
 * @param {() => void} [opts.clearInlineSearch]
 * @param {(oldName: string, nextName: string) => void} [opts.onRenameFallback] – called when rename API fails
 * @param {(folderName: string) => void} [opts.onDeleteFallback] – called when delete API fails
 * @returns {object}
 */
export function createFolderCrudController({
  apiClient,
  store,
  toast,
  refreshNotes,
  isMounted,
  openMoveDialog,
  clearInlineSearch,
  onRenameFallback,
  onDeleteFallback,
}) {
  function getState() { return store.getState(); }
  function setState(patch) { return store.setState(patch); }

  // ── Draft folder helpers ──────────────────────────────

  function upsertDraftFolder({ name, description = "", color = "green", symbol = "" }) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return;

    const normalizedDescription = String(description || "").trim();
    const normalizedColor = normalizeFolderColor(color, fallbackColorForFolder(normalizedName));
    const drafts = normalizeFolderDrafts(getState().draftFolders);
    const key = normalizedName.toLowerCase();
    const index = drafts.findIndex((entry) => entry.name.toLowerCase() === key);

    if (index >= 0) {
      drafts[index] = {
        ...drafts[index],
        name: normalizedName,
        description: normalizedDescription || drafts[index].description || "",
        color: normalizedColor,
      };
    } else {
      const entry = { name: normalizedName, description: normalizedDescription, color: normalizedColor };
      if (symbol) entry.symbol = normalizeFolderSymbol(symbol, "DOC");
      drafts.push(entry);
    }

    setState({ draftFolders: drafts });
  }

  function removeDraftFolder(name) {
    const normalizedName = String(name || "").trim().toLowerCase();
    if (!normalizedName) return;
    const nextDrafts = normalizeFolderDrafts(getState().draftFolders).filter(
      (entry) => entry.name.toLowerCase() !== normalizedName
    );
    setState({ draftFolders: nextDrafts });
  }

  function ensureDraftFolder(name, meta = {}) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return;
    const drafts = normalizeFolderDrafts(getState().draftFolders);
    if (drafts.some((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase())) return;
    drafts.push({
      name: normalizedName,
      description: meta.description || "",
      color: normalizeFolderColor(meta.color, fallbackColorForFolder(normalizedName)),
      symbol: meta.symbol || "DOC",
    });
    setState({ draftFolders: drafts });
  }

  function renameDraftFolderName(oldName, nextName, extra = {}) {
    const normalizedOld = String(oldName || "").trim().toLowerCase();
    const normalizedNext = String(nextName || "").trim();
    if (!normalizedOld || !normalizedNext) return;

    const drafts = normalizeFolderDrafts(getState().draftFolders);
    const oldDraft = drafts.find((entry) => entry.name.toLowerCase() === normalizedOld);
    const baseColor = normalizeFolderColor(extra.color || oldDraft?.color, fallbackColorForFolder(normalizedNext));
    const baseDescription = String(extra.description || oldDraft?.description || "").trim();
    const baseSymbol = normalizeFolderSymbol(extra.symbol || oldDraft?.symbol, "DOC");
    const withoutOld = drafts.filter((entry) => entry.name.toLowerCase() !== normalizedOld);
    const existingIndex = withoutOld.findIndex((entry) => entry.name.toLowerCase() === normalizedNext.toLowerCase());

    if (existingIndex >= 0) {
      withoutOld[existingIndex] = {
        ...withoutOld[existingIndex],
        color: withoutOld[existingIndex].color || baseColor,
        description: withoutOld[existingIndex].description || baseDescription,
        symbol: withoutOld[existingIndex].symbol || baseSymbol,
      };
    } else {
      withoutOld.push({ name: normalizedNext, color: baseColor, description: baseDescription, symbol: baseSymbol });
    }

    setState({ draftFolders: withoutOld });
  }

  // ── Batch move ────────────────────────────────────────

  async function moveAllProjectNotes(oldProject, nextProject) {
    const normalizedOld = String(oldProject || "").trim();
    const normalizedNext = String(nextProject || "").trim();
    if (!normalizedOld || !normalizedNext || normalizedOld.toLowerCase() === normalizedNext.toLowerCase()) {
      return 0;
    }

    const PAGE_LIMIT = 120;
    let movedCount = 0;

    for (let attempt = 0; attempt < 80; attempt++) {
      const result = await apiClient.fetchNotes({ project: normalizedOld, limit: PAGE_LIMIT });
      const items = Array.isArray(result?.items) ? result.items : [];
      const ids = [...new Set(items
        .map((entry, index) => String(normalizeCitation(entry, index).note.id || "").trim())
        .filter(Boolean))];

      if (!ids.length) break;
      await apiClient.batchMoveNotes(ids, normalizedNext);
      movedCount += ids.length;
    }

    return movedCount;
  }

  // ── Rename folder ─────────────────────────────────────

  async function renameFolder(folderEntry, { navigateAfterRename = false, navigate } = {}) {
    const folder = folderEntry || {};
    const oldName = String(folder.name || "").trim();
    if (!oldName) return;

    const nextName = String(
      (await openMoveDialog({
        title: `Rename "${oldName}"`,
        confirmLabel: "Rename",
        initialValue: oldName,
      })) || ""
    ).trim();

    if (!nextName || nextName.toLowerCase() === oldName.toLowerCase()) return;

    try {
      const folderId = String(folder.id || "").trim();
      if (folderId) {
        await apiClient.updateFolder(folderId, { name: nextName });
      } else {
        const lookup = await apiClient.getFolder(oldName).catch(() => null);
        const lookupId = String(lookup?.folder?.id || "").trim();
        if (lookupId) {
          await apiClient.updateFolder(lookupId, { name: nextName });
        }
      }
    } catch (error) {
      apiClient.adapterLog("rename_folder_metadata_failed", conciseTechnicalError(error, "Folder metadata rename failed"));
    }

    try {
      const movedCount = await moveAllProjectNotes(oldName, nextName);
      renameDraftFolderName(oldName, nextName, folder);
      if (clearInlineSearch) clearInlineSearch();
      toast(
        movedCount > 0
          ? `Renamed folder and moved ${movedCount} item${movedCount === 1 ? "" : "s"}`
          : "Folder renamed"
      );
      if (navigateAfterRename && navigate) {
        navigate(`#/folder/${encodeURIComponent(nextName)}`);
        return;
      }
      await refreshNotes();
    } catch (error) {
      if (!isMounted()) return;
      const message = conciseTechnicalError(error, "Folder rename endpoint unavailable");
      renameDraftFolderName(oldName, nextName, folder);
      if (onRenameFallback) onRenameFallback(oldName, nextName);
      toast("Folder renamed locally");
      apiClient.adapterLog("rename_folder_fallback", message);
      if (navigateAfterRename && navigate) {
        navigate(`#/folder/${encodeURIComponent(nextName)}`);
      }
    }
  }

  // ── Delete folder ─────────────────────────────────────

  async function deleteFolder(folderEntry, { navigate, isCurrentFolder = false } = {}) {
    const folder = folderEntry || {};
    const folderName = String(folder.name || "").trim();
    if (!folderName) return;

    const confirmed = window.confirm(`Delete folder "${folderName}" and all its items?`);
    if (!confirmed) return;

    try {
      const folderId = String(folder.id || "").trim();
      if (folderId) {
        await apiClient.deleteFolder(folderId).catch(() => null);
      }
      const result = await apiClient.deleteProject(folderName);
      if (!isMounted()) return;
      removeDraftFolder(folderName);
      if (clearInlineSearch) clearInlineSearch();
      const deletedCount = Number(result?.deletedCount || 0);
      toast(deletedCount > 0 ? `Deleted ${deletedCount} item${deletedCount === 1 ? "" : "s"}` : "Folder deleted");
      if (isCurrentFolder && navigate) { navigate("#/"); return; }
      await refreshNotes();
    } catch (error) {
      if (!isMounted()) return;
      const message = conciseTechnicalError(error, "Folder delete endpoint unavailable");
      removeDraftFolder(folderName);
      if (isCurrentFolder && navigate) {
        if (onDeleteFallback) onDeleteFallback(folderName);
        navigate("#/");
      } else {
        if (onDeleteFallback) onDeleteFallback(folderName);
        toast("Folder removed locally");
        await refreshNotes();
      }
      apiClient.adapterLog("folder_delete_fallback", message);
    }
  }

  return {
    upsertDraftFolder,
    removeDraftFolder,
    ensureDraftFolder,
    renameDraftFolderName,
    moveAllProjectNotes,
    renameFolder,
    deleteFolder,
  };
}
