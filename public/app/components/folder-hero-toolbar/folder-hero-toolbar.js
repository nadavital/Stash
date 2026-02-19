export function renderFolderHeroToolbar({
  folderName = "Folder",
  folderDescription = "",
  folderColor = "sky",
  folderSymbol = "DOC",
  showDeleteAction = true,
} = {}) {
  const safeFolderName = String(folderName)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const safeFolderDescription = String(folderDescription || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const safeFolderColor = String(folderColor || "sky")
    .toLowerCase()
    .trim();
  const safeFolderSymbol = String(folderSymbol || "DOC")
    .trim()
    .slice(0, 4)
    .toUpperCase();

  return `
    <section class="folder-hero-toolbar" data-component="folder-hero-toolbar" aria-label="Folder path">
      <div class="folder-hero-head">
        <nav class="folder-breadcrumb" aria-label="Breadcrumb">
          <a class="folder-back-link" href="#/">Stash</a>
          <svg class="folder-breadcrumb-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="6 4 10 8 6 12"/>
          </svg>
          <span class="folder-breadcrumb-current">
            <span class="folder-color-dot" data-color="${safeFolderColor}" aria-hidden="true"></span>
            <span class="folder-current-name">${safeFolderName}</span>
          </span>
        </nav>
        <div style="display:flex;gap:6px;align-items:center;">
          <button id="new-folder-btn" class="folder-subfolder-btn" type="button">+ Folder</button>
          <button id="share-folder-btn" class="folder-subfolder-btn" type="button">Share</button>
          <div class="folder-edit-wrap" style="position:relative;">
            <button id="edit-folder-btn" class="folder-subfolder-btn" type="button">Edit</button>
            <div id="edit-folder-menu" class="folder-edit-menu hidden">
              <button class="folder-edit-menu-item" id="edit-select-btn" type="button">Select items</button>
              <button class="folder-edit-menu-item" id="edit-rename-btn" type="button">Rename folder</button>
            </div>
          </div>
          ${
            showDeleteAction
              ? `<button id="delete-folder-btn" class="folder-delete-btn" type="button" aria-label="Delete folder ${safeFolderName}">Delete folder</button>`
              : ""
          }
        </div>
      </div>
      ${safeFolderDescription ? `<p class="folder-current-desc">${safeFolderDescription}</p>` : ""}
    </section>
  `;
}
