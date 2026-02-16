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
  auth = null,
  showSignOut = false,
} = {}) {
  const authLabel = formatAuthLabel(auth);
  const authLabelAttr = escapeHtmlAttr(authLabel);
  const authLabelText = escapeHtmlAttr(authLabel);

  const chatToggleHTML = `<button id="topbar-chat-toggle" class="topbar-chat-toggle" type="button" aria-label="Toggle chat">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 3h12v9H6l-3 3V3z"/>
      </svg>
    </button>`;

  return `
    <header class="topbar-shell" data-component="topbar">
      <a class="topbar-brand" href="#/" aria-label="Stash home">
        <span class="topbar-brand-name">Stash</span>
      </a>
      <div class="topbar-actions">
        ${chatToggleHTML}
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
