import { buildNoteTitle } from "../../services/mappers.js";
import {
  compactInlineText,
  buildModalSummary,
  buildModalFullExtract,
} from "../../services/note-utils.js";
import { renderIcon } from "../../services/icons.js";

let currentNote = null;

export function renderItemModalHTML() {
  const editIcon = renderIcon("edit", { size: 14 });
  const closeIcon = renderIcon("close", { size: 12 });
  return `
    <div id="item-modal" class="item-modal hidden" aria-hidden="true">
      <div id="item-modal-backdrop" class="item-modal-backdrop"></div>
      <article class="item-modal-panel" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
        <div class="item-modal-header">
          <p id="item-modal-project" class="item-modal-project"></p>
          <button id="item-modal-edit-btn" class="item-modal-edit-btn" type="button" aria-label="Edit">
            ${editIcon}
          </button>
          <button id="item-modal-close" class="item-modal-close" type="button" aria-label="Close">
            ${closeIcon}
          </button>
        </div>
        <div class="item-modal-body">
          <h3 id="item-modal-title" class="item-modal-title"></h3>
          <div id="item-modal-content" class="item-modal-content"></div>
          <div id="item-modal-quick-actions" class="item-modal-quick-actions">
            <button id="item-modal-chat-about-btn" class="item-modal-quick-action" type="button">Chat about this item</button>
            <a id="item-modal-open-source" class="item-modal-quick-action hidden" href="#" target="_blank" rel="noopener noreferrer">Open original</a>
            <button id="item-modal-copy-source" class="item-modal-quick-action hidden" type="button">Copy link</button>
          </div>
          <img id="item-modal-image" class="item-modal-image hidden" alt="Item preview" />
          <button id="item-modal-toggle" class="item-modal-toggle hidden" type="button" aria-expanded="false">Show full text</button>
          <pre id="item-modal-full-content" class="item-modal-full-content hidden"></pre>
          <section class="item-modal-comments" aria-label="Comments">
            <p class="item-modal-comments-title">Context comments</p>
            <div id="item-modal-comments-list" class="item-modal-comments-list"></div>
            <form id="item-modal-comment-form" class="item-modal-comment-form">
              <textarea
                id="item-modal-comment-input"
                class="item-modal-comment-input"
                rows="2"
                maxlength="2000"
                placeholder="Add context, decisions, or follow-ups..."
              ></textarea>
              <button id="item-modal-comment-submit" class="item-modal-comment-submit" type="submit">Add comment</button>
            </form>
          </section>
        </div>
        <form id="item-modal-edit-form" class="item-modal-edit-form hidden">
          <label class="item-modal-edit-label">Content
            <textarea id="item-modal-edit-content" class="item-modal-edit-textarea" rows="5"></textarea>
          </label>
          <label class="item-modal-edit-label">Tags (comma-separated)
            <input id="item-modal-edit-tags" class="item-modal-edit-input" type="text" placeholder="tag1, tag2" />
          </label>
          <label class="item-modal-edit-label">Folder
            <input id="item-modal-edit-project" class="item-modal-edit-input" type="text" placeholder="Project name" />
          </label>
          <div class="item-modal-edit-actions">
            <button id="item-modal-edit-cancel" class="item-modal-action-btn item-modal-cancel-btn" type="button">Cancel</button>
            <button id="item-modal-edit-save" class="item-modal-action-btn item-modal-save-btn" type="submit">Save</button>
          </div>
        </form>
      </article>
    </div>
  `;
}

