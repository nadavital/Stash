import { renderIcon } from "../../services/icons.js";

export function renderSaveModalHTML() {
  const closeIcon = renderIcon("close", { size: 14 });
  const attachIcon = renderIcon("attach", { size: 16 });
  return `
    <div id="save-modal" class="save-modal hidden" aria-hidden="true">
      <div id="save-modal-backdrop" class="save-modal-backdrop"></div>
      <article class="save-modal-panel" role="dialog" aria-modal="true">
        <button id="save-modal-close" class="save-modal-close" type="button" aria-label="Close">
          ${closeIcon}
        </button>

        <h3 class="save-modal-heading">New Item</h3>

        <form id="save-modal-form" class="save-modal-form">
          <textarea id="save-modal-content" class="save-modal-textarea" rows="4" placeholder="Paste a link, write a note, or drop a file..." autocomplete="off"></textarea>

          <div class="save-modal-row">
            <select id="save-modal-folder" class="save-modal-select">
              <option value="">No folder</option>
            </select>

            <button id="save-modal-attach-btn" class="save-modal-attach-btn" type="button" aria-label="Attach file">
              ${attachIcon}
            </button>
            <input id="save-modal-file-input" type="file" hidden />
          </div>

          <div id="save-modal-file-pill" class="save-modal-file-pill hidden">
            <span id="save-modal-file-name" class="save-modal-file-name"></span>
            <button id="save-modal-clear-file" class="save-modal-clear-file" type="button" aria-label="Remove file">&times;</button>
          </div>

          <div class="save-modal-actions">
            <button id="save-modal-submit" class="save-modal-submit" type="submit">Save</button>
          </div>
        </form>
      </article>
    </div>
  `;
}

export function querySaveModalEls(root) {
  return {
    saveModal: root.querySelector("#save-modal"),
    saveModalBackdrop: root.querySelector("#save-modal-backdrop"),
    saveModalClose: root.querySelector("#save-modal-close"),
    saveModalForm: root.querySelector("#save-modal-form"),
    saveModalContent: root.querySelector("#save-modal-content"),
    saveModalFolder: root.querySelector("#save-modal-folder"),
    saveModalAttachBtn: root.querySelector("#save-modal-attach-btn"),
    saveModalFileInput: root.querySelector("#save-modal-file-input"),
    saveModalFilePill: root.querySelector("#save-modal-file-pill"),
    saveModalFileName: root.querySelector("#save-modal-file-name"),
    saveModalClearFile: root.querySelector("#save-modal-clear-file"),
    saveModalSubmit: root.querySelector("#save-modal-submit"),
  };
}

export function openSaveModal(els, { folders = [], preselectedFolder = "" } = {}) {
  if (!els.saveModal) return;

  if (els.saveModalContent) els.saveModalContent.value = "";
  if (els.saveModalFileInput) els.saveModalFileInput.value = "";
  if (els.saveModalFileName) els.saveModalFileName.textContent = "";
  els.saveModalFilePill?.classList.add("hidden");

  // Populate folder select
  if (els.saveModalFolder) {
    els.saveModalFolder.innerHTML = '<option value="">No folder</option>';
    const seen = new Set();
    folders.forEach((name) => {
      const n = String(name || "").trim();
      if (!n || seen.has(n.toLowerCase())) return;
      seen.add(n.toLowerCase());
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      els.saveModalFolder.appendChild(opt);
    });
    els.saveModalFolder.value = preselectedFolder || "";
  }

  els.saveModal.classList.remove("hidden");
  els.saveModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.saveModalContent?.focus();
}

export function closeSaveModal(els) {
  if (!els.saveModal) return;
  els.saveModal.classList.add("hidden");
  els.saveModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function initSaveModalHandlers(els, { onClose, onSubmit }) {
  const handlers = [];
  let attachment = { name: "", fileDataUrl: null, fileMimeType: "", isImage: false };

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  function clearAttachment() {
    attachment = { name: "", fileDataUrl: null, fileMimeType: "", isImage: false };
    if (els.saveModalFileInput) els.saveModalFileInput.value = "";
    if (els.saveModalFileName) els.saveModalFileName.textContent = "";
    els.saveModalFilePill?.classList.add("hidden");
  }

  function setAttachment(name, dataUrl, mimeType) {
    const normalizedMime = String(mimeType || "").toLowerCase();
    attachment = {
      name,
      fileDataUrl: dataUrl,
      fileMimeType: normalizedMime,
      isImage: normalizedMime.startsWith("image/"),
    };
    if (els.saveModalFileName) els.saveModalFileName.textContent = name;
    els.saveModalFilePill?.classList.remove("hidden");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  addHandler(els.saveModalClose, "click", () => {
    clearAttachment();
    onClose();
  });
  addHandler(els.saveModalBackdrop, "click", () => {
    clearAttachment();
    onClose();
  });

  addHandler(els.saveModalAttachBtn, "click", () => {
    els.saveModalFileInput?.click();
  });

  addHandler(els.saveModalFileInput, "change", async () => {
    const file = els.saveModalFileInput?.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setAttachment(file.name || "file", dataUrl, file.type || "");
    } catch {
      clearAttachment();
    }
  });

  addHandler(els.saveModalClearFile, "click", () => {
    clearAttachment();
  });

  // Drag-and-drop on the modal panel
  const panel = els.saveModal?.querySelector(".save-modal-panel");
  if (panel) {
    addHandler(panel, "dragover", (e) => {
      e.preventDefault();
      panel.classList.add("drag-active");
    });
    addHandler(panel, "dragleave", (e) => {
      if (!panel.contains(e.relatedTarget)) {
        panel.classList.remove("drag-active");
      }
    });
    addHandler(panel, "drop", async (e) => {
      e.preventDefault();
      panel.classList.remove("drag-active");
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file);
        setAttachment(file.name || "file", dataUrl, file.type || "");
      } catch {
        // ignore
      }
    });
  }

  addHandler(els.saveModalForm, "submit", (e) => {
    e.preventDefault();
    const content = (els.saveModalContent?.value || "").trim();
    const project = (els.saveModalFolder?.value || "").trim();

    if (!content && !attachment.fileDataUrl) {
      els.saveModalContent?.focus();
      return;
    }

    onSubmit({
      content,
      project,
      attachment: { ...attachment },
    });
    clearAttachment();
  });

  return () => handlers.forEach((fn) => fn());
}
