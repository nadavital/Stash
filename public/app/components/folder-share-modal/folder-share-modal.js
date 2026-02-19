function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderFolderShareModalHTML() {
  return `
    <div id="folder-share-modal" class="folder-share-modal hidden" role="dialog" aria-modal="true" aria-labelledby="folder-share-title">
      <div class="folder-share-modal-card">
        <header class="folder-share-modal-head">
          <div>
            <h2 id="folder-share-title" class="folder-share-modal-title">Share Folder</h2>
            <p id="folder-share-folder-name" class="folder-share-modal-subtitle"></p>
          </div>
          <button id="folder-share-close-btn" class="folder-share-close-btn" type="button" aria-label="Close share dialog">Close</button>
        </header>

        <form id="folder-share-form" class="folder-share-form">
          <label class="folder-share-label" for="folder-share-user-select">Workspace member</label>
          <select id="folder-share-user-select" class="folder-share-select" required></select>

          <label class="folder-share-label" for="folder-share-role-select">Access level</label>
          <select id="folder-share-role-select" class="folder-share-select" required>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="manager">Manager</option>
          </select>

          <p id="folder-share-error" class="folder-share-error hidden" role="alert"></p>

          <div class="folder-share-actions">
            <button id="folder-share-submit-btn" class="folder-share-submit-btn" type="submit">Save Access</button>
          </div>
        </form>

        <section class="folder-share-members">
          <h3 class="folder-share-members-title">Collaborators</h3>
          <ul id="folder-share-members-list" class="folder-share-members-list"></ul>
          <p id="folder-share-members-empty" class="folder-share-members-empty">No collaborators yet.</p>
        </section>
      </div>
    </div>
  `;
}

export function queryFolderShareModalEls(root) {
  return {
    folderShareModal: root.querySelector("#folder-share-modal"),
    folderShareCloseBtn: root.querySelector("#folder-share-close-btn"),
    folderShareFolderName: root.querySelector("#folder-share-folder-name"),
    folderShareForm: root.querySelector("#folder-share-form"),
    folderShareUserSelect: root.querySelector("#folder-share-user-select"),
    folderShareRoleSelect: root.querySelector("#folder-share-role-select"),
    folderShareError: root.querySelector("#folder-share-error"),
    folderShareSubmitBtn: root.querySelector("#folder-share-submit-btn"),
    folderShareMembersList: root.querySelector("#folder-share-members-list"),
    folderShareMembersEmpty: root.querySelector("#folder-share-members-empty"),
  };
}

export function initFolderShareModal(
  els,
  { onClose, onSubmit, onRemove, onSelectMember } = {}
) {
  const handlers = [];

  function on(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    handlers.push(() => target.removeEventListener(eventName, handler));
  }

  on(els.folderShareCloseBtn, "click", () => {
    if (typeof onClose === "function") onClose();
  });

  on(els.folderShareModal, "click", (event) => {
    if (event.target === els.folderShareModal && typeof onClose === "function") {
      onClose();
    }
  });

  on(els.folderShareForm, "submit", (event) => {
    event.preventDefault();
    if (typeof onSubmit === "function") {
      onSubmit({
        userId: String(els.folderShareUserSelect?.value || "").trim(),
        role: String(els.folderShareRoleSelect?.value || "viewer").trim(),
      });
    }
  });

  on(els.folderShareUserSelect, "change", () => {
    if (typeof onSelectMember === "function") {
      onSelectMember(String(els.folderShareUserSelect?.value || "").trim());
    }
  });

  on(els.folderShareMembersList, "click", (event) => {
    const button = event.target.closest("[data-share-remove-user-id]");
    if (!button) return;
    const userId = String(button.getAttribute("data-share-remove-user-id") || "").trim();
    if (!userId || typeof onRemove !== "function") return;
    onRemove(userId);
  });

  return () => {
    handlers.forEach((dispose) => dispose());
  };
}

export function setFolderShareModalFolderName(els, folderName = "") {
  if (!els?.folderShareFolderName) return;
  const normalized = String(folderName || "").trim();
  els.folderShareFolderName.textContent = normalized ? `Folder: ${normalized}` : "";
}

export function setFolderShareModalMembers(els, members = [], selectedUserId = "") {
  const select = els?.folderShareUserSelect;
  if (!select) return;
  const normalizedSelected = String(selectedUserId || "").trim();
  const items = Array.isArray(members) ? members : [];
  select.innerHTML = "";
  for (const member of items) {
    const option = document.createElement("option");
    option.value = String(member?.userId || "").trim();
    const name = String(member?.name || "").trim() || String(member?.email || "").trim() || option.value;
    const role = String(member?.role || "member").trim();
    option.textContent = `${name} (${role})`;
    if (option.value && option.value === normalizedSelected) {
      option.selected = true;
    }
    select.appendChild(option);
  }
}

export function setFolderShareModalCollaborators(els, collaborators = []) {
  const list = els?.folderShareMembersList;
  const empty = els?.folderShareMembersEmpty;
  if (!list || !empty) return;
  const items = Array.isArray(collaborators) ? collaborators : [];
  list.innerHTML = "";
  for (const entry of items) {
    const userId = String(entry?.userId || "").trim();
    if (!userId) continue;
    const li = document.createElement("li");
    li.className = "folder-share-member-item";
    const name = escapeHtml(String(entry?.userName || "").trim() || String(entry?.userEmail || "").trim() || userId);
    const role = escapeHtml(String(entry?.role || "viewer").trim());
    li.innerHTML = `
      <div class="folder-share-member-meta">
        <span class="folder-share-member-name">${name}</span>
        <span class="folder-share-member-role">${role}</span>
      </div>
      <button
        type="button"
        class="folder-share-remove-btn"
        data-share-remove-user-id="${escapeHtml(userId)}"
        aria-label="Remove access for ${name}"
      >
        Remove
      </button>
    `;
    list.appendChild(li);
  }
  empty.classList.toggle("hidden", items.length > 0);
}

export function setFolderShareModalError(els, message = "") {
  const errorEl = els?.folderShareError;
  if (!errorEl) return;
  const normalized = String(message || "").trim();
  errorEl.textContent = normalized;
  errorEl.classList.toggle("hidden", !normalized);
}

export function setFolderShareModalBusy(els, busy = false) {
  const isBusy = Boolean(busy);
  if (els?.folderShareSubmitBtn) {
    els.folderShareSubmitBtn.disabled = isBusy;
    els.folderShareSubmitBtn.textContent = isBusy ? "Saving..." : "Save Access";
  }
  if (els?.folderShareUserSelect) {
    els.folderShareUserSelect.disabled = isBusy;
  }
  if (els?.folderShareRoleSelect) {
    els.folderShareRoleSelect.disabled = isBusy;
  }
}
