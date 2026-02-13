function formatAuthLabel(auth = null) {
  if (!auth) return "";
  const user = String(auth.userEmail || "").trim();
  return user;
}

function escapeHtmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderTopbar({
  showNewFolder = false,
  showSortFilter = false,
  showViewToggle = false,
  showSelectToggle = false,
  showChatToggle = false,
  auth = null,
  showSignOut = false,
} = {}) {
  const authLabel = formatAuthLabel(auth);
  const authLabelAttr = escapeHtmlAttr(authLabel);
  const authLabelText = escapeHtmlAttr(authLabel);

  return `
    <header class="topbar-shell" data-component="topbar">
      <a class="topbar-brand" href="#/" aria-label="Stash home">
        <svg class="topbar-brand-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93ZM17.9 17.39A1.98 1.98 0 0 0 16 16h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41A7.99 7.99 0 0 1 20 12c0 2.08-.8 3.97-2.1 5.39Z"/>
        </svg>
        <span class="topbar-brand-name">Stash</span>
      </a>
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
        ${
          showSelectToggle
            ? `<button class="topbar-select-btn" id="topbar-select-btn" type="button">Select</button>`
            : ""
        }
        ${
          showChatToggle
            ? `<button class="topbar-chat-btn" id="topbar-chat-btn" type="button" aria-label="Ask AI">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3v-3a2 2 0 0 1-1-1.7V4Z"/>
              </svg>
            </button>`
            : ""
        }
        ${
          showSortFilter
            ? `
          <button class="topbar-sort-btn" id="topbar-sort-btn" type="button" aria-label="Sort and filter">
            <svg class="topbar-sort-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 5h14M5 10h10M7 15h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        `
            : ""
        }
        ${
          showViewToggle
            ? `
          <div class="topbar-view-toggle">
            <button class="topbar-view-btn is-active" id="view-grid-btn" type="button" aria-label="Grid view" title="Grid view">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <rect x="1" y="1" width="6" height="6" rx="1.5"/>
                <rect x="9" y="1" width="6" height="6" rx="1.5"/>
                <rect x="1" y="9" width="6" height="6" rx="1.5"/>
                <rect x="9" y="9" width="6" height="6" rx="1.5"/>
              </svg>
            </button>
            <button class="topbar-view-btn" id="view-list-btn" type="button" aria-label="List view" title="List view">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
                <line x1="1" y1="4" x2="15" y2="4"/>
                <line x1="1" y1="8" x2="15" y2="8"/>
                <line x1="1" y1="12" x2="15" y2="12"/>
              </svg>
            </button>
          </div>
        `
            : ""
        }
        ${
          authLabel
            ? `
          <div class="topbar-auth" title="${authLabelAttr}">
            <span class="topbar-auth-label">${authLabelText}</span>
            ${
              showSignOut
                ? `<button class="topbar-signout-btn" id="topbar-signout-btn" type="button" aria-label="Sign out">Sign out</button>`
                : ""
            }
          </div>
        `
            : ""
        }
      </div>
    </header>
  `;
}
