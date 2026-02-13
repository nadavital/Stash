export function renderHomeFolderGrid() {
  const loadingCards = Array.from({ length: 6 }, (_, index) => {
    return `<span class="folder-tile folder-tile-skeleton" aria-hidden="true" data-skeleton-index="${index + 1}"></span>`;
  }).join("");

  return `
    <section class="home-folder-grid" data-component="home-folder-grid" aria-label="Folders">
      <div id="home-folders-list" class="home-folders-list">${loadingCards}</div>
      <div id="home-folders-empty" class="hidden">
        <div class="home-folders-empty-state">
          <svg class="home-folders-empty-icon" viewBox="0 0 48 48" aria-hidden="true">
            <path d="M6 10a4 4 0 0 1 4-4h8.34a4 4 0 0 1 2.83 1.17l2.83 2.83H38a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V10Z"/>
          </svg>
          <p class="home-folders-empty-heading">No folders yet</p>
          <p class="home-folders-empty-sub">Create your first folder to organize your files</p>
        </div>
      </div>
      <p id="home-folders-error" class="ui-empty hidden">Fallback mode</p>
    </section>
  `;
}