export function queryItemModalEls(root) {
  return {
    itemModal: root.querySelector("#item-modal"),
    itemModalBackdrop: root.querySelector("#item-modal-backdrop"),
    itemModalClose: root.querySelector("#item-modal-close"),
    itemModalProject: root.querySelector("#item-modal-project"),
    itemModalTitle: root.querySelector("#item-modal-title"),
    itemModalContent: root.querySelector("#item-modal-content"),
    itemModalToggle: root.querySelector("#item-modal-toggle"),
    itemModalFullContent: root.querySelector("#item-modal-full-content"),
    itemModalImage: root.querySelector("#item-modal-image"),
    itemModalQuickActions: root.querySelector("#item-modal-quick-actions"),
    itemModalChatAboutBtn: root.querySelector("#item-modal-chat-about-btn"),
    itemModalOpenSource: root.querySelector("#item-modal-open-source"),
    itemModalCopySource: root.querySelector("#item-modal-copy-source"),
    itemModalCommentsList: root.querySelector("#item-modal-comments-list"),
    itemModalCommentForm: root.querySelector("#item-modal-comment-form"),
    itemModalCommentInput: root.querySelector("#item-modal-comment-input"),
    itemModalCommentSubmit: root.querySelector("#item-modal-comment-submit"),
    itemModalEditBtn: root.querySelector("#item-modal-edit-btn"),
    itemModalEditForm: root.querySelector("#item-modal-edit-form"),
    itemModalEditContent: root.querySelector("#item-modal-edit-content"),
    itemModalEditTags: root.querySelector("#item-modal-edit-tags"),
    itemModalEditProject: root.querySelector("#item-modal-edit-project"),
    itemModalEditCancel: root.querySelector("#item-modal-edit-cancel"),
    itemModalEditSave: root.querySelector("#item-modal-edit-save"),
  };
}

function exitEditMode(els) {
  if (!els.itemModal) return;
  els.itemModal.classList.remove("item-modal--editing");
  if (els.itemModalEditForm) els.itemModalEditForm.classList.add("hidden");
}

function enterEditMode(els) {
  if (!els.itemModal || !currentNote) return;
  els.itemModal.classList.add("item-modal--editing");
  if (els.itemModalEditForm) els.itemModalEditForm.classList.remove("hidden");
  if (els.itemModalEditContent) els.itemModalEditContent.value = currentNote.content || "";
  if (els.itemModalEditTags) els.itemModalEditTags.value = (currentNote.tags || []).join(", ");
  if (els.itemModalEditProject) els.itemModalEditProject.value = currentNote.project || "";
  els.itemModalEditContent?.focus();
}

function normalizeModalComments(note) {
  return (Array.isArray(note?.metadata?.comments) ? note.metadata.comments : [])
    .map((entry) => ({
      text: String(entry?.text || "").trim(),
      createdAt: String(entry?.createdAt || "").trim(),
    }))
    .filter((entry) => entry.text);
}

