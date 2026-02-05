export function renderHomeFolderGrid() {
  const loadingCards = Array.from({ length: 8 }, (_, index) => {
    return `<span class="folder-pill folder-pill-skeleton" aria-hidden="true" data-skeleton-index="${index + 1}"></span>`;
  }).join("");

  return `
    <article class="card home-folder-grid-card" data-component="home-folder-grid">
      <div class="card-header">
        <div>
          <h2>Welcome back!</h2>
          <p class="stream-subtitle">Open a project folder to jump straight into its memory view.</p>
        </div>
      </div>
      <div id="home-folders-list" class="home-folders-list">${loadingCards}</div>
      <p id="home-folders-empty" class="note-content hidden">No folders yet. Save a memory to create the first one.</p>
      <p id="home-folders-error" class="note-content hidden">Fallback mode is active. Folder cards may use local demo data.</p>
    </article>
  `;
}
