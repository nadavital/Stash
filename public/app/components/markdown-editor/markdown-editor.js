import { renderMarkdown } from "../../services/markdown.js";
import { renderIcon } from "../../services/icons.js";

const toolbarIcon = (name) => renderIcon(name, {
  size: 17,
  className: "md-editor-toolbar-icon",
  strokeWidth: 1.9,
});

const TOOLBAR_BUTTONS = [
  { key: "bold", icon: toolbarIcon("md-bold"), title: "Bold", command: "bold" },
  { key: "italic", icon: toolbarIcon("md-italic"), title: "Italic", command: "italic" },
  { key: "strike", icon: toolbarIcon("md-strike"), title: "Strikethrough", command: "strike" },
  { key: "code", icon: toolbarIcon("md-code"), title: "Inline code", command: "code" },
  { key: "sep1", sep: true },
  { key: "heading", icon: toolbarIcon("md-heading"), title: "Heading", command: "heading" },
  { key: "bullets", icon: toolbarIcon("md-bullets"), title: "Bullet list", command: "unorderedList" },
  { key: "numbers", icon: toolbarIcon("md-numbers"), title: "Numbered list", command: "orderedList" },
  { key: "checklist", icon: toolbarIcon("md-checklist"), title: "Checklist", command: "checklist" },
  { key: "indent", icon: toolbarIcon("md-indent"), title: "Indent list item", command: "indent" },
  { key: "outdent", icon: toolbarIcon("md-outdent"), title: "Outdent list item", command: "outdent" },
  { key: "sep2", sep: true },
  { key: "quote", icon: toolbarIcon("md-quote"), title: "Quote", command: "quote" },
  { key: "link", icon: toolbarIcon("md-link"), title: "Insert link", command: "link" },
  { key: "rule", icon: toolbarIcon("md-rule"), title: "Horizontal rule", command: "rule" },
];

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "HR"]);
const INLINE_TRANSFORM_PATTERN =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)]+\))/;
const INLINE_TRIGGER_KEYS = new Set([" ", "Enter", ")", "*", "_", "`"]);

function normalizeText(value) {
  return String(value || "").replace(/\u00a0/g, " ");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdownText(value) {
  return normalizeText(value)
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]()#+!])/g, "\\$1");
}

function isBlockElement(node) {
  return Boolean(node?.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName));
}

function getSelectionRangeWithin(root) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return range;
}

function setCaretToEnd(node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function sanitizeLinkUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return `https://${value}`;
  return "";
}

function findEditableBlock(startNode, root) {
  let node = startNode;
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName)) {
      return node;
    }
    node = node.parentNode;
  }
  return root.firstElementChild || root;
}

function findAncestorByTag(startNode, root, tagName) {
  let node = startNode;
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === tagName) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function ensureEditorStructure(surface) {
  const nodes = Array.from(surface.childNodes);
  if (!nodes.length) {
    surface.innerHTML = "<p><br></p>";
    return;
  }

  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = normalizeText(node.textContent || "").trim();
      if (!text) {
        node.remove();
        return;
      }
      const p = document.createElement("p");
      p.textContent = text;
      surface.replaceChild(p, node);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }

    if (!BLOCK_TAGS.has(node.tagName)) {
      const p = document.createElement("p");
      p.appendChild(node);
      surface.appendChild(p);
    }
  });

  Array.from(surface.childNodes).forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if ((tag === "P" || tag === "DIV" || tag === "BLOCKQUOTE") && !node.textContent?.trim() && !node.querySelector("img,br")) {
      node.innerHTML = "<br>";
    }
  });

  if (!surface.textContent?.trim() && !surface.querySelector("img")) {
    surface.innerHTML = "<p><br></p>";
  }
}

