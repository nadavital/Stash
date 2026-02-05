export function renderHomeFolderGrid() {
  const loadingCards = Array.from({ length: 9 }, (_, index) => {
    return `<span class="folder-tile folder-tile-skeleton" aria-hidden="true" data-skeleton-index="${index + 1}"></span>`;
  }).join("");

  return `
    <section class="home-folder-grid" data-component="home-folder-grid" aria-label="Folders">
      <div id="home-folders-list" class="home-folders-list">${loadingCards}</div>
      <p id="home-folders-empty" class="ui-empty hidden">No folders yet.</p>
      <p id="home-folders-error" class="ui-empty hidden">Fallback mode</p>
    </section>
  `;
}