function commentTimeLabel(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderComments(els, note) {
  if (!els.itemModalCommentsList) return;
  const comments = normalizeModalComments(note);
  els.itemModalCommentsList.innerHTML = "";

  if (!comments.length) {
    const empty = document.createElement("p");
    empty.className = "item-modal-comments-empty";
    empty.textContent = "No comments yet.";
    els.itemModalCommentsList.appendChild(empty);
    return;
  }

  comments
    .slice()
    .reverse()
    .forEach((comment) => {
      const item = document.createElement("article");
      item.className = "item-modal-comment-item";

      const text = document.createElement("p");
      text.className = "item-modal-comment-text";
      text.textContent = comment.text;

      const meta = document.createElement("p");
      meta.className = "item-modal-comment-meta";
      meta.textContent = commentTimeLabel(comment.createdAt) || "Just now";

      item.append(text, meta);
      els.itemModalCommentsList.appendChild(item);
    });
}

export function openItemModal(els, note) {
  if (!els.itemModal || !note) return;
  currentNote = note;

  exitEditMode(els);

  els.itemModalTitle.textContent = buildNoteTitle(note);
  const projectParts = [note.project || "General"];
  if (note.fileName) {
    projectParts.push(note.fileName);
  }
  els.itemModalProject.textContent = projectParts.join(" \u2022 ");
  const summaryText = buildModalSummary(note);
  els.itemModalContent.textContent = summaryText || "No AI description available yet.";
  renderComments(els, note);

  const sourceUrl = String(note.sourceUrl || "").trim();
  if (els.itemModalOpenSource) {
    els.itemModalOpenSource.classList.toggle("hidden", !sourceUrl);
    if (sourceUrl) {
      els.itemModalOpenSource.href = sourceUrl;
    } else {
      els.itemModalOpenSource.removeAttribute("href");
    }
  }
  if (els.itemModalCopySource) {
    els.itemModalCopySource.classList.toggle("hidden", !sourceUrl);
  }

  const fullExtract = buildModalFullExtract(note);
  const hasDistinctFull =
    fullExtract &&
    compactInlineText(fullExtract) !== compactInlineText(summaryText) &&
    fullExtract.length > 60;

  if (els.itemModalToggle && els.itemModalFullContent) {
    els.itemModalToggle.classList.toggle("hidden", !hasDistinctFull);
    els.itemModalFullContent.classList.add("hidden");
    els.itemModalToggle.textContent = "Show full extracted text";
    els.itemModalToggle.setAttribute("aria-expanded", "false");
    els.itemModalFullContent.textContent = hasDistinctFull ? fullExtract : "";
    els.itemModalToggle.onclick = hasDistinctFull
      ? () => {
          const expanded = els.itemModalToggle.getAttribute("aria-expanded") === "true";
          const nextExpanded = !expanded;
          els.itemModalToggle.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
          els.itemModalToggle.textContent = nextExpanded ? "Hide full extracted text" : "Show full extracted text";
          els.itemModalFullContent.classList.toggle("hidden", !nextExpanded);
        }
      : null;
  }

  if (note.imagePath) {
    els.itemModalImage.src = note.imagePath;
    els.itemModalImage.classList.remove("hidden");
  } else {
    els.itemModalImage.src = "";
    els.itemModalImage.classList.add("hidden");
  }

  els.itemModal.classList.remove("hidden");
  els.itemModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

export function closeItemModal(els) {
  if (!els.itemModal) return;
  currentNote = null;
  exitEditMode(els);
  if (els.itemModalToggle && els.itemModalFullContent) {
    els.itemModalToggle.classList.add("hidden");
    els.itemModalToggle.textContent = "Show full extracted text";
    els.itemModalToggle.setAttribute("aria-expanded", "false");
    els.itemModalToggle.onclick = null;
    els.itemModalFullContent.classList.add("hidden");
    els.itemModalFullContent.textContent = "";
  }
  if (els.itemModalCommentInput) {
    els.itemModalCommentInput.value = "";
  }
  els.itemModal.classList.add("hidden");
  els.itemModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function getCurrentNote() {
  return currentNote;
}

export function initItemModalHandlers(els, { onClose, onSave, onAddComment, onChatAbout }) {
  const handlers = [];

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  addHandler(els.itemModalClose, "click", () => onClose());
  addHandler(els.itemModalBackdrop, "click", () => onClose());

  addHandler(els.itemModalEditBtn, "click", () => {
    enterEditMode(els);
  });

  addHandler(els.itemModalEditCancel, "click", () => {
    exitEditMode(els);
  });

  addHandler(els.itemModalChatAboutBtn, "click", () => {
    if (!currentNote || !onChatAbout) return;
    onChatAbout(currentNote);
  });

  addHandler(els.itemModalCopySource, "click", async () => {
    const sourceUrl = String(currentNote?.sourceUrl || "").trim();
    if (!sourceUrl || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(sourceUrl);
    } catch {
      // no-op
    }
  });

  addHandler(els.itemModalCommentForm, "submit", async (event) => {
    event.preventDefault();
    if (!currentNote || !onAddComment || !els.itemModalCommentInput || !els.itemModalCommentSubmit) return;
    const text = String(els.itemModalCommentInput.value || "").trim();
    if (!text) {
      els.itemModalCommentInput.focus();
      return;
    }
    els.itemModalCommentInput.disabled = true;
    els.itemModalCommentSubmit.disabled = true;
    try {
      const updated = await onAddComment(currentNote.id, text, currentNote);
      if (updated) {
        currentNote = updated;
      } else {
        const existingComments = Array.isArray(currentNote.metadata?.comments) ? currentNote.metadata.comments : [];
        currentNote = {
          ...currentNote,
          metadata: {
            ...(currentNote.metadata || {}),
            comments: [
              ...existingComments,
              {
                text,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        };
      }
      els.itemModalCommentInput.value = "";
      renderComments(els, currentNote);
    } catch {
      // error feedback is handled by page-level callback
    } finally {
      els.itemModalCommentInput.disabled = false;
      els.itemModalCommentSubmit.disabled = false;
      els.itemModalCommentInput.focus();
    }
  });

  addHandler(els.itemModalEditForm, "submit", (e) => {
    e.preventDefault();
    if (!currentNote || !onSave) return;
    const payload = {
      content: (els.itemModalEditContent?.value || "").trim(),
      tags: (els.itemModalEditTags?.value || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      project: (els.itemModalEditProject?.value || "").trim(),
    };
    onSave(currentNote.id, payload);
  });

  return () => handlers.forEach((dispose) => dispose());
}
