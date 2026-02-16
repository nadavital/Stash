import {
  renderChatPanelHTML,
  queryChatPanelEls,
  initChatPanel,
} from "../chat-panel/chat-panel.js";

export function renderAppShellHTML({ auth }) {
  return `
    <div class="app-shell">
      <div class="app-shell-body">
        <div class="app-shell-workspace" id="page-content"></div>
        <div class="app-shell-chat-panel">
          ${renderChatPanelHTML()}
        </div>
      </div>
    </div>
  `;
}

export function queryAppShellEls(root) {
  const chatEls = queryChatPanelEls(root);

  return {
    ...chatEls,
    appShell: root.querySelector(".app-shell"),
    contentSlot: root.querySelector("#page-content"),
  };
}

export function initAppShell(els, { store, apiClient, auth }) {
  const disposers = [];

  // Delegate callbacks — pages set these
  let _toastFn = () => {};
  let _onOpenCitationFn = () => {};

  // Persistent: chat panel
  const chatPanel = initChatPanel(els, {
    apiClient,
    store,
    toast: (msg, tone) => _toastFn(msg, tone),
    onOpenCitation: (note) => _onOpenCitationFn(note),
  });
  disposers.push(chatPanel.dispose);

  // Set chat project scope based on route
  function updateContext(route) {
    const isHome = !route || route.name === "home";
    const chatProjectHint = isHome ? "" : (route.folderId || "");
    store.setState({ chatProjectHint });
  }

  return {
    els,
    chatPanel,
    updateContext,
    getContentSlot() {
      return els.contentSlot;
    },
    setToast(fn) {
      _toastFn = fn || (() => {});
    },
    setOnOpenCitation(fn) {
      _onOpenCitationFn = fn || (() => {});
    },
    toggleChat() {
      const chatPanelEl = els.appShell?.querySelector(".app-shell-chat-panel");
      if (chatPanelEl) chatPanelEl.classList.toggle("is-open");
    },
    dispose() {
      disposers.forEach((fn) => fn());
    },
  };
}
