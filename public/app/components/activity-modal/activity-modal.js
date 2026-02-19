import { renderMarkdownInto } from "../../services/markdown.js";
import { renderIcon } from "../../services/icons.js";
import { relativeTime } from "../../services/note-utils.js";

let currentEntries = [];

function setEntries(entries) {
  currentEntries = Array.isArray(entries) ? entries.slice() : [];
}

function entryTypeLabel(entry) {
  if (entry?.type === "comment") return "Comment";
  if (entry?.type === "enrichment") return "AI enriched";
  return "Edited";
}

function entryIcon(entry) {
  if (entry?.type === "comment") return renderIcon("activity-comment", { size: 14 });
  if (entry?.type === "enrichment") return renderIcon("activity-enrichment", { size: 14 });
  return renderIcon("activity-edit", { size: 14 });
}

function renderFeed(els) {
  if (!els.activityModalFeed) return;
  els.activityModalFeed.innerHTML = "";

  if (!currentEntries.length) {
    const empty = document.createElement("p");
    empty.className = "activity-modal-empty";
    empty.textContent = "No activity yet.";
    els.activityModalFeed.appendChild(empty);
    return;
  }

  currentEntries.forEach((entry, index) => {
    const row = document.createElement("article");
    row.className = "activity-modal-entry";
    row.dataset.index = String(index);

    const iconWrap = document.createElement("div");
    iconWrap.className = `activity-modal-icon activity-modal-icon--${entry.type || "edit"}`;
    iconWrap.innerHTML = entryIcon(entry);

    const body = document.createElement("div");
    body.className = "activity-modal-body";

    const meta = document.createElement("p");
    meta.className = "activity-modal-meta";
    const typeStrong = document.createElement("strong");
    typeStrong.textContent = entryTypeLabel(entry);
    meta.append(
      typeStrong,
      document.createTextNode(` \u00B7 ${String(entry.actor || "Unknown")} \u00B7 ${relativeTime(entry.createdAt)}`)
    );
    body.appendChild(meta);

    const text = document.createElement("p");
    text.className = "activity-modal-text";
    if (entry.type === "comment") {
      text.textContent = String(entry.text || "");
    } else if (entry.type === "edit") {
      text.textContent = String(entry.changeSummary || "Edited");
    } else {
      text.textContent = "AI enriched this item.";
    }
    body.appendChild(text);

    if (entry.type === "edit") {
      const actions = document.createElement("div");
      actions.className = "activity-modal-actions";

      const previewBtn = document.createElement("button");
      previewBtn.type = "button";
      previewBtn.className = "item-action-btn";
      previewBtn.dataset.action = "preview";
      previewBtn.dataset.index = String(index);
      previewBtn.textContent = "Preview";

      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "item-action-btn item-action-btn--primary";
      restoreBtn.dataset.action = "restore";
      restoreBtn.dataset.index = String(index);
      restoreBtn.textContent = "Restore";

      const preview = document.createElement("div");
      preview.className = "activity-modal-preview hidden markdown-body";
      preview.dataset.index = String(index);

      actions.append(previewBtn, restoreBtn);
      body.append(actions, preview);
    }

    row.append(iconWrap, body);
    els.activityModalFeed.appendChild(row);
  });
}

export function renderActivityModalHTML() {
  const closeIcon = renderIcon("close", { size: 14 });
  return `
    <div id="activity-modal" class="activity-modal hidden" aria-hidden="true">
      <div id="activity-modal-backdrop" class="activity-modal-backdrop"></div>
      <article class="activity-modal-panel" role="dialog" aria-modal="true" aria-labelledby="activity-modal-heading">
        <div class="activity-modal-head">
          <h3 id="activity-modal-heading" class="activity-modal-heading">Activity</h3>
          <button id="activity-modal-close" class="activity-modal-close" type="button" aria-label="Close">
            ${closeIcon}
          </button>
        </div>
        <div id="activity-modal-feed" class="activity-modal-feed"></div>
        <form id="activity-modal-comment-form" class="activity-modal-comment-form">
          <label class="visually-hidden" for="activity-modal-comment-input">Add comment</label>
          <textarea
            id="activity-modal-comment-input"
            class="activity-modal-comment-input"
            rows="2"
            maxlength="2000"
            placeholder="Add a comment..."
          ></textarea>
          <button id="activity-modal-comment-submit" class="activity-modal-comment-submit" type="submit">Comment</button>
        </form>
      </article>
    </div>
  `;
}

