function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeSize(value, fallback = 16) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(8, Math.min(64, Math.round(numeric)));
}

const ICONS = Object.freeze({
  "note-text": {
    viewBox: "0 0 20 20",
    fill: "currentColor",
    stroke: "none",
    body: `<path d="M5 2.5A2.5 2.5 0 0 0 2.5 5v10A2.5 2.5 0 0 0 5 17.5h10a2.5 2.5 0 0 0 2.5-2.5V8.8a2.5 2.5 0 0 0-.7-1.8l-3.8-3.8a2.5 2.5 0 0 0-1.8-.7H5Zm5.4 1.6L15.9 9h-4a1.5 1.5 0 0 1-1.5-1.5v-3.4Z"/>`,
  },
  "note-file": {
    viewBox: "0 0 20 20",
    fill: "currentColor",
    stroke: "none",
    body: `<path d="M5 2.5A2.5 2.5 0 0 0 2.5 5v10A2.5 2.5 0 0 0 5 17.5h10a2.5 2.5 0 0 0 2.5-2.5V8.8a2.5 2.5 0 0 0-.7-1.8l-3.8-3.8a2.5 2.5 0 0 0-1.8-.7H5Zm5.4 1.6L15.9 9h-4a1.5 1.5 0 0 1-1.5-1.5v-3.4Z"/>`,
  },
  "note-image": {
    viewBox: "0 0 20 20",
    fill: "currentColor",
    stroke: "none",
    body: `<path d="M4.5 3A2.5 2.5 0 0 0 2 5.5v9A2.5 2.5 0 0 0 4.5 17h11a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 15.5 3h-11Zm8.7 3.8a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6Zm-8.7 8V13l2.8-2.8a1 1 0 0 1 1.4 0L11 12.5l1.4-1.4a1 1 0 0 1 1.4 0l2.2 2.2v1.5h-11Z"/>`,
  },
  "note-link": {
    viewBox: "0 0 20 20",
    fill: "currentColor",
    stroke: "none",
    body: `<path d="M7.6 6.2a3 3 0 0 1 4.2 0 .8.8 0 1 1-1.1 1.1 1.4 1.4 0 0 0-2 2l.6.6a1.4 1.4 0 0 0 2 0 .8.8 0 0 1 1.1 1.1 3 3 0 0 1-4.2 0l-.6-.6a3 3 0 0 1 0-4.2Zm4.8 3.6a.8.8 0 0 1 1.1-1.1l.6.6a3 3 0 1 1-4.2 4.2.8.8 0 1 1 1.1-1.1 1.4 1.4 0 1 0 2-2l-.6-.6Z"/>`,
  },
  folder: {
    viewBox: "0 0 48 48",
    body: `<path d="M6 10a4 4 0 0 1 4-4h8.34a4 4 0 0 1 2.83 1.17l2.83 2.83H38a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V10Z"/>`,
    strokeWidth: 2,
  },
  "trash": {
    viewBox: "0 0 24 24",
    body: `<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>`,
    strokeWidth: 1.9,
  },
  "chevron-right": {
    viewBox: "0 0 16 16",
    body: `<polyline points="6 4 10 8 6 12"/>`,
    strokeWidth: 1.5,
  },
  "ellipsis-vertical": {
    viewBox: "0 0 20 20",
    body: `<circle cx="10" cy="4.5" r="1.6"></circle><circle cx="10" cy="10" r="1.6"></circle><circle cx="10" cy="15.5" r="1.6"></circle>`,
    stroke: "none",
    fill: "currentColor",
  },
  attach: {
    viewBox: "0 0 16 16",
    body: `<path d="M14 8.67l-5.15 5.15a3.5 3.5 0 0 1-4.95-4.95L9.05 3.72a2.33 2.33 0 0 1 3.3 3.3L7.2 12.17a1.17 1.17 0 0 1-1.65-1.65L10.7 5.37"/>`,
    strokeWidth: 1.6,
  },
  "arrow-up": {
    viewBox: "0 0 16 16",
    body: `<line x1="8" y1="14" x2="8" y2="3"/><polyline points="3 7 8 2 13 7"/>`,
    strokeWidth: 2,
  },
  search: {
    viewBox: "0 0 16 16",
    body: `<circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14.5" y2="14.5"/>`,
    strokeWidth: 1.5,
  },
  sort: {
    viewBox: "0 0 20 20",
    body: `<path d="M3 5h14M5 10h10M7 15h6"/>`,
    strokeWidth: 1.8,
  },
  "view-grid": {
    viewBox: "0 0 16 16",
    body: `<rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/>`,
    stroke: "none",
    fill: "currentColor",
  },
  "view-list": {
    viewBox: "0 0 16 16",
    body: `<line x1="1" y1="4" x2="15" y2="4"/><line x1="1" y1="8" x2="15" y2="8"/><line x1="1" y1="12" x2="15" y2="12"/>`,
    strokeWidth: 1.5,
  },
  chat: {
    viewBox: "0 0 18 18",
    body: `<path d="M3 3h12v9H6l-3 3V3z"/>`,
    strokeWidth: 1.5,
  },
  close: {
    viewBox: "0 0 24 24",
    body: `<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>`,
    strokeWidth: 2,
  },
  edit: {
    viewBox: "0 0 24 24",
    body: `<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L17.5 5a2.1 2.1 0 0 0-3 0L4 15.5V20Z"/><path d="m13.5 6 4.5 4.5"/>`,
    strokeWidth: 1.9,
  },
  refresh: {
    viewBox: "0 0 20 20",
    body: `<path d="M9.9 2.6a7.4 7.4 0 0 1 6.3 3.5V3.8a.8.8 0 1 1 1.6 0V8a.8.8 0 0 1-.8.8h-4.2a.8.8 0 1 1 0-1.6h2.3A5.8 5.8 0 1 0 15 13a.8.8 0 0 1 1.6.2 7.4 7.4 0 1 1-6.7-10.6Z"/>`,
    stroke: "none",
    fill: "currentColor",
  },
  check: {
    viewBox: "0 0 24 24",
    body: `<path d="m5 12 4.2 4.2L19 6.5"/>`,
    strokeWidth: 2.2,
  },
  move: {
    viewBox: "0 0 24 24",
    body: `<path d="M3 8a2 2 0 0 1 2-2h6l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/><path d="M11 14h6"/><path d="m14 11 3 3-3 3"/>`,
    strokeWidth: 1.9,
  },
  activity: {
    viewBox: "0 0 24 24",
    body: `<path d="M3.5 11a8.5 8.5 0 1 0 2.4-5.9"/><path d="M3.5 5.1V10h4.9"/><path d="M12 7.5v4.8l3.2 2"/>`,
    strokeWidth: 1.9,
  },
  "external-link": {
    viewBox: "0 0 16 16",
    body: `<path d="M9.2 2.6h4.2v4.2"/><path d="M13.3 2.7 7.7 8.3"/><path d="M6.4 3H3.7A1.7 1.7 0 0 0 2 4.7v7.6A1.7 1.7 0 0 0 3.7 14h7.6a1.7 1.7 0 0 0 1.7-1.7V9.6"/>`,
    strokeWidth: 1.55,
  },
  "activity-comment": {
    viewBox: "0 0 16 16",
    body: `<path d="M14 10c0 .55-.45 1-1 1H5l-3 3V3c0-.55.45-1 1-1h10c.55 0 1 .45 1 1v7z"/>`,
    strokeWidth: 2,
  },
  "activity-enrichment": {
    viewBox: "0 0 16 16",
    body: `<polygon points="8 1 10 6 15 6 11 9.5 12.5 15 8 11.5 3.5 15 5 9.5 1 6 6 6"/>`,
    strokeWidth: 2,
  },
  "activity-edit": {
    viewBox: "0 0 16 16",
    body: `<path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/>`,
    strokeWidth: 2,
  },
  "md-bold": {
    viewBox: "0 0 24 24",
    body: `<path d="M7 5v14"/><path d="M7 5h7a3 3 0 1 1 0 6H7"/><path d="M7 11h7.8a3.5 3.5 0 1 1 0 7H7"/>`,
    strokeWidth: 1.9,
  },
  "md-italic": {
    viewBox: "0 0 24 24",
    body: `<path d="M10 5h10"/><path d="M4 19h10"/><path d="M14 5 10 19"/>`,
    strokeWidth: 1.9,
  },
  "md-strike": {
    viewBox: "0 0 24 24",
    body: `<path d="M4 12h16"/><path d="M16.5 7c-1-.9-2.4-1.5-4.4-1.5-2.8 0-4.6 1.2-4.6 3 0 1.4.9 2.2 2.8 2.7l3.4.8c2 .5 2.9 1.4 2.9 3 0 2.1-1.9 3.5-5 3.5-2 0-3.8-.6-5.1-1.7"/>`,
    strokeWidth: 1.8,
  },
  "md-code": {
    viewBox: "0 0 24 24",
    body: `<path d="m9 8-5 4 5 4"/><path d="m15 8 5 4-5 4"/><path d="m14 5-4 14"/>`,
    strokeWidth: 1.9,
  },
  "md-heading": {
    viewBox: "0 0 24 24",
    body: `<path d="M4 5v14M10 5v14M4 12h6"/><path d="M15 8h5M17.5 8v11"/>`,
    strokeWidth: 1.9,
  },
  "md-bullets": {
    viewBox: "0 0 24 24",
    body: `<circle cx="6" cy="7" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="6" cy="17" r="1.4"/><path d="M10 7h10M10 12h10M10 17h10"/>`,
    strokeWidth: 1.9,
  },
  "md-numbers": {
    viewBox: "0 0 24 24",
    body: `<path d="M4.5 7h1.8v4"/><path d="M4 14.5h3l-2.6 3.2H7"/><path d="M10 7h10M10 12h10M10 17h10"/>`,
    strokeWidth: 1.9,
  },
  "md-checklist": {
    viewBox: "0 0 24 24",
    body: `<rect x="4" y="5" width="3.8" height="3.8" rx="0.8"/><path d="M11 7h9"/><rect x="4" y="14" width="3.8" height="3.8" rx="0.8"/><path d="m4.6 15.9 1 1.2 1.9-2.2"/><path d="M11 16h9"/>`,
    strokeWidth: 1.9,
  },
  "md-indent": {
    viewBox: "0 0 24 24",
    body: `<path d="M4 7h8M4 12h8M4 17h8"/><path d="m14 8 4 4-4 4"/><path d="M14 12h6"/>`,
    strokeWidth: 1.9,
  },
  "md-outdent": {
    viewBox: "0 0 24 24",
    body: `<path d="M4 7h8M4 12h8M4 17h8"/><path d="m18 8-4 4 4 4"/><path d="M8 12h6"/>`,
    strokeWidth: 1.9,
  },
  "md-quote": {
    viewBox: "0 0 24 24",
    body: `<path d="M5 6h5v6H7.2v4H4.8v-4.4C4.8 8.7 5.9 6 8.1 6Zm9 0h5v6h-2.8v4h-2.4v-4.4C13.8 8.7 14.9 6 17.1 6Z"/>`,
    strokeWidth: 1.7,
  },
  "md-link": {
    viewBox: "0 0 24 24",
    body: `<path d="m10 14 4-4"/><path d="m8.5 8.5-2.6 2.6a3.2 3.2 0 0 0 4.5 4.5l2.6-2.6"/><path d="m15.5 15.5 2.6-2.6a3.2 3.2 0 0 0-4.5-4.5L11 11"/>`,
    strokeWidth: 1.9,
  },
  "md-rule": {
    viewBox: "0 0 24 24",
    body: `<path d="M3 12h18"/><path d="M5.5 7h3M15.5 7h3"/><path d="M5.5 17h3M15.5 17h3"/>`,
    strokeWidth: 1.9,
  },
});

