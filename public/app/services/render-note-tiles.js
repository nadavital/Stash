import { normalizeCitation, buildNoteTitle, buildContentPreview } from "./mappers.js";
import { iconTypeFor, noteTypeIconMarkup, relativeTime } from "./note-utils.js";
import { createActionMenu } from "../components/action-menu/action-menu.js";

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/**
 * Renders note tiles in grid or list view for the folder page.
 *
 * @param {HTMLElement} container – the #folder-items-grid element
 * @param {Array} items          – citation-shaped entries
 * @param {object} opts
 * @param {string}  [opts.viewMode]      – "grid" | "list"
 * @param {boolean} [opts.selectMode]    – whether batch select is active
 * @param {Set}     [opts.selectedIds]   – currently selected note IDs
 * @param {boolean} [opts.hasMore]       – whether more items can be loaded
 * @param {(note: object) => void}       opts.onOpen
 * @param {(noteId: string) => Promise}  opts.onMove
 * @param {(noteId: string) => Promise}  opts.onDelete
 * @param {(noteId: string, shell: HTMLElement) => void} opts.onToggleSelect
 * @param {() => Promise}               opts.onLoadMore
 */
export function renderNoteTiles(container, items, {
  viewMode = "grid",
  selectMode = false,
  selectedIds = new Set(),
  hasMore = false,
  onOpen,
  onMove,
  onDelete,
  onToggleSelect,
  onLoadMore,
}) {
  if (!container) return;
  container.innerHTML = "";

  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    const empty = document.createElement("p");
    empty.className = "ui-empty";
    empty.textContent = "No items.";
    container.appendChild(empty);
    return;
  }

  const isListView = viewMode === "list";
  if (isListView) {
    container.classList.add("view-list");
  } else {
    container.classList.remove("view-list");
  }

  list.slice(0, 60).forEach((entry, index) => {
    const note = normalizeCitation(entry, index).note;
    const noteType = iconTypeFor(note);
    const isLink = noteType === "link";
    const ogImage = note.metadata?.ogImage || "";

    const tileShell = document.createElement("div");
    tileShell.className = "folder-file-tile-shell";
    tileShell.style.cssText = `animation: fadeInUp 200ms ease both;`;

    const tile = document.createElement("article");
    tile.className = "folder-file-tile";
    tile.dataset.type = noteType;
    tile.tabIndex = 0;
    tile.setAttribute("role", "button");

    if (isListView) {
      const listIcon = document.createElement("span");
      listIcon.className = "list-view-icon";
      listIcon.innerHTML = noteTypeIconMarkup(noteType);
      tile.appendChild(listIcon);

      const body = document.createElement("div");
      body.className = "folder-file-body";

      const titleEl = document.createElement("p");
      titleEl.className = "folder-file-title";
      titleEl.textContent = buildNoteTitle(note);
      body.appendChild(titleEl);

      {
        const domain = isLink && note.sourceUrl ? extractDomain(note.sourceUrl) : "";
        const titleText = buildNoteTitle(note);
        if (domain && !titleText.startsWith(domain)) {
          const domainEl = document.createElement("p");
          domainEl.className = "folder-file-domain";
          domainEl.textContent = domain;
          body.appendChild(domainEl);
        }
        const previewText = buildContentPreview(note) || "";
        if (previewText) {
          const previewEl = document.createElement("p");
          previewEl.className = "folder-file-preview";
          previewEl.textContent = previewText;
          body.appendChild(previewEl);
        }
      }
      tile.appendChild(body);

      const timeEl = document.createElement("span");
      timeEl.className = "list-view-time";
      timeEl.textContent = relativeTime(note.createdAt);
      tile.appendChild(timeEl);

      const actions = document.createElement("div");
      actions.className = "list-view-actions";

      const actionMenu = createActionMenu({
        ariaLabel: `Actions for item ${buildNoteTitle(note)}`,
        actions: [
          {
            label: "Move item",
            onSelect: () => onMove(note.id),
          },
          {
            label: "Delete item",
            tone: "danger",
            onSelect: () => onDelete(note.id),
          },
        ],
      });

      actions.append(actionMenu);
      tile.appendChild(actions);
    } else {
      const heroSrc = note.imagePath || (isLink && ogImage ? ogImage : "");

      // Action menu — shared between both layouts
      const actionRow = document.createElement("div");
      actionRow.className = "folder-file-actions";

      const actionMenu = createActionMenu({
        ariaLabel: `Actions for item ${buildNoteTitle(note)}`,
        actions: [
          {
            label: "Move item",
            onSelect: () => onMove(note.id),
          },
          {
            label: "Delete item",
            tone: "danger",
            onSelect: () => onDelete(note.id),
          },
        ],
      });

      actionRow.append(actionMenu);

      if (heroSrc) {
        // ── Image tile: full-bleed hero with gradient overlay ──
        tile.classList.add("has-hero");

        const heroImg = document.createElement("img");
        heroImg.className = "folder-file-hero-bg";
        heroImg.src = heroSrc;
        heroImg.alt = buildNoteTitle(note);
        heroImg.loading = "lazy";
        heroImg.onerror = () => {
          tile.classList.remove("has-hero");
          heroImg.remove();
          // Rebuild as a plain tile — add icon + body
          const fallbackIcon = document.createElement("span");
          fallbackIcon.className = "folder-file-glass-icon";
          fallbackIcon.innerHTML = noteTypeIconMarkup(noteType);
          tile.insertBefore(fallbackIcon, glass);
          glass.className = "folder-file-body";
          glass.style.background = "none";
        };
        tile.appendChild(heroImg);

        // Gradient overlay at bottom of image
        const glass = document.createElement("div");
        glass.className = "folder-file-glass";

        const titleEl = document.createElement("p");
        titleEl.className = "folder-file-title";
        titleEl.textContent = buildNoteTitle(note);
        glass.appendChild(titleEl);

        {
          const domain = isLink && note.sourceUrl ? extractDomain(note.sourceUrl) : "";
          const titleText = buildNoteTitle(note);
          if (domain && !titleText.startsWith(domain)) {
            const domainEl = document.createElement("p");
            domainEl.className = "folder-file-domain";
            domainEl.textContent = domain;
            glass.appendChild(domainEl);
          }
        }

        const footer = document.createElement("div");
        footer.className = "folder-file-footer";
        const timeEl = document.createElement("span");
        timeEl.className = "folder-file-time";
        timeEl.textContent = relativeTime(note.createdAt);
        footer.appendChild(timeEl);
        footer.appendChild(actionRow);
        glass.appendChild(footer);

        tile.appendChild(glass);
      } else {
        // ── Non-image tile: glass card with type icon ──
        const glassIcon = document.createElement("span");
        glassIcon.className = "folder-file-glass-icon";
        glassIcon.innerHTML = noteTypeIconMarkup(noteType);
        tile.appendChild(glassIcon);

        const body = document.createElement("div");
        body.className = "folder-file-body";

        const titleEl = document.createElement("p");
        titleEl.className = "folder-file-title";
        titleEl.textContent = buildNoteTitle(note);
        body.appendChild(titleEl);

        {
          const domain = isLink && note.sourceUrl ? extractDomain(note.sourceUrl) : "";
          const titleText = buildNoteTitle(note);
          if (domain && !titleText.startsWith(domain)) {
            const domainEl = document.createElement("p");
            domainEl.className = "folder-file-domain";
            domainEl.textContent = domain;
            body.appendChild(domainEl);
          }
          const previewText = buildContentPreview(note) || "";
          if (previewText) {
            const previewEl = document.createElement("p");
            previewEl.className = "folder-file-preview";
            previewEl.textContent = previewText;
            body.appendChild(previewEl);
          }
        }
        tile.appendChild(body);

        const footer = document.createElement("div");
        footer.className = "folder-file-footer";
        const timeEl = document.createElement("span");
        timeEl.className = "folder-file-time";
        timeEl.textContent = relativeTime(note.createdAt);
        footer.appendChild(timeEl);
        footer.appendChild(actionRow);
        tile.appendChild(footer);
      }
    }

    tile.addEventListener("click", (e) => {
      if (e.target.closest(".folder-file-actions") || e.target.closest(".list-view-actions")) return;
      if (selectMode) {
        onToggleSelect(note.id, tileShell);
        return;
      }
      onOpen(note);
    });
    tile.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      tile.click();
    });

    if (selectMode) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "batch-select-checkbox";
      checkbox.checked = selectedIds.has(String(note.id));
      checkbox.style.display = "block";
      checkbox.addEventListener("change", () => {
        onToggleSelect(note.id, tileShell);
      });
      tileShell.prepend(checkbox);
    }

    tileShell.appendChild(tile);
    container.appendChild(tileShell);
  });

  // Load more button
  if (hasMore && list.length > 0) {
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.type = "button";
    loadMoreBtn.className = "batch-action-btn";
    loadMoreBtn.style.cssText = "width: 100%; margin-top: 12px; grid-column: 1 / -1;";
    loadMoreBtn.textContent = "Load more";
    loadMoreBtn.addEventListener("click", () => onLoadMore());
    container.appendChild(loadMoreBtn);
  }
}
