import { renderChatPanelHTML } from "../chat-panel/chat-panel.js";
import { renderIcon } from "../../services/icons.js";

export function renderRecentInlineStripHTML({ title = "Recent" } = {}) {
  const safeTitle = String(title || "Recent")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  const refreshIcon = renderIcon("refresh", { size: 20 });
  return `
    <section class="recent-inline-strip" aria-label="${safeTitle}">
      <div class="recent-inline-head">
        <p class="recent-inline-title">${safeTitle}</p>
        <button id="refresh-btn" class="recent-refresh-btn" type="button" aria-label="Refresh recent items">
          ${refreshIcon}
        </button>
      </div>
      <div id="recent-notes-list" class="recent-inline-list"></div>
    </section>
  `;
}

export function renderHomeRecentList() {
  return `
    <aside class="recent-sidebar" data-component="home-recent-list" aria-label="Assistant chat">
      <div class="recent-sidebar-head">
        <p class="recent-sidebar-title">Chat</p>
      </div>
      <div id="recent-chat-panel" class="recent-sidebar-chat">
        ${renderChatPanelHTML()}
      </div>
    </aside>
  `;
}
