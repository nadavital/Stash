/**
 * Unified content toolbar — Stash brand, + menu, Select, Search, Sort, View, Chat toggle, Sign-out.
 */
import { renderIcon } from "../../services/icons.js";

export function renderContentToolbarHTML() {
  const searchIcon = renderIcon("search", { size: 16 });
  const sortIcon = renderIcon("sort", { size: 20, className: "topbar-sort-icon" });
  const gridIcon = renderIcon("view-grid", { size: 16 });
  const listIcon = renderIcon("view-list", { size: 16 });
  const chatIcon = renderIcon("chat", { size: 18 });
  return `
    <div class="content-toolbar">
      <a class="toolbar-brand" href="#/">Stash</a>
      <span class="content-toolbar-spacer"></span>
      <button class="toolbar-icon-btn" id="toolbar-search-toggle" type="button" aria-label="Search">
        ${searchIcon}
      </button>
      <button class="topbar-sort-btn" id="toolbar-sort-btn" type="button" aria-label="Sort and filter">
        ${sortIcon}
      </button>
      <div class="topbar-view-toggle">
        <button class="topbar-view-btn is-active" id="toolbar-view-grid-btn" type="button" aria-label="Grid view" title="Grid view">
          ${gridIcon}
        </button>
        <button class="topbar-view-btn" id="toolbar-view-list-btn" type="button" aria-label="List view" title="List view">
          ${listIcon}
        </button>
      </div>
      <button class="toolbar-chat-toggle" id="toolbar-chat-toggle" type="button" aria-label="Toggle chat">
        ${chatIcon}
      </button>
      <button class="toolbar-signout" id="toolbar-signout-btn" type="button">Sign out</button>
    </div>
  `;
}

export function queryContentToolbarEls(root) {
  return {
    toolbarSearchToggle: root.querySelector("#toolbar-search-toggle"),
    toolbarSortBtn: root.querySelector("#toolbar-sort-btn"),
    toolbarViewGridBtn: root.querySelector("#toolbar-view-grid-btn"),
    toolbarViewListBtn: root.querySelector("#toolbar-view-list-btn"),
    toolbarChatToggle: root.querySelector("#toolbar-chat-toggle"),
    toolbarSignOutBtn: root.querySelector("#toolbar-signout-btn"),
  };
}
