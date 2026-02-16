import { conciseTechnicalError } from "./mappers.js";

/**
 * Batch select mode controller shared by home-page and folder-page.
 *
 * @param {object} opts
 * @param {object} opts.els                  – must include batchActionBar, batchActionCount, toolbarSelectBtn
 * @param {HTMLElement} opts.mountNode
 * @param {string} opts.pageClass            – CSS class of the page root (e.g. "page-home")
 * @param {object} opts.apiClient
 * @param {(msg: string, tone?: string) => void} opts.toast
 * @param {(opts: object) => Promise<string|null>} opts.openMoveDialog
 * @param {() => Promise<void>} opts.refreshNotes
 * @param {() => boolean} opts.isMounted
 * @returns {{ toggleSelectMode(active?: boolean): void, toggleNoteSelection(id: string): void, isSelectMode(): boolean, getSelectedIds(): Set<string>, cleanup(): void }}
 */
export function createBatchSelectController({
  els,
  mountNode,
  pageClass,
  apiClient,
  toast,
  openMoveDialog,
  refreshNotes,
  isMounted,
  renderView,
}) {
  let selectMode = false;
  const selectedIds = new Set();

  function updateBatchBar() {
    if (!els.batchActionBar) return;
    const shouldShowBar = selectMode && selectedIds.size > 0;
    els.batchActionBar.classList.toggle("hidden", !shouldShowBar);
    document.body.classList.toggle("batch-mode-active", shouldShowBar);
    if (!shouldShowBar) return;
    if (els.batchActionCount) {
      els.batchActionCount.textContent = `${selectedIds.size} selected`;
    }
  }

  function toggleSelectMode(active) {
    selectMode = typeof active === "boolean" ? active : !selectMode;
    selectedIds.clear();
    const page = mountNode.querySelector(`.${pageClass}`);
    if (page) page.classList.toggle("select-mode", selectMode);
    if (els.toolbarSelectBtn) els.toolbarSelectBtn.classList.toggle("is-active", selectMode);
    if (els.toolbarSelectBtn) els.toolbarSelectBtn.textContent = selectMode ? "Done" : "Select";
    updateBatchBar();
    renderView();
  }

  function toggleNoteSelection(noteId) {
    const id = String(noteId || "").trim();
    if (!id) return;
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    updateBatchBar();
  }

  // Event listeners
  const handlers = [];
  function on(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  on(els.toolbarSelectBtn, "click", () => toggleSelectMode());
  on(els.batchCancelBtn, "click", () => toggleSelectMode(false));

  on(els.batchDeleteBtn, "click", async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`Delete ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}?`);
    if (!confirmed) return;
    try {
      await apiClient.batchDeleteNotes([...selectedIds]);
      if (!isMounted()) return;
      toast(`Deleted ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`);
      toggleSelectMode(false);
      await refreshNotes();
    } catch (error) {
      if (!isMounted()) return;
      toast(conciseTechnicalError(error, "Batch delete failed"), "error");
    }
  });

  on(els.batchMoveBtn, "click", async () => {
    if (selectedIds.size === 0) return;
    const target = await openMoveDialog({
      title: `Move ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`,
      confirmLabel: "Move",
    });
    if (!target) return;
    try {
      await apiClient.batchMoveNotes([...selectedIds], target);
      if (!isMounted()) return;
      toast(`Moved ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}`);
      toggleSelectMode(false);
      await refreshNotes();
    } catch (error) {
      if (!isMounted()) return;
      toast(conciseTechnicalError(error, "Batch move failed"), "error");
    }
  });

  function cleanup() {
    document.body.classList.remove("batch-mode-active");
    handlers.forEach((fn) => fn());
  }

  return {
    toggleSelectMode,
    toggleNoteSelection,
    isSelectMode: () => selectMode,
    getSelectedIds: () => selectedIds,
    cleanup,
  };
}