function markdownFromInline(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent || "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map(markdownFromInline).join("");

  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${children}**`;
  if (tag === "em" || tag === "i") return `*${children}*`;
  if (tag === "del" || tag === "s" || tag === "strike") return `~~${children}~~`;
  if (tag === "code") return `\`${normalizeText(node.textContent || "").replace(/`/g, "\\`")}\``;
  if (tag === "a") {
    const href = String(node.getAttribute("href") || "").trim();
    if (!href) return children;
    const label = children || href;
    return `[${label}](${href})`;
  }
  if (tag === "span") {
    const style = String(node.getAttribute("style") || "").toLowerCase();
    if (style.includes("font-weight") && !style.includes("font-weight:normal")) return `**${children}**`;
    if (style.includes("font-style:italic")) return `*${children}*`;
    return children;
  }
  return children;
}

function markdownFromListItem(node) {
  const inlineParts = [];
  const nestedBlocks = [];
  let taskPrefix = "";

  Array.from(node.childNodes).forEach((child) => {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      child.tagName === "INPUT" &&
      String(child.getAttribute("type") || "").toLowerCase() === "checkbox"
    ) {
      taskPrefix = child.checked ? "[x] " : "[ ] ";
      return;
    }
    if (child.nodeType === Node.ELEMENT_NODE && (child.tagName === "UL" || child.tagName === "OL")) {
      const nested = markdownFromBlock(child);
      if (nested) nestedBlocks.push(nested);
      return;
    }
    inlineParts.push(markdownFromInline(child));
  });

  const head = inlineParts.join("").trim() || "item";
  const lineHead = `${taskPrefix}${head}`.trimEnd();
  if (!nestedBlocks.length) return lineHead;
  const nested = nestedBlocks
    .join("\n")
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");
  return `${lineHead}\n${nested}`.trim();
}

function markdownFromBlock(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeMarkdownText(node.textContent || "").trim();
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.tagName.toLowerCase();
  const inline = Array.from(node.childNodes).map(markdownFromInline).join("").trim();

  if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "h5" || tag === "h6") {
    const level = Number(tag.slice(1)) || 2;
    return `${"#".repeat(level)} ${inline}`.trim();
  }
  if (tag === "ul") {
    return Array.from(node.children)
      .filter((child) => child.tagName === "LI")
      .map((li) => `- ${markdownFromListItem(li)}`)
      .join("\n")
      .trim();
  }
  if (tag === "ol") {
    return Array.from(node.children)
      .filter((child) => child.tagName === "LI")
      .map((li, index) => `${index + 1}. ${markdownFromListItem(li)}`)
      .join("\n")
      .trim();
  }
  if (tag === "blockquote") {
    const body = Array.from(node.childNodes).map(markdownFromBlock).join("\n").trim() || inline;
    return body
      .split("\n")
      .map((line) => (line.trim() ? `> ${line}` : ">"))
      .join("\n")
      .trim();
  }
  if (tag === "pre") {
    const codeText = normalizeText(node.textContent || "").replace(/\n$/, "");
    return `\`\`\`\n${codeText}\n\`\`\``;
  }
  if (tag === "hr") return "---";
  if (tag === "li") return markdownFromListItem(node);

  if (tag === "p" || tag === "div") {
    const nestedBlocks = Array.from(node.children).filter((child) => isBlockElement(child));
    if (nestedBlocks.length) {
      return nestedBlocks.map((child) => markdownFromBlock(child)).filter(Boolean).join("\n\n").trim();
    }
    return inline;
  }

  return inline;
}

