import { renderIcon } from "../../services/icons.js";

export function renderHomeFolderGrid() {
  const loadingCards = Array.from({ length: 6 }, (_, index) => {
    return `<span class="folder-tile folder-tile-skeleton" aria-hidden="true" data-skeleton-index="${index + 1}"></span>`;
  }).join("");

  const emptyFolderIcon = renderIcon("folder", { size: 48, className: "home-folders-empty-icon" });
  return `
    <section class="home-folder-grid" data-component="home-folder-grid" aria-label="Folders">
      <div id="home-folders-list" class="home-folders-list">${loadingCards}</div>
      <div id="home-folders-empty" class="hidden">
        <div class="home-folders-empty-state">
          ${emptyFolderIcon}
          <p class="home-folders-empty-heading">No folders yet</p>
          <p class="home-folders-empty-sub">Create your first folder to organize your files</p>
        </div>
      </div>
      <p id="home-folders-error" class="ui-empty hidden">Fallback mode</p>
    </section>
  `;
}
