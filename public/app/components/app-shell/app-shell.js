import {
  renderChatPanelHTML,
  queryChatPanelEls,
  initChatPanel,
} from "../chat-panel/chat-panel.js";
import {
  renderContentToolbarHTML,
  queryContentToolbarEls,
} from "../content-toolbar/content-toolbar.js";

export function renderAppShellHTML({ auth }) {
  return `
    <div class="app-shell">
      <div class="app-shell-body">
        <div class="app-shell-workspace">
          ${renderContentToolbarHTML()}
          <div id="page-content"></div>
        </div>
        <div class="app-shell-chat-panel">
          ${renderChatPanelHTML()}
        </div>
      </div>
    </div>
  `;
}

export function queryAppShellEls(root) {
  const chatEls = queryChatPanelEls(root);
  const toolbarEls = queryContentToolbarEls(root);

  return {
    ...chatEls,
    ...toolbarEls,
    appShell: root.querySelector(".app-shell"),
    contentSlot: root.querySelector("#page-content"),
  };
}

export function initAppShell(els, { store, apiClient, auth }) {
  const disposers = [];

  // Delegate callbacks — pages set these
  let _toastFn = () => {};
  let _onOpenCitationFn = () => {};
  let _onWorkspaceActionFn = () => {};

  // Persistent: chat panel
  const chatPanel = initChatPanel(els, {
    apiClient,
    store,
    toast: (msg, tone) => _toastFn(msg, tone),
    onOpenCitation: (note) => _onOpenCitationFn(note),
    onWorkspaceAction: (action) => _onWorkspaceActionFn(action),
    onAuthExpired: () => auth?.onSignOut?.(),
  });
  disposers.push(chatPanel.dispose);

  // Close toolbar dropdown on route change
  function closeToolbarMenus() {
    els.toolbarNewMenu?.classList.add("hidden");
  }

  // Set chat context based on route
  function updateContext(route) {
    closeToolbarMenus();
    if (!route || route.name === "home") {
      store.setState({ chatContext: { type: "home" } });
    } else if (route.name === "folder") {
      store.setState({ chatContext: { type: "folder", folderId: route.folderId || "" } });
    } else if (route.name === "item") {
      store.setState({ chatContext: { type: "item", itemId: route.itemId || "" } });
    } else {
      store.setState({ chatContext: { type: "home" } });
    }
  }

  function setItemContext(itemId, itemTitle, project) {
    store.setState({
      chatContext: { type: "item", itemId: itemId || "", itemTitle: itemTitle || "", project: project || "" },
    });
  }

  return {
    els,
    chatPanel,
    updateContext,
    setItemContext,
    getContentSlot() {
      return els.contentSlot;
    },
    setToast(fn) {
      _toastFn = fn || (() => {});
    },
    setOnOpenCitation(fn) {
      _onOpenCitationFn = fn || (() => {});
    },
    setOnWorkspaceAction(fn) {
      _onWorkspaceActionFn = fn || (() => {});
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