function serializeEditorToMarkdown(surface) {
  const blocks = Array.from(surface.childNodes)
    .map((node) => (isBlockElement(node) ? markdownFromBlock(node) : markdownFromInline(node)))
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function markdownToEditorHtml(markdown) {
  const source = String(markdown || "").trim();
  if (!source) return "<p><br></p>";
  const html = renderMarkdown(source);
  return html && html.trim() ? html : "<p><br></p>";
}

/**
 * Creates a rich text editor that persists markdown under the hood.
 *
 * @param {string} initialValue
 * @param {{ placeholder?: string, showToolbar?: boolean }} [options]
 * @returns {{ element: HTMLElement, textarea: HTMLElement, getValue: () => string, setValue: (v: string) => void, destroy: () => void }}
 */
export function createMarkdownEditor(initialValue = "", options = {}) {
  const { placeholder = "Start typing...", showToolbar = true } = options;
  const root = document.createElement("div");
  root.className = "md-editor";

  const listeners = [];
  function addListener(el, type, handler, opts) {
    el.addEventListener(type, handler, opts);
    listeners.push(() => el.removeEventListener(type, handler, opts));
  }

  function addToolbarButton(toolbar, btn) {
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
    button.setAttribute("aria-label", btn.title);
    if (btn.icon) {
      button.innerHTML = btn.icon;
    } else if (btn.glyph) {
      const glyph = document.createElement("span");
      glyph.className = `md-editor-toolbar-glyph ${btn.glyphClass || ""}`.trim();
      glyph.textContent = btn.glyph;
      button.appendChild(glyph);
    }
    addListener(button, "click", () => handleToolbarAction(btn));
    toolbar.appendChild(button);
  }

  if (showToolbar) {
    const toolbar = document.createElement("div");
    toolbar.className = "md-editor-toolbar";
    TOOLBAR_BUTTONS.forEach((btn) => addToolbarButton(toolbar, btn));
    root.appendChild(toolbar);
  }

  const surface = document.createElement("div");
  surface.className = "md-editor-textarea md-editor-surface markdown-body";
  surface.contentEditable = "true";
  surface.spellcheck = true;
  surface.setAttribute("role", "textbox");
  surface.setAttribute("aria-multiline", "true");
  surface.setAttribute("data-placeholder", placeholder);
  root.appendChild(surface);

  function refreshEmptyState() {
    const hasText = Boolean(normalizeText(surface.textContent || "").trim() || surface.querySelector("img,hr,pre"));
    surface.setAttribute("data-empty", hasText ? "false" : "true");
  }

  function setValue(value) {
    surface.innerHTML = markdownToEditorHtml(value);
    normalizeEditorSurface();
  }

  function applyCommand(command, value = null) {
    surface.focus();
    document.execCommand(command, false, value);
    normalizeEditorSurface();
  }

  function normalizeTaskCheckbox(checkbox) {
    checkbox.classList.add("md-editor-task-checkbox");
    checkbox.removeAttribute("disabled");
    checkbox.removeAttribute("aria-disabled");
    checkbox.setAttribute("contenteditable", "false");
  }

  function markListItemAsTask(listItem, { checked = false } = {}) {
    if (!listItem || listItem.tagName !== "LI") return;
    let checkbox = listItem.querySelector(":scope > input[type=\"checkbox\"]");
    if (!checkbox) {
      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = checked;
      listItem.insertBefore(checkbox, listItem.firstChild);
      listItem.insertBefore(document.createTextNode(" "), checkbox.nextSibling);
    }
    normalizeTaskCheckbox(checkbox);
    listItem.setAttribute("data-task", "true");
  }

  function unmarkListItemAsTask(listItem) {
    if (!listItem || listItem.tagName !== "LI") return;
    const checkbox = listItem.querySelector(":scope > input[type=\"checkbox\"]");
    if (!checkbox) return;
    const maybeSpacer = checkbox.nextSibling;
    checkbox.remove();
    if (maybeSpacer?.nodeType === Node.TEXT_NODE && /^\s+$/.test(maybeSpacer.textContent || "")) {
      maybeSpacer.remove();
    }
    listItem.removeAttribute("data-task");
  }

  function normalizeTaskItems() {
    surface.querySelectorAll("input[type=\"checkbox\"]").forEach((checkbox) => {
      normalizeTaskCheckbox(checkbox);
      const ownerItem = findAncestorByTag(checkbox, surface, "LI");
      if (ownerItem) ownerItem.setAttribute("data-task", "true");
    });
    surface.querySelectorAll("li[data-task=\"true\"]").forEach((listItem) => {
      if (!listItem.querySelector(":scope > input[type=\"checkbox\"]")) {
        listItem.removeAttribute("data-task");
      }
    });
  }

  function normalizeEditorSurface() {
    ensureEditorStructure(surface);
    normalizeTaskItems();
    refreshEmptyState();
  }

  function getCurrentListItem() {
    const range = getSelectionRangeWithin(surface);
    if (!range) return null;
    return findAncestorByTag(range.commonAncestorContainer, surface, "LI");
  }

  function listItemTextWithoutCheckbox(listItem) {
    if (!listItem) return "";
    const clone = listItem.cloneNode(true);
    clone.querySelectorAll("input[type=\"checkbox\"]").forEach((node) => node.remove());
    clone.querySelectorAll("ul,ol").forEach((node) => node.remove());
    return normalizeText(clone.textContent || "").trim();
  }

  function toggleChecklistOnCurrentItem() {
    surface.focus();
    let listItem = getCurrentListItem();
    if (!listItem) {
      applyCommand("insertUnorderedList");
      listItem = getCurrentListItem();
    }
    if (!listItem) return;
    const hasCheckbox = Boolean(listItem.querySelector(":scope > input[type=\"checkbox\"]"));
    if (hasCheckbox) {
      unmarkListItemAsTask(listItem);
    } else {
      markListItemAsTask(listItem);
    }
    normalizeEditorSurface();
  }

  function handleToolbarAction(btn) {
    switch (btn.command) {
      case "bold":
      case "italic":
        applyCommand(btn.command);
        return;
      case "heading":
        applyCommand("formatBlock", "<h2>");
        return;
      case "unorderedList":
        applyCommand("insertUnorderedList");
        return;
      case "orderedList":
        applyCommand("insertOrderedList");
        return;
      case "checklist":
        toggleChecklistOnCurrentItem();
        return;
      case "indent":
        applyCommand("indent");
        return;
      case "outdent":
        applyCommand("outdent");
        return;
      case "quote":
        applyCommand("formatBlock", "<blockquote>");
        return;
      case "strike":
        applyCommand("strikeThrough");
        return;
      case "rule":
        applyCommand("insertHorizontalRule");
        return;
      case "code": {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);
        if (!surface.contains(range.commonAncestorContainer)) return;
        const selectedText = selection.toString().trim() || "code";
        applyCommand("insertHTML", `<code>${escapeHtml(selectedText)}</code>`);
        return;
      }
      case "link": {
        const raw = window.prompt("Enter link URL");
        const url = sanitizeLinkUrl(raw);
        if (!url) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        if (!selection.toString()) {
          applyCommand("insertText", url);
          const range = getSelectionRangeWithin(surface);
          if (!range) return;
          range.setStart(range.startContainer, Math.max(0, range.startOffset - url.length));
          const nextSelection = window.getSelection();
          nextSelection?.removeAllRanges();
          nextSelection?.addRange(range);
        }
        applyCommand("createLink", url);
      }
    }
  }

  function applyBlockShortcut() {
    const range = getSelectionRangeWithin(surface);
    if (!range || !range.collapsed) return false;
    const block = findEditableBlock(range.endContainer, surface);
    if (!block || block === surface) return false;

    const prefixRange = document.createRange();
    prefixRange.selectNodeContents(block);
    prefixRange.setEnd(range.endContainer, range.endOffset);
    const prefix = normalizeText(prefixRange.toString() || "").trim();

    let action = "";
    if (/^#{1,6}$/.test(prefix)) action = `h${prefix.length}`;
    else if (/^[-*]$/.test(prefix)) action = "ul";
    else if (/^1\.$/.test(prefix)) action = "ol";
    else if (/^\[(?: |x|X)\]$/.test(prefix)) action = "task";
    else if (/^>$/.test(prefix)) action = "quote";
    if (!action) return false;

    prefixRange.deleteContents();
    if (action.startsWith("h")) applyCommand("formatBlock", `<${action}>`);
    else if (action === "ul") applyCommand("insertUnorderedList");
    else if (action === "ol") applyCommand("insertOrderedList");
    else if (action === "task") {
      applyCommand("insertUnorderedList");
      const listItem = getCurrentListItem();
      if (listItem) {
        markListItemAsTask(listItem, { checked: /x/i.test(prefix) });
      }
    }
    else if (action === "quote") applyCommand("formatBlock", "<blockquote>");
    return true;
  }

  function transformMarkdownInCurrentBlock() {
    const range = getSelectionRangeWithin(surface);
    if (!range || !range.collapsed) return false;
    const block = findEditableBlock(range.endContainer, surface);
    if (!block || block === surface || block.tagName === "PRE") return false;

    const rawText = normalizeText(block.textContent || "");
    const text = rawText.trim();
    if (!text || !INLINE_TRANSFORM_PATTERN.test(text)) return false;
    if (block.querySelector("a, strong, em, code, pre, ul, ol, blockquote, h1, h2, h3, h4, h5, h6")) return false;

    const html = markdownToEditorHtml(text);
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const replacement = temp.firstElementChild;
    if (!replacement) return false;

    if (block.tagName === "LI" && replacement.tagName === "P") {
      block.innerHTML = replacement.innerHTML;
      setCaretToEnd(block);
    } else {
      block.replaceWith(replacement);
      setCaretToEnd(replacement);
    }
    normalizeEditorSurface();
    return true;
  }

  let transformTimer = null;
  function scheduleInlineTransform() {
    clearTimeout(transformTimer);
    transformTimer = window.setTimeout(() => {
      transformTimer = null;
      transformMarkdownInCurrentBlock();
    }, 80);
  }

  let composing = false;
  addListener(surface, "compositionstart", () => {
    composing = true;
  });
  addListener(surface, "compositionend", () => {
    composing = false;
  });

  addListener(surface, "paste", (event) => {
    event.preventDefault();
    const plain = event.clipboardData?.getData("text/plain") || "";
    applyCommand("insertText", plain);
    scheduleInlineTransform();
  });

  addListener(surface, "keydown", (event) => {
    const activeListItem = getCurrentListItem();
    const activeIsTask = Boolean(activeListItem?.querySelector(":scope > input[type=\"checkbox\"]"));
    const activeWasEmpty = activeIsTask && !listItemTextWithoutCheckbox(activeListItem);

    if (event.key === "Tab") {
      event.preventDefault();
      if (activeListItem) {
        applyCommand(event.shiftKey ? "outdent" : "indent");
      } else {
        applyCommand("insertText", "  ");
      }
      return;
    }
    if (event.key === " " && !composing && applyBlockShortcut()) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && activeIsTask && !activeWasEmpty) {
      window.setTimeout(() => {
        const nextItem = getCurrentListItem();
        if (!nextItem) return;
        if (!nextItem.querySelector(":scope > input[type=\"checkbox\"]")) {
          markListItemAsTask(nextItem);
        }
        normalizeEditorSurface();
      }, 0);
    }
  });

  addListener(surface, "keyup", (event) => {
    if (composing) return;
    if (INLINE_TRIGGER_KEYS.has(event.key)) {
      scheduleInlineTransform();
    }
  });

  addListener(surface, "input", () => {
    normalizeEditorSurface();
  });

  addListener(surface, "change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      normalizeTaskCheckbox(target);
      refreshEmptyState();
    }
  });

  setValue(initialValue);

  return {
    element: root,
    textarea: surface,
    getValue() {
      return serializeEditorToMarkdown(surface);
    },
    setValue,
    destroy() {
      clearTimeout(transformTimer);
      listeners.forEach((dispose) => dispose());
    },
  };
}
