import { renderChatPanelHTML } from "../chat-panel/chat-panel.js";

export function renderRecentInlineStripHTML({ title = "Recent" } = {}) {
  const safeTitle = String(title || "Recent")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  return `
    <section class="recent-inline-strip" aria-label="${safeTitle}">
      <div class="recent-inline-head">
        <p class="recent-inline-title">${safeTitle}</p>
        <button id="refresh-btn" class="recent-refresh-btn" type="button" aria-label="Refresh recent items">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M9.9 2.6a7.4 7.4 0 0 1 6.3 3.5V3.8a.8.8 0 1 1 1.6 0V8a.8.8 0 0 1-.8.8h-4.2a.8.8 0 1 1 0-1.6h2.3A5.8 5.8 0 1 0 15 13a.8.8 0 0 1 1.6.2 7.4 7.4 0 1 1-6.7-10.6Z" />
          </svg>
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
