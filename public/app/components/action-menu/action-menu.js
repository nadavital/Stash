function closeSiblingMenus(menu) {
  const root = menu?.ownerDocument || document;
  root.querySelectorAll(".action-menu[open]").forEach((entry) => {
    if (entry === menu) return;
    entry.open = false;
  });
}

export function closeAllActionMenus(root = document) {
  root.querySelectorAll(".action-menu[open]").forEach((entry) => {
    entry.open = false;
  });
}

export function createActionMenu({ ariaLabel = "More actions", actions = [] } = {}) {
  const menu = document.createElement("details");
  menu.className = "action-menu";

  const trigger = document.createElement("summary");
  trigger.className = "action-menu-trigger";
  trigger.setAttribute("aria-label", ariaLabel);
  trigger.innerHTML = `
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="4.5" r="1.6"></circle>
      <circle cx="10" cy="10" r="1.6"></circle>
      <circle cx="10" cy="15.5" r="1.6"></circle>
    </svg>
  `;

  const panel = document.createElement("div");
  panel.className = "action-menu-panel";

  actions.forEach((entry) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "action-menu-item";
    if (entry?.tone === "danger") {
      item.classList.add("is-danger");
    }
    item.textContent = String(entry?.label || "Action");
    item.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      if (typeof entry?.onSelect === "function") {
        await entry.onSelect();
      }
    });
    panel.appendChild(item);
  });

  menu.append(trigger, panel);

  const repositionMenu = () => {
    if (!menu.open) return;
    menu.classList.remove("is-align-left", "is-open-up");
    const padding = 8;

    let rect = panel.getBoundingClientRect();
    if (rect.right > window.innerWidth - padding) {
      menu.classList.add("is-align-left");
      rect = panel.getBoundingClientRect();
    }

    if (rect.bottom > window.innerHeight - padding) {
      menu.classList.add("is-open-up");
      rect = panel.getBoundingClientRect();
    }

    if (rect.left < padding) {
      menu.classList.remove("is-align-left");
    }
    if (rect.top < padding) {
      menu.classList.remove("is-open-up");
    }
  };

  const onViewportChange = () => {
    window.requestAnimationFrame(repositionMenu);
  };

  menu.addEventListener("toggle", () => {
    if (menu.open) {
      closeSiblingMenus(menu);
      window.requestAnimationFrame(repositionMenu);
      window.addEventListener("resize", onViewportChange);
      window.addEventListener("scroll", onViewportChange, true);
    } else {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    }
  });

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    menu.open = false;
  });

  return menu;
}
