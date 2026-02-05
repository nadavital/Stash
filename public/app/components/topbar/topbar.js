export function renderTopbar({ query = "", showNewFolder = false } = {}) {
  const value = String(query || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  return `
    <header class="topbar-shell" data-component="topbar">
      <div class="topbar-actions">
        ${
          showNewFolder
            ? `
          <button class="topbar-folder-btn" id="topbar-new-folder-btn" type="button" aria-label="Create folder or task">
            <svg class="topbar-folder-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M9 3h2v6h6v2h-6v6H9v-6H3V9h6z" />
            </svg>
          </button>
        `
            : ""
        }
        <div class="topbar-search-wrap" id="topbar-search-wrap" data-expanded="false">
        <button class="topbar-search-toggle" id="topbar-search-toggle" type="button" aria-label="Search memories" aria-expanded="false">
          <svg class="topbar-search-icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8.4 2.4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 1.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Zm5.1 9.2 3.3 3.3a.8.8 0 0 1-1.1 1.1l-3.3-3.3a.8.8 0 0 1 1.1-1.1Z" />
          </svg>
        </button>
        <label class="topbar-search-field" for="topbar-search-input">
          <span class="topbar-visually-hidden">Search memory</span>
          <input id="topbar-search-input" class="topbar-search-input" type="search" placeholder="Search" value="${value}" />
        </label>
      </div>
      </div>
    </header>
  `;
}
