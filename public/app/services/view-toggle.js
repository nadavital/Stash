/**
 * View toggle controller (grid/list) shared by home-page and folder-page.
 *
 * @param {object} opts
 * @param {object} opts.els          – must include toolbarViewGridBtn, toolbarViewListBtn
 * @param {object} opts.store
 * @param {Array<HTMLElement>} opts.containers – elements to toggle "view-list" class on
 * @param {() => void} opts.renderView
 * @returns {{ cleanup: () => void }}
 */
export function createViewToggleController({
  els,
  store,
  containers,
  renderView,
}) {
  const handlers = [];
  function on(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  // Apply initial state
  const viewMode = store.getState().viewMode || "grid";
  if (viewMode === "list") {
    els.toolbarViewGridBtn?.classList.remove("is-active");
    els.toolbarViewListBtn?.classList.add("is-active");
    containers.forEach((el) => el?.classList.add("view-list"));
  }

  on(els.toolbarViewGridBtn, "click", () => {
    store.setState({ viewMode: "grid" });
    els.toolbarViewGridBtn?.classList.add("is-active");
    els.toolbarViewListBtn?.classList.remove("is-active");
    containers.forEach((el) => el?.classList.remove("view-list"));
    renderView();
  });

  on(els.toolbarViewListBtn, "click", () => {
    store.setState({ viewMode: "list" });
    els.toolbarViewListBtn?.classList.add("is-active");
    els.toolbarViewGridBtn?.classList.remove("is-active");
    containers.forEach((el) => el?.classList.add("view-list"));
    renderView();
  });

  return {
    cleanup() {
      handlers.forEach((fn) => fn());
    },
  };
}
