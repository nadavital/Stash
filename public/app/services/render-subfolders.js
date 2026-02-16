import { createActionMenu } from "../components/action-menu/action-menu.js";

/**
 * Renders subfolder cards in grid or list view.
 *
 * @param {HTMLElement} sectionEl – the #subfolders-section wrapper (toggled hidden)
 * @param {HTMLElement} gridEl    – the #subfolders-grid container
 * @param {Array}       subFolders
 * @param {object}      opts
 * @param {string}      [opts.viewMode]  – "grid" | "list"
 * @param {(folder: object) => void} opts.onOpen
 * @param {(folder: object) => void} opts.onRename
 * @param {(folder: object) => void} opts.onDelete
 */
export function renderSubfolders(sectionEl, gridEl, subFolders, {
  viewMode = "grid",
  onOpen,
  onRename,
  onDelete,
}) {
  if (!sectionEl || !gridEl) return;
  if (!subFolders.length) {
    sectionEl.classList.add("hidden");
    return;
  }
  sectionEl.classList.remove("hidden");
  gridEl.innerHTML = "";

  const isListView = viewMode === "list";
  if (isListView) {
    gridEl.classList.add("view-list");
  } else {
    gridEl.classList.remove("view-list");
  }

  subFolders.forEach((folder) => {
    if (isListView) {
      const row = document.createElement("div");
      row.className = "subfolder-row";
      row.tabIndex = 0;
      row.setAttribute("role", "link");

      const dot = document.createElement("span");
      dot.className = "folder-row-dot";
      dot.dataset.color = folder.color || "green";

      const nameEl = document.createElement("span");
      nameEl.className = "folder-row-name";
      nameEl.textContent = folder.name;

      const actionMenu = createActionMenu({
        ariaLabel: `Actions for folder ${folder.name}`,
        actions: [
          { label: "Rename folder", onSelect: () => onRename(folder) },
          { label: "Delete folder", tone: "danger", onSelect: () => onDelete(folder) },
        ],
      });

      row.append(dot, nameEl, actionMenu);
      row.addEventListener("click", (event) => {
        if (event.target.closest(".action-menu")) return;
        onOpen(folder);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(folder);
      });
      gridEl.appendChild(row);
    } else {
      const card = document.createElement("article");
      card.className = "folder-pill subfolder-pill";
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.dataset.color = folder.color || "green";

      const nameEl = document.createElement("span");
      nameEl.className = "folder-pill-name";
      nameEl.textContent = folder.name;

      const footer = document.createElement("div");
      footer.className = "folder-pill-footer subfolder-pill-footer";

      const actionMenu = createActionMenu({
        ariaLabel: `Actions for folder ${folder.name}`,
        actions: [
          { label: "Rename folder", onSelect: () => onRename(folder) },
          { label: "Delete folder", tone: "danger", onSelect: () => onDelete(folder) },
        ],
      });

      footer.append(actionMenu);

      const inner = document.createElement("div");
      inner.className = "folder-pill-inner";
      inner.append(nameEl, footer);
      card.append(inner);
      card.addEventListener("click", (event) => {
        if (event.target.closest(".action-menu")) return;
        onOpen(folder);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen(folder);
      });
      gridEl.appendChild(card);
    }
  });
}
