import { renderMarkdown } from "../../services/markdown.js";

const TOOLBAR_BUTTONS = [
  { key: "bold", label: "B", title: "Bold", style: "font-weight:700", wrap: ["**", "**"], placeholder: "bold text" },
  { key: "italic", label: "I", title: "Italic", style: "font-style:italic", wrap: ["_", "_"], placeholder: "italic text" },
  { key: "sep1", sep: true },
  { key: "heading", label: "H", title: "Heading", style: "font-weight:700", prefix: "## ", placeholder: "Heading" },
  { key: "list", label: "\u2022", title: "Bullet list", prefix: "- ", placeholder: "List item" },
  { key: "code", label: "<>", title: "Inline code", style: "font-family:var(--font-mono);font-size:12px", wrap: ["`", "`"], placeholder: "code" },
  { key: "quote", label: "\u201C", title: "Quote", prefix: "> ", placeholder: "Quote" },
  { key: "link", label: "\uD83D\uDD17", title: "Link", custom: "link" },
];

/**
 * Creates a markdown editor with toolbar, textarea, and live preview.
 *
 * @param {string} initialValue
 * @returns {{ element: HTMLElement, textarea: HTMLTextAreaElement, getValue: () => string, setValue: (v: string) => void, destroy: () => void }}
 */
export function createMarkdownEditor(initialValue = "") {
  const root = document.createElement("div");
  root.className = "md-editor";

  // ── Toolbar ──
  const toolbar = document.createElement("div");
  toolbar.className = "md-editor-toolbar";

  TOOLBAR_BUTTONS.forEach((btn) => {
    if (btn.sep) {
      const sep = document.createElement("span");
      sep.className = "md-editor-toolbar-sep";
      toolbar.appendChild(sep);
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "md-editor-toolbar-btn";
    button.title = btn.title;
    button.textContent = btn.label;
    if (btn.style) button.setAttribute("style", btn.style);
    button.addEventListener("click", () => handleToolbarAction(btn));
    toolbar.appendChild(button);
  });

  // ── Textarea ──
  const textarea = document.createElement("textarea");
  textarea.className = "md-editor-textarea";
  textarea.value = initialValue;
  textarea.rows = 8;
  textarea.placeholder = "Write your content here\u2026 Markdown supported.";

  // Auto-grow
  function autoGrow() {
    textarea.style.height = "auto";
    textarea.style.height = Math.max(160, textarea.scrollHeight) + "px";
  }

  // Tab inserts 2 spaces
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + "  " + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      schedulePreview();
    }
  });

  textarea.addEventListener("input", () => {
    autoGrow();
    schedulePreview();
  });

  // ── Preview ──
  const previewLabel = document.createElement("div");
  previewLabel.className = "md-editor-preview-label";
  previewLabel.textContent = "Preview";

  const preview = document.createElement("div");
  preview.className = "md-editor-preview markdown-body";

  // ── Debounced preview update ──
  let previewTimer = null;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 150);
  }

  function updatePreview() {
    const val = textarea.value.trim();
    if (!val) {
      preview.innerHTML = '<span class="md-editor-preview-empty">Nothing to preview</span>';
    } else {
      preview.innerHTML = renderMarkdown(val);
    }
  }

  // ── Toolbar actions ──
  function handleToolbarAction(btn) {
    if (btn.custom === "link") {
      insertLink();
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);

    if (btn.wrap) {
      const text = selected || btn.placeholder;
      const before = textarea.value.substring(0, start);
      const after = textarea.value.substring(end);
      textarea.value = before + btn.wrap[0] + text + btn.wrap[1] + after;
      if (selected) {
        textarea.selectionStart = start + btn.wrap[0].length;
        textarea.selectionEnd = start + btn.wrap[0].length + text.length;
      } else {
        textarea.selectionStart = start + btn.wrap[0].length;
        textarea.selectionEnd = start + btn.wrap[0].length + text.length;
      }
    } else if (btn.prefix) {
      // Block-level: insert at beginning of current line
      const before = textarea.value.substring(0, start);
      const lineStart = before.lastIndexOf("\n") + 1;
      const text = selected || btn.placeholder;
      textarea.value =
        textarea.value.substring(0, lineStart) +
        btn.prefix +
        textarea.value.substring(lineStart, start) +
        text +
        textarea.value.substring(end);
      textarea.selectionStart = lineStart + btn.prefix.length + (start - lineStart);
      textarea.selectionEnd = textarea.selectionStart + text.length;
    }

    textarea.focus();
    autoGrow();
    schedulePreview();
  }

  function insertLink() {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const text = selected || "link text";
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + "[" + text + "](url)" + after;
    // Select "url" for easy replacement
    const urlStart = start + text.length + 3;
    textarea.selectionStart = urlStart;
    textarea.selectionEnd = urlStart + 3;
    textarea.focus();
    autoGrow();
    schedulePreview();
  }

  // ── Assemble ──
  root.append(toolbar, textarea, previewLabel, preview);

  // Initial render
  requestAnimationFrame(() => {
    autoGrow();
    updatePreview();
  });

  return {
    element: root,
    textarea,
    getValue() {
      return textarea.value;
    },
    setValue(v) {
      textarea.value = v;
      autoGrow();
      updatePreview();
    },
    destroy() {
      clearTimeout(previewTimer);
    },
  };
}
