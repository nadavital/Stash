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
          <button class="topbar-folder-btn" id="topbar-new-folder-btn" type="button" aria-label="Create folder">
            <svg class="topbar-folder-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2.8 5.2A2.2 2.2 0 0 1 5 3h2.4c.6 0 1.1.2 1.5.6l.9 1h5.2a2.2 2.2 0 0 1 2.2 2.2v6A2.2 2.2 0 0 1 15 15H5a2.2 2.2 0 0 1-2.2-2.2v-7.6Zm1.6 0v7.6c0 .3.3.6.6.6h10c.3 0 .6-.3.6-.6v-6a.6.6 0 0 0-.6-.6H9.5L8 4.9a.6.6 0 0 0-.5-.3H5a.6.6 0 0 0-.6.6Zm5 5a.8.8 0 0 1 .8-.8h1v-1a.8.8 0 1 1 1.6 0v1h1a.8.8 0 1 1 0 1.6h-1v1a.8.8 0 0 1-1.6 0v-1h-1a.8.8 0 0 1-.8-.8Z" />
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
