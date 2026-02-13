export function renderComposer({ mode = "home" } = {}) {
  const placeholder = mode === "folder" ? "Add item to this folder" : "Add a note, link, or drop a file...";

  return `
    <section class="composer-shell" data-component="composer">
      <form id="capture-form" class="composer-form">
        <input id="project-input" name="project" type="hidden" value="" />

        <div class="composer-input-shell">
          <button id="attachment-toggle" class="composer-plus" type="button" aria-label="Choose file">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <select id="project-select" class="composer-project-select" aria-label="Choose folder">
            <option value="">Folder</option>
          </select>
          <textarea id="content-input" name="content" rows="1" placeholder="${placeholder}"></textarea>

          <span id="selected-file-pill" class="composer-file-pill hidden">
            <span id="selected-file-name" class="composer-file-name"></span>
            <button id="clear-file-btn" class="composer-file-clear" type="button" aria-label="Remove selected file">&times;</button>
          </span>

          <button class="composer-send" id="save-btn" type="submit" aria-label="Save item">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>

        <input id="file-input" type="file" class="visually-hidden" />
        <p id="capture-hint" class="capture-hint" aria-live="polite"></p>
      </form>
    </section>
  `;
}

export function initComposerAutoResize(mountNode) {
  const textarea = mountNode.querySelector('#content-input');
  if (!textarea) return () => {};

  function resize() {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  }

  textarea.addEventListener('input', resize);
  return () => textarea.removeEventListener('input', resize);
}
