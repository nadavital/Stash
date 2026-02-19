import { marked } from "../../lib/marked.esm.js";

marked.setOptions({
  gfm: true,
  breaks: true,
});

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "blockquote",
  "ul", "ol", "li",
  "pre", "code",
  "strong", "em", "del",
  "a", "img",
  "table", "thead", "tbody", "tr", "th", "td",
  "input",
]);
const BLOCKED_TAGS = new Set([
  "script", "style", "iframe", "object", "embed", "form",
  "meta", "base", "link", "textarea", "button", "select", "option", "noscript",
]);
const GLOBAL_ALLOWED_ATTRS = new Set(["title"]);
const TAG_ALLOWED_ATTRS = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "loading", "decoding", "referrerpolicy"]),
  code: new Set(["class"]),
  th: new Set(["align"]),
  td: new Set(["align"]),
  ol: new Set(["start"]),
  input: new Set(["type", "checked", "disabled", "aria-checked", "aria-disabled"]),
};

function isSafeUrl(rawValue, { allowDataImage = false } = {}) {
  const value = String(rawValue || "").trim();
  if (!value) return false;
  if (value.startsWith("#")) return true;
  if (value.startsWith("/")) return true;
  if (value.startsWith("./")) return true;
  if (value.startsWith("../")) return true;
  if (value.startsWith("?")) return true;

  if (allowDataImage && /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) {
    return true;
  }

  try {
    const parsed = new URL(value, "https://stash.local");
    return SAFE_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeClassValue(rawValue) {
  return String(rawValue || "")
    .trim()
    .split(/\s+/)
    .filter((name) => /^language-[a-z0-9_+-]{1,40}$/i.test(name))
    .join(" ");
}

function sanitizeAlignment(rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  return /^(left|right|center)$/.test(value) ? value : "";
}

function sanitize(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<!doctype html><html><body>${String(html || "")}</body></html>`,
    "text/html"
  );

  // Walk a snapshot since we may unwrap/remove nodes while iterating.
  const nodes = [...doc.body.querySelectorAll("*")];
  for (const el of nodes) {
    const tag = el.tagName.toLowerCase();

    if (BLOCKED_TAGS.has(tag)) {
      el.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      const parent = el.parentNode;
      if (!parent) continue;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      continue;
    }

    const allowedAttrs = TAG_ALLOWED_ATTRS[tag] || new Set();
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const rawValue = attr.value || "";
      const isAllowed = GLOBAL_ALLOWED_ATTRS.has(name) || allowedAttrs.has(name);
      if (!isAllowed || name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }

      if (name === "href") {
        if (!isSafeUrl(rawValue)) {
          el.removeAttribute("href");
        }
        continue;
      }

      if (name === "src") {
        if (!isSafeUrl(rawValue, { allowDataImage: false })) {
          el.remove();
          break;
        }
        continue;
      }

      if (name === "class") {
        const safeClass = sanitizeClassValue(rawValue);
        if (safeClass) {
          el.setAttribute("class", safeClass);
        } else {
          el.removeAttribute("class");
        }
        continue;
      }

      if (name === "align") {
        const safeAlign = sanitizeAlignment(rawValue);
        if (safeAlign) {
          el.setAttribute("align", safeAlign);
        } else {
          el.removeAttribute("align");
        }
        continue;
      }
    }

    if (!el.parentNode) continue;

    if (tag === "a") {
      if (el.hasAttribute("href")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer nofollow ugc");
      } else {
        el.removeAttribute("target");
        el.removeAttribute("rel");
      }
    } else if (tag === "img") {
      el.setAttribute("loading", "lazy");
      el.setAttribute("decoding", "async");
      el.setAttribute("referrerpolicy", "no-referrer");
    } else if (tag === "input") {
      if (String(el.getAttribute("type") || "").toLowerCase() !== "checkbox") {
        el.remove();
        continue;
      }
      el.setAttribute("disabled", "");
      el.setAttribute("aria-disabled", "true");
      if (el.hasAttribute("checked")) {
        el.setAttribute("aria-checked", "true");
      } else {
        el.setAttribute("aria-checked", "false");
      }
    }
  }

  return doc.body.innerHTML;
}

/**
 * Render markdown text to sanitized HTML string.
 */
export function renderMarkdown(text) {
  const source = String(text || "");
  if (!source.trim()) return "";

  try {
    return sanitize(marked.parse(source));
  } catch {
    return sanitize(marked.parseInline(source));
  }
}

/**
 * Render markdown into a container element, adding the .markdown-body class.
 */
export function renderMarkdownInto(container, text) {
  container.classList.add("markdown-body");
  container.innerHTML = renderMarkdown(text);
}
