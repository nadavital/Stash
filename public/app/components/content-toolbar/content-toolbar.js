/**
 * Unified content toolbar — Stash brand, + menu, Select, Search, Sort, View, Chat toggle, Sign-out.
 */

export function renderContentToolbarHTML() {
  return `
    <div class="content-toolbar">
      <a class="toolbar-brand" href="#/">Stash</a>
      <div class="toolbar-new-wrap">
        <button class="content-toolbar-new-btn" id="toolbar-new-btn" type="button">+</button>
        <div class="toolbar-new-menu hidden" id="toolbar-new-menu">
          <button class="toolbar-new-menu-item" id="toolbar-new-item-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8.67l-5.15 5.15a3.5 3.5 0 0 1-4.95-4.95L9.05 3.72a2.33 2.33 0 0 1 3.3 3.3L7.2 12.17a1.17 1.17 0 0 1-1.65-1.65L10.7 5.37"/></svg>
            Save item
          </button>
          <button class="toolbar-new-menu-item" id="toolbar-new-folder-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L6.5 3.5A1 1 0 005.8 3H3a1 1 0 00-1 1z"/></svg>
            New folder
          </button>
          <button class="toolbar-new-menu-item" id="toolbar-new-task-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5.5 8l2 2 3.5-4"/></svg>
            New task
          </button>
        </div>
      </div>
      <button class="topbar-select-btn" id="toolbar-select-btn" type="button">Select</button>
      <span class="content-toolbar-spacer"></span>
      <button class="toolbar-icon-btn" id="toolbar-search-toggle" type="button" aria-label="Search">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6.5" cy="6.5" r="4.5"/>
          <line x1="10" y1="10" x2="14.5" y2="14.5"/>
        </svg>
      </button>
      <button class="topbar-sort-btn" id="toolbar-sort-btn" type="button" aria-label="Sort and filter">
        <svg class="topbar-sort-icon" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 5h14M5 10h10M7 15h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
      <div class="topbar-view-toggle">
        <button class="topbar-view-btn is-active" id="toolbar-view-grid-btn" type="button" aria-label="Grid view" title="Grid view">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" rx="1.5"/>
            <rect x="9" y="1" width="6" height="6" rx="1.5"/>
            <rect x="1" y="9" width="6" height="6" rx="1.5"/>
            <rect x="9" y="9" width="6" height="6" rx="1.5"/>
          </svg>
        </button>
        <button class="topbar-view-btn" id="toolbar-view-list-btn" type="button" aria-label="List view" title="List view">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
            <line x1="1" y1="4" x2="15" y2="4"/>
            <line x1="1" y1="8" x2="15" y2="8"/>
            <line x1="1" y1="12" x2="15" y2="12"/>
          </svg>
        </button>
      </div>
      <button class="toolbar-chat-toggle" id="toolbar-chat-toggle" type="button" aria-label="Toggle chat">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 3h12v9H6l-3 3V3z"/>
        </svg>
      </button>
      <button class="toolbar-signout" id="toolbar-signout-btn" type="button">Sign out</button>
    </div>
  `;
}

export function queryContentToolbarEls(root) {
  return {
    toolbarNewBtn: root.querySelector("#toolbar-new-btn"),
    toolbarNewMenu: root.querySelector("#toolbar-new-menu"),
    toolbarNewItemBtn: root.querySelector("#toolbar-new-item-btn"),
    toolbarNewFolderBtn: root.querySelector("#toolbar-new-folder-btn"),
    toolbarNewTaskBtn: root.querySelector("#toolbar-new-task-btn"),
    toolbarSelectBtn: root.querySelector("#toolbar-select-btn"),
    toolbarSearchToggle: root.querySelector("#toolbar-search-toggle"),
    toolbarSortBtn: root.querySelector("#toolbar-sort-btn"),
    toolbarViewGridBtn: root.querySelector("#toolbar-view-grid-btn"),
    toolbarViewListBtn: root.querySelector("#toolbar-view-list-btn"),
    toolbarChatToggle: root.querySelector("#toolbar-chat-toggle"),
    toolbarSignOutBtn: root.querySelector("#toolbar-signout-btn"),
  };
}
