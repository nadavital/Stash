function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

function toActivityListItems(items = []) {
  const entries = Array.isArray(items) ? items : [];
  return entries.map((entry) => ({
    actor: String(entry?.actorName || "").trim() || "Unknown user",
    message: String(entry?.message || "").trim() || "updated workspace",
    timestamp: formatTimestamp(entry?.createdAt),
  }));
}

export function renderFolderActivityModalHTML() {
  return `
    <div id="folder-activity-modal" class="folder-activity-modal hidden" aria-hidden="true">
      <div id="folder-activity-modal-backdrop" class="folder-activity-modal-backdrop"></div>
      <article class="folder-activity-modal-panel" role="dialog" aria-modal="true" aria-labelledby="folder-activity-modal-heading">
        <header class="folder-activity-modal-head">
          <h3 id="folder-activity-modal-heading" class="folder-activity-modal-heading">Activity</h3>
          <div class="folder-activity-modal-head-actions">
            <button id="folder-activity-modal-refresh" class="folder-activity-modal-refresh" type="button">Refresh</button>
            <button id="folder-activity-modal-close" class="folder-activity-modal-close" type="button" aria-label="Close">&times;</button>
          </div>
        </header>
        <ul id="folder-activity-modal-list" class="folder-activity-modal-list"></ul>
        <p id="folder-activity-modal-empty" class="folder-activity-modal-empty">No recent activity.</p>
      </article>
    </div>
  `;
}

export function queryFolderActivityModalEls(root) {
  return {
    folderActivityModal: root.querySelector("#folder-activity-modal"),
    folderActivityModalBackdrop: root.querySelector("#folder-activity-modal-backdrop"),
    folderActivityModalHeading: root.querySelector("#folder-activity-modal-heading"),
    folderActivityModalRefresh: root.querySelector("#folder-activity-modal-refresh"),
    folderActivityModalClose: root.querySelector("#folder-activity-modal-close"),
    folderActivityModalList: root.querySelector("#folder-activity-modal-list"),
    folderActivityModalEmpty: root.querySelector("#folder-activity-modal-empty"),
  };
}

export function renderFolderActivityModalItems(els, items = []) {
  const list = els?.folderActivityModalList;
  const empty = els?.folderActivityModalEmpty;
  if (!list || !empty) return;

  const entries = toActivityListItems(items);
  list.innerHTML = "";
  entries.forEach((entry) => {
    const row = document.createElement("li");
    row.className = "folder-activity-modal-item";
    row.innerHTML = `
      <p class="folder-activity-modal-line">
        <span class="folder-activity-modal-actor">${escapeHtml(entry.actor)}</span>
        <span class="folder-activity-modal-message">${escapeHtml(entry.message)}</span>
      </p>
      ${entry.timestamp ? `<time class="folder-activity-modal-time">${escapeHtml(entry.timestamp)}</time>` : ""}
    `;
    list.appendChild(row);
  });

  empty.classList.toggle("hidden", entries.length > 0);
}

export function openFolderActivityModal(els, { title = "Activity", items = [] } = {}) {
  if (!els?.folderActivityModal) return;
  if (els.folderActivityModalHeading) {
    els.folderActivityModalHeading.textContent = String(title || "Activity");
  }
  renderFolderActivityModalItems(els, items);
  els.folderActivityModal.classList.remove("hidden");
  els.folderActivityModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

export function closeFolderActivityModal(els) {
  if (!els?.folderActivityModal) return;
  els.folderActivityModal.classList.add("hidden");
  els.folderActivityModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function isFolderActivityModalOpen(els) {
  return Boolean(els?.folderActivityModal && !els.folderActivityModal.classList.contains("hidden"));
}

export function initFolderActivityModal(els, { onClose, onRefresh } = {}) {
  const handlers = [];

  function on(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    handlers.push(() => target.removeEventListener(eventName, handler));
  }

  on(els.folderActivityModalClose, "click", () => {
    if (typeof onClose === "function") onClose();
  });
  on(els.folderActivityModalBackdrop, "click", () => {
    if (typeof onClose === "function") onClose();
  });
  on(els.folderActivityModalRefresh, "click", () => {
    if (typeof onRefresh === "function") onRefresh();
  });
  on(els.folderActivityModal, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (typeof onClose === "function") onClose();
    }
  });

  return () => {
    handlers.forEach((dispose) => dispose());
  };
}
