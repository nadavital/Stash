import { marked } from "/lib/marked.esm.js";

marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Sanitize HTML string — strip scripts, iframes, on* attrs, javascript: URLs.
 * Force links to open in new tab.
 */
function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Remove dangerous elements
  doc.querySelectorAll("script, iframe, object, embed, form").forEach((el) => el.remove());

  // Remove on* attributes and javascript: URLs
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (attr.name.startsWith("on")) {
        el.removeAttribute(attr.name);
      }
      if (attr.value && attr.value.trim().toLowerCase().startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // Force links to open in new tab
  doc.querySelectorAll("a").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });

  return doc.body.innerHTML;
}

/**
 * Render markdown text to sanitized HTML string.
 */
export function renderMarkdown(text) {
  if (!text) return "";
  return sanitize(marked.parse(text));
}

/**
 * Render markdown into a container element, adding the .markdown-body class.
 */
export function renderMarkdownInto(container, text) {
  container.classList.add("markdown-body");
  container.innerHTML = renderMarkdown(text);
}
