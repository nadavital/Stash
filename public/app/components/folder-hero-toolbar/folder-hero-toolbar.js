export function renderFolderHeroToolbar({
  folderName = "Folder",
  folderDescription = "",
  folderColor = "sky",
  folderSymbol = "DOC",
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
      <nav class="folder-breadcrumb" aria-label="Breadcrumb">
        <a class="folder-back-link" href="#/">Folders</a>
        <svg class="folder-breadcrumb-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="6 4 10 8 6 12"/>
        </svg>
        <span class="folder-breadcrumb-current">
          <span class="folder-color-dot" data-color="${safeFolderColor}" aria-hidden="true"></span>
          <span class="folder-current-name">${safeFolderName}</span>
        </span>
      </nav>
      ${safeFolderDescription ? `<p class="folder-current-desc">${safeFolderDescription}</p>` : ""}
    </section>
  `;
}