export function queryActivityModalEls(root) {
  return {
    activityModal: root.querySelector("#activity-modal"),
    activityModalBackdrop: root.querySelector("#activity-modal-backdrop"),
    activityModalClose: root.querySelector("#activity-modal-close"),
    activityModalHeading: root.querySelector("#activity-modal-heading"),
    activityModalFeed: root.querySelector("#activity-modal-feed"),
    activityModalCommentForm: root.querySelector("#activity-modal-comment-form"),
    activityModalCommentInput: root.querySelector("#activity-modal-comment-input"),
    activityModalCommentSubmit: root.querySelector("#activity-modal-comment-submit"),
  };
}

export function openActivityModal(els, { title = "Activity", entries = [] } = {}) {
  if (!els.activityModal) return;
  setEntries(entries);
  if (els.activityModalHeading) {
    els.activityModalHeading.textContent = title;
  }
  renderFeed(els);
  if (els.activityModalCommentInput) {
    els.activityModalCommentInput.value = "";
  }
  els.activityModal.classList.remove("hidden");
  els.activityModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

export function closeActivityModal(els) {
  if (!els.activityModal) return;
  els.activityModal.classList.add("hidden");
  els.activityModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

export function initActivityModalHandlers(els, { onClose, onRestoreVersion, onAddComment } = {}) {
  const handlers = [];

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  addHandler(els.activityModalClose, "click", () => onClose?.());
  addHandler(els.activityModalBackdrop, "click", () => onClose?.());
  addHandler(els.activityModal, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
    }
  });

  addHandler(els.activityModalFeed, "click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button[data-action]");
    if (!(button instanceof HTMLButtonElement)) return;
    const action = String(button.dataset.action || "");
    const index = Number(button.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= currentEntries.length) return;
    const entry = currentEntries[index];

    if (action === "preview") {
      const previewEl = els.activityModalFeed?.querySelector(`.activity-modal-preview[data-index="${index}"]`);
      if (!(previewEl instanceof HTMLElement)) return;
      const isHidden = previewEl.classList.contains("hidden");
      if (!isHidden) {
        previewEl.classList.add("hidden");
        previewEl.innerHTML = "";
        button.textContent = "Preview";
        return;
      }
      const previewText = String(entry.content || "");
      const displayText = previewText.length > 800 ? `${previewText.slice(0, 800)}...` : previewText;
      renderMarkdownInto(previewEl, displayText);
      previewEl.classList.remove("hidden");
      button.textContent = "Hide preview";
      return;
    }

    if (action === "restore") {
      const versionNumber = entry.versionNumber;
      if (!versionNumber || typeof onRestoreVersion !== "function") return;
      if (!window.confirm(`Restore to version ${versionNumber}? Current state will be saved as a new version.`)) return;
      button.disabled = true;
      button.textContent = "Restoring...";
      try {
        const result = await onRestoreVersion(versionNumber);
        if (result?.entries) {
          setEntries(result.entries);
          renderFeed(els);
        }
      } finally {
        button.disabled = false;
        button.textContent = "Restore";
      }
    }
  });

  addHandler(els.activityModalCommentForm, "submit", async (event) => {
    event.preventDefault();
    if (typeof onAddComment !== "function" || !els.activityModalCommentInput || !els.activityModalCommentSubmit) return;
    const text = String(els.activityModalCommentInput.value || "").trim();
    if (!text) return;
    els.activityModalCommentInput.disabled = true;
    els.activityModalCommentSubmit.disabled = true;
    try {
      const result = await onAddComment(text);
      els.activityModalCommentInput.value = "";
      if (result?.entries) {
        setEntries(result.entries);
        renderFeed(els);
      }
    } finally {
      els.activityModalCommentInput.disabled = false;
      els.activityModalCommentSubmit.disabled = false;
      els.activityModalCommentInput.focus();
    }
  });

  return () => handlers.forEach((dispose) => dispose());
}
