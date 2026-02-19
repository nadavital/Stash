import { renderIcon } from "../../services/icons.js";

export function renderComposer({ mode = "home" } = {}) {
  const placeholder = mode === "folder" ? "Add item to this folder" : "Add a note, link, or drop a file...";
  const attachIcon = renderIcon("attach", { size: 18 });
  const sendIcon = renderIcon("arrow-up", { size: 18 });

  return `
    <section class="composer-shell" data-component="composer">
      <form id="capture-form" class="composer-form">
        <input id="project-input" name="project" type="hidden" value="" />

        <div class="composer-input-shell">
          <button id="attachment-toggle" class="composer-plus" type="button" aria-label="Choose file">
            ${attachIcon}
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
            ${sendIcon}
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
