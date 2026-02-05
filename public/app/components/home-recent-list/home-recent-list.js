export function renderHomeRecentList() {
  return `
    <aside class="recent-sidebar" data-component="home-recent-list" aria-label="Recent items">
      <div class="recent-sidebar-head">
        <p class="recent-sidebar-title">Recent</p>
        <button id="refresh-btn" class="recent-refresh-btn" type="button" aria-label="Refresh recent items">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M9.9 2.6a7.4 7.4 0 0 1 6.3 3.5V3.8a.8.8 0 1 1 1.6 0V8a.8.8 0 0 1-.8.8h-4.2a.8.8 0 1 1 0-1.6h2.3A5.8 5.8 0 1 0 15 13a.8.8 0 0 1 1.6.2 7.4 7.4 0 1 1-6.7-10.6Z" />
          </svg>
        </button>
      </div>
      <div id="notes-list" class="recent-list"></div>
    </aside>
  `;
}
