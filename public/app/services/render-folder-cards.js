import { normalizeCitation, buildNoteTitle } from "./mappers.js";
import { normalizeFolderDrafts, fallbackColorForFolder } from "./folder-utils.js";
import { iconTypeFor, noteTypeIconMarkup } from "./note-utils.js";
import { createActionMenu } from "../components/action-menu/action-menu.js";

/* ── Paper card helpers for folder tissue-box ─────────── */

/** Extract best available HTTP image URL from a note object */
function getNoteImageUrl(note) {
  if (!note) return "";
  const candidates = [
    note.imagePath,
    note.metadata?.ogImage,
    note.metadata?.imageUrl,
  ];
  for (const url of candidates) {
    if (url && typeof url === "string" && url.startsWith("http")) return url;
  }
  return "";
}

/** Create a paper DOM element with content from a note */
function createPaperElement(layout, note) {
  const paper = document.createElement("div");
  paper.className = "folder-paper";
  paper.style.setProperty("--pw", layout.w);
  paper.style.setProperty("--ph", layout.h + "px");
  paper.style.setProperty("--pl", layout.l || "auto");
  paper.style.setProperty("--pr", layout.r || "auto");
  paper.style.setProperty("--prot", layout.rot + "deg");

  if (!note) return paper;

  // Try image first — use <img> for lazy loading + error handling
  const imageUrl = getNoteImageUrl(note);
  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "folder-paper-img";
    img.src = imageUrl;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    // On error, remove img and show icon+text fallback instead
    img.onerror = () => {
      img.remove();
      paper.appendChild(buildPaperFallbackContent(note));
    };
    paper.appendChild(img);
    return paper;
  }

  // Fallback: icon + text snippet
  paper.appendChild(buildPaperFallbackContent(note));
  return paper;
}

/** Build icon + text content for a paper without an image */
function buildPaperFallbackContent(note) {
  const content = document.createElement("div");
  content.className = "folder-paper-content";

  const noteType = iconTypeFor(note);
  const icon = document.createElement("span");
  icon.className = "folder-paper-icon";
  icon.innerHTML = noteTypeIconMarkup(noteType);
  content.appendChild(icon);

  const title = buildNoteTitle(note);
  if (title) {
    const text = document.createElement("span");
    text.className = "folder-paper-text";
    text.textContent = title.length > 40 ? title.slice(0, 40) + "\u2026" : title;
    content.appendChild(text);
  }

  return content;
}

/**
 * Paper layout configs for 1–4 papers in a folder card.
 * More papers = each one is narrower/shorter to fit side-by-side.
 * Properties: w (width), h (height px), l (left), r (right), rot (degrees)
 */
function getPaperLayouts(count) {
  switch (count) {
    case 1:
      return [
        { w: "52%", h: 160, l: "24%", r: null, rot: -3 },
      ];
    case 2:
      return [
        { w: "48%", h: 165, l: "8%",  r: null, rot: -5 },
        { w: "46%", h: 155, l: null,   r: "8%", rot: 4 },
      ];
    case 3:
      return [
        { w: "40%", h: 158, l: "3%",  r: null, rot: -7 },
        { w: "36%", h: 150, l: "32%", r: null, rot: 1 },
        { w: "40%", h: 154, l: null,  r: "3%", rot: 6 },
      ];
    case 4:
      return [
        { w: "34%", h: 152, l: "1%",  r: null, rot: -8 },
        { w: "30%", h: 144, l: "20%", r: null, rot: -2 },
        { w: "30%", h: 148, l: null,  r: "18%", rot: 3 },
        { w: "34%", h: 140, l: null,  r: "1%", rot: 7 },
      ];
    default:
      return [];
  }
}

/**
 * Renders the folder card grid/list shared by the home page.
 *
 * @param {HTMLElement} container – the #home-folders-list element
 * @param {HTMLElement} emptyEl  – the #home-folders-empty element
 * @param {object} opts
 * @param {Array}  opts.dbFolders      – folders from DB API
 * @param {Array}  opts.draftFolders   – normalized draft folders from state
 * @param {Array}  opts.recentNotes    – recent note entries
 * @param {string} [opts.viewMode]     – "grid" | "list"
 * @param {(folder: object) => void} opts.onOpen
 * @param {(folder: object) => void} opts.onRename
 * @param {(folder: object) => void} opts.onDelete
 */