export function renderIcon(name, {
  size = 16,
  className = "",
  label = "",
  title = "",
  strokeWidth = null,
} = {}) {
  const icon = ICONS[String(name || "").trim()] || ICONS["note-text"];
  const dimension = normalizeSize(size, 16);
  const classes = String(className || "").trim();
  const accessibleLabel = String(label || "").trim();
  const accessibleTitle = String(title || "").trim();
  const resolvedStrokeWidth =
    strokeWidth !== null && strokeWidth !== undefined
      ? Number(strokeWidth) || icon.strokeWidth || 1.6
      : icon.strokeWidth || 1.6;
  const fill = icon.fill || "none";
  const stroke = icon.stroke || "currentColor";
  const ariaAttrs = accessibleLabel
    ? `role="img" aria-label="${escapeAttr(accessibleLabel)}"`
    : `aria-hidden="true"`;

  return `<svg${classes ? ` class="${escapeAttr(classes)}"` : ""} width="${dimension}" height="${dimension}" viewBox="${icon.viewBox || "0 0 16 16"}" fill="${fill}" stroke="${stroke}" stroke-width="${resolvedStrokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${ariaAttrs}>${accessibleTitle ? `<title>${escapeAttr(accessibleTitle)}</title>` : ""}${icon.body}</svg>`;
}

export function noteTypeIconName(type = "") {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "image") return "note-image";
  if (normalized === "link") return "note-link";
  if (normalized === "file") return "note-file";
  return "note-text";
}
