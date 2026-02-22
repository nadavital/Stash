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
    viewBox: "0 0 24 24",
    body: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>`,
    strokeWidth: 2,
  },
  "note-file": {
    viewBox: "0 0 24 24",
    body: `<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/>`,
    strokeWidth: 2,
  },
  "note-image": {
    viewBox: "0 0 24 24",
    body: `<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`,
    strokeWidth: 2,
  },
  "note-link": {
    viewBox: "0 0 24 24",
    body: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
    strokeWidth: 2,
  },
  "folder": {
    viewBox: "0 0 24 24",
    body: `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`,
    strokeWidth: 2,
  },
  "trash": {
    viewBox: "0 0 24 24",
    body: `<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`,
    strokeWidth: 2,
  },
  "chevron-right": {
    viewBox: "0 0 24 24",
    body: `<path d="m9 18 6-6-6-6"/>`,
    strokeWidth: 2,
  },
  "ellipsis-vertical": {
    viewBox: "0 0 24 24",
    body: `<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>`,
    strokeWidth: 2,
  },
  "attach": {
    viewBox: "0 0 24 24",
    body: `<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>`,
    strokeWidth: 2,
  },
  "arrow-up": {
    viewBox: "0 0 24 24",
    body: `<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>`,
    strokeWidth: 2,
  },
  "search": {
    viewBox: "0 0 24 24",
    body: `<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>`,
    strokeWidth: 2,
  },
  "sort": {
    viewBox: "0 0 24 24",
    body: `<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>`,
    strokeWidth: 2,
  },
  "view-grid": {
    viewBox: "0 0 24 24",
    body: `<path d="M12 3v18"/><path d="M3 12h18"/><rect x="3" y="3" width="18" height="18" rx="2"/>`,
    strokeWidth: 2,
  },
  "view-list": {
    viewBox: "0 0 24 24",
    body: `<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>`,
    strokeWidth: 2,
  },
  "chat": {
    viewBox: "0 0 24 24",
    body: `<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>`,
    strokeWidth: 2,
  },
  "close": {
    viewBox: "0 0 24 24",
    body: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
    strokeWidth: 2,
  },
  "edit": {
    viewBox: "0 0 24 24",
    body: `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>`,
    strokeWidth: 2,
  },
  "square-pen": {
    viewBox: "0 0 24 24",
    body: `<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>`,
    strokeWidth: 2,
  },
  "copy": {
    viewBox: "0 0 24 24",
    body: `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
    strokeWidth: 2,
  },
  "refresh": {
    viewBox: "0 0 24 24",
    body: `<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>`,
    strokeWidth: 2,
  },
  "check": {
    viewBox: "0 0 24 24",
    body: `<path d="M20 6 9 17l-5-5"/>`,
    strokeWidth: 2,
  },
  "move": {
    viewBox: "0 0 24 24",
    body: `<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>`,
    strokeWidth: 2,
  },
  "activity": {
    viewBox: "0 0 24 24",
    body: `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>`,
    strokeWidth: 2,
  },
  "external-link": {
    viewBox: "0 0 24 24",
    body: `<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`,
    strokeWidth: 2,
  },
  "activity-comment": {
    viewBox: "0 0 24 24",
    body: `<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>`,
    strokeWidth: 2,
  },
  "activity-enrichment": {
    viewBox: "0 0 24 24",
    body: `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>`,
    strokeWidth: 2,
  },
  "activity-edit": {
    viewBox: "0 0 24 24",
    body: `<path d="M13 21h8"/><path d="m15 5 4 4"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>`,
    strokeWidth: 2,
  },
  "md-bold": {
    viewBox: "0 0 24 24",
    body: `<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>`,
    strokeWidth: 2,
  },
  "md-italic": {
    viewBox: "0 0 24 24",
    body: `<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>`,
    strokeWidth: 2,
  },
  "md-strike": {
    viewBox: "0 0 24 24",
    body: `<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>`,
    strokeWidth: 2,
  },
  "md-code": {
    viewBox: "0 0 24 24",
    body: `<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>`,
    strokeWidth: 2,
  },
  "md-heading": {
    viewBox: "0 0 24 24",
    body: `<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>`,
    strokeWidth: 2,
  },
  "md-bullets": {
    viewBox: "0 0 24 24",
    body: `<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>`,
    strokeWidth: 2,
  },
  "md-numbers": {
    viewBox: "0 0 24 24",
    body: `<path d="M11 5h10"/><path d="M11 12h10"/><path d="M11 19h10"/><path d="M4 4h1v5"/><path d="M4 9h2"/><path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"/>`,
    strokeWidth: 2,
  },
  "md-checklist": {
    viewBox: "0 0 24 24",
    body: `<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>`,
    strokeWidth: 2,
  },
  "md-indent": {
    viewBox: "0 0 24 24",
    body: `<path d="M21 5H11"/><path d="M21 12H11"/><path d="M21 19H11"/><path d="m3 8 4 4-4 4"/>`,
    strokeWidth: 2,
  },
  "md-outdent": {
    viewBox: "0 0 24 24",
    body: `<path d="M21 5H11"/><path d="M21 12H11"/><path d="M21 19H11"/><path d="m7 8-4 4 4 4"/>`,
    strokeWidth: 2,
  },
  "md-quote": {
    viewBox: "0 0 24 24",
    body: `<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>`,
    strokeWidth: 2,
  },
  "md-link": {
    viewBox: "0 0 24 24",
    body: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
    strokeWidth: 2,
  },
  "md-rule": {
    viewBox: "0 0 24 24",
    body: `<path d="M5 12h14"/>`,
    strokeWidth: 2,
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