export function renderFolderCards(container, emptyEl, {
  dbFolders = [],
  draftFolders = [],
  recentNotes = [],
  viewMode = "grid",
  onOpen,
  onRename,
  onDelete,
}) {
  if (!container || !emptyEl) return;

  const folderMap = new Map();

  dbFolders.forEach((folder) => {
    folderMap.set(folder.name.toLowerCase(), {
      ...folder,
      count: 0,
      isDbFolder: true,
    });
  });

  draftFolders.forEach((folder) => {
    const key = folder.name.toLowerCase();
    if (!folderMap.has(key)) {
      folderMap.set(key, {
        ...folder,
        count: 0,
      });
    }
  });

  // Collect notes per folder for paper content (images, icons, text)
  const folderNotesMap = new Map();

  recentNotes.forEach((entry, index) => {
    const note = normalizeCitation(entry, index).note;
    const projectName = note.project || "General";
    const key = String(projectName).toLowerCase();

    if (!folderMap.has(key)) {
      folderMap.set(key, {
        name: projectName,
        description: "",
        color: fallbackColorForFolder(projectName),
        symbol: "DOC",
        count: 0,
      });
    }

    const current = folderMap.get(key);
    current.count += 1;
    folderMap.set(key, current);

    // Store up to 4 notes per folder for paper display
    if (!folderNotesMap.has(key)) folderNotesMap.set(key, []);
    const notes = folderNotesMap.get(key);
    if (notes.length < 4) notes.push(note);
  });

  const folders = [...folderMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });

  container.innerHTML = "";
  if (!folders.length) {
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");

  const isListView = viewMode === "list";
  if (isListView) {
    container.classList.add("view-list");
  } else {
    container.classList.remove("view-list");
  }

  folders.slice(0, 40).forEach((folder) => {
    if (isListView) {
      const row = document.createElement("div");
      row.className = "folder-pill-row";
      row.tabIndex = 0;
      row.setAttribute("role", "link");

      const dot = document.createElement("span");
      dot.className = "folder-row-dot";
      dot.dataset.color = folder.color;

      const nameEl = document.createElement("span");
      nameEl.className = "folder-row-name";
      nameEl.textContent = folder.name;

      const countEl = document.createElement("span");
      countEl.className = "folder-row-count";
      countEl.textContent = `${folder.count}`;

      const actionMenu = createActionMenu({
        ariaLabel: `Actions for folder ${folder.name}`,
        actions: [
          {
            label: "Rename folder",
            onSelect: () => onRename(folder),
          },
          {
            label: "Delete folder",
            tone: "danger",
            onSelect: () => onDelete(folder),
          },
        ],
      });

      row.append(dot, nameEl, countEl, actionMenu);

      row.addEventListener("click", (e) => {
        if (e.target.closest(".action-menu")) return;
        onOpen(folder);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(folder);
      });

      container.appendChild(row);
    } else {
      const card = document.createElement("article");
      card.className = "folder-pill";
      card.style.cssText = `animation: fadeInUp 200ms ease both;`;
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.dataset.color = folder.color;

      // Dynamic paper cards with content from actual notes (max 4)
      const folderKey = folder.name.toLowerCase();
      const folderNotes = folderNotesMap.get(folderKey) || [];
      const paperCount = Math.min(Math.max(folder.count, 0), 4);
      const paperLayouts = getPaperLayouts(paperCount);
      paperLayouts.forEach((p, i) => {
        card.appendChild(createPaperElement(p, folderNotes[i] || null));
      });

      const nameEl = document.createElement("span");
      nameEl.className = "folder-pill-name";
      nameEl.textContent = folder.name;

      const footer = document.createElement("div");
      footer.className = "folder-pill-footer";

      const countEl = document.createElement("span");
      countEl.className = "folder-pill-count";
      countEl.textContent = `${folder.count} item${folder.count !== 1 ? "s" : ""}`;

      const actionMenu = createActionMenu({
        ariaLabel: `Actions for folder ${folder.name}`,
        actions: [
          {
            label: "Rename folder",
            onSelect: () => onRename(folder),
          },
          {
            label: "Delete folder",
            tone: "danger",
            onSelect: () => onDelete(folder),
          },
        ],
      });

      footer.append(countEl, actionMenu);

      const inner = document.createElement("div");
      inner.className = "folder-pill-inner";
      inner.append(nameEl, footer);
      card.append(inner);

      card.addEventListener("click", (e) => {
        if (e.target.closest(".action-menu")) return;
        onOpen(folder);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(folder);
      });

      container.appendChild(card);
    }
  });
}
