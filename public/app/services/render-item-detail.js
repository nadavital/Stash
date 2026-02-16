import { buildNoteTitle } from "./mappers.js";
import {
  iconTypeFor,
  getNoteProcessingState,
  noteTypeIconMarkup,
  relativeTime,
  buildModalSummary,
  buildModalFullExtract,
} from "./note-utils.js";

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/**
 * Renders the full item detail view into the given container.
 *
 * @param {HTMLElement} container  – the #item-detail element
 * @param {object}      note       – the note object to render
 * @param {object}      opts
 * @param {Array}       [opts.relatedNotes]
 * @param {() => void}  opts.onBack
 * @param {(id: string) => void} opts.onNavigate – navigate to another item
 * @param {() => Promise}        opts.onMove
 * @param {() => Promise}        opts.onDelete
 * @param {(text: string) => Promise} opts.onAddComment
 */
export function renderItemDetail(container, note, {
  relatedNotes = [],
  onBack,
  onNavigate,
  onMove,
  onDelete,
  onAddComment,
}) {
  if (!note || !container) return;

  // Clean up previous content
  const loading = container.querySelector(".item-detail-loading");
  if (loading) loading.remove();
  const existing = container.querySelector(".item-detail-content");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.className = "item-detail-content";

  // Back button
  const backRow = document.createElement("div");
  backRow.className = "item-back-row";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "item-back-btn";
  backBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 2 4 8 10 14"/></svg> Back`;
  backBtn.addEventListener("click", () => onBack());
  backRow.appendChild(backBtn);
  wrap.appendChild(backRow);

  // Header
  const header = document.createElement("div");
  header.className = "item-header";

  const noteType = iconTypeFor(note);
  const typeBadge = document.createElement("span");
  typeBadge.className = "item-type-badge";
  typeBadge.dataset.type = noteType;
  typeBadge.innerHTML = `${noteTypeIconMarkup(noteType)} <span>${noteType}</span>`;
  header.appendChild(typeBadge);

  const title = document.createElement("h1");
  title.className = "item-title";
  title.textContent = buildNoteTitle(note);
  header.appendChild(title);

  const metaRow = document.createElement("div");
  metaRow.className = "item-meta-row";

  if (note.project) {
    const folderLink = document.createElement("a");
    folderLink.className = "item-folder-link";
    folderLink.href = `#/folder/${encodeURIComponent(note.project)}`;
    folderLink.textContent = note.project;
    metaRow.appendChild(folderLink);

    const sep = document.createElement("span");
    sep.className = "item-meta-sep";
    sep.textContent = " \u00B7 ";
    metaRow.appendChild(sep);
  }

  const dateEl = document.createElement("span");
  dateEl.className = "item-date";
  dateEl.textContent = relativeTime(note.createdAt);
  dateEl.title = note.createdAt || "";
  metaRow.appendChild(dateEl);

  const processingState = getNoteProcessingState(note);
  if (processingState.showLabel) {
    const sep2 = document.createElement("span");
    sep2.className = "item-meta-sep";
    sep2.textContent = " \u00B7 ";
    metaRow.appendChild(sep2);

    const statusEl = document.createElement("span");
    statusEl.className = `item-status ${processingState.dotClass}`;
    statusEl.textContent = processingState.label;
    metaRow.appendChild(statusEl);
  }

  header.appendChild(metaRow);
  wrap.appendChild(header);

  // Image
  const imagePath = note.imagePath || note.metadata?.ogImage || "";
  if (imagePath) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "item-image-wrap";
    const img = document.createElement("img");
    img.className = "item-image";
    img.src = imagePath;
    img.alt = buildNoteTitle(note);
    img.loading = "lazy";
    img.onerror = () => imgWrap.remove();
    imgWrap.appendChild(img);
    wrap.appendChild(imgWrap);
  }

  // Summary
  const summaryText = buildModalSummary(note);
  if (summaryText) {
    const summaryBlock = document.createElement("div");
    summaryBlock.className = "item-summary";
    summaryBlock.textContent = summaryText;
    wrap.appendChild(summaryBlock);
  }

  // Tags
  const tags = Array.isArray(note.tags) ? note.tags.filter(Boolean) : [];
  if (tags.length) {
    const tagRow = document.createElement("div");
    tagRow.className = "item-tags";
    tags.forEach((tag) => {
      const pill = document.createElement("span");
      pill.className = "item-tag";
      pill.textContent = tag;
      tagRow.appendChild(pill);
    });
    wrap.appendChild(tagRow);
  }

  // Source link
  const sourceUrl = String(note.sourceUrl || "").trim();
  if (sourceUrl) {
    const sourceRow = document.createElement("div");
    sourceRow.className = "item-source";
    const domain = extractDomain(sourceUrl);
    const sourceLink = document.createElement("a");
    sourceLink.className = "item-source-link";
    sourceLink.href = sourceUrl;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    if (domain) {
      sourceLink.innerHTML = `<img class="item-source-favicon" src="https://www.google.com/s2/favicons?sz=16&domain=${encodeURIComponent(domain)}" alt="" width="14" height="14" /> ${domain}`;
    } else {
      sourceLink.textContent = "Open source";
    }
    sourceRow.appendChild(sourceLink);
    wrap.appendChild(sourceRow);
  }

  // Full content
  const fullExtract = buildModalFullExtract(note);
  if (fullExtract) {
    const contentSection = document.createElement("div");
    contentSection.className = "item-full-content";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "item-content-toggle";
    toggle.textContent = "Show full content";

    const pre = document.createElement("pre");
    pre.className = "item-content-pre hidden";
    pre.textContent = fullExtract;

    toggle.addEventListener("click", () => {
      const isHidden = pre.classList.contains("hidden");
      pre.classList.toggle("hidden");
      toggle.textContent = isHidden ? "Hide full content" : "Show full content";
    });

    contentSection.appendChild(toggle);
    contentSection.appendChild(pre);
    wrap.appendChild(contentSection);
  }

  // Related notes
  if (relatedNotes.length) {
    const relatedSection = document.createElement("div");
    relatedSection.className = "item-related";

    const relatedHeading = document.createElement("h3");
    relatedHeading.className = "item-related-heading";
    relatedHeading.textContent = "Related";
    relatedSection.appendChild(relatedHeading);

    const strip = document.createElement("div");
    strip.className = "item-related-strip";

    relatedNotes.forEach((entry) => {
      const rNote = entry.note || entry;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "item-related-card";

      const rTitle = document.createElement("span");
      rTitle.className = "item-related-title";
      rTitle.textContent = buildNoteTitle(rNote);

      const rMeta = document.createElement("span");
      rMeta.className = "item-related-meta";
      rMeta.textContent = rNote.project || iconTypeFor(rNote);

      card.append(rTitle, rMeta);
      card.addEventListener("click", () => onNavigate(rNote.id));
      strip.appendChild(card);
    });

    relatedSection.appendChild(strip);
    wrap.appendChild(relatedSection);
  }

  // Comments
  const comments = Array.isArray(note.metadata?.comments) ? note.metadata.comments : [];
  const commentsSection = document.createElement("div");
  commentsSection.className = "item-comments";

  const commentsHeading = document.createElement("h3");
  commentsHeading.className = "item-comments-heading";
  commentsHeading.textContent = `Comments${comments.length ? ` (${comments.length})` : ""}`;
  commentsSection.appendChild(commentsHeading);

  if (comments.length) {
    const commentsList = document.createElement("div");
    commentsList.className = "item-comments-list";
    comments.forEach((c) => {
      const commentEl = document.createElement("div");
      commentEl.className = "item-comment";
      const commentText = document.createElement("p");
      commentText.className = "item-comment-text";
      commentText.textContent = c.text || "";
      const commentTime = document.createElement("span");
      commentTime.className = "item-comment-time";
      commentTime.textContent = relativeTime(c.createdAt);
      commentEl.append(commentText, commentTime);
      commentsList.appendChild(commentEl);
    });
    commentsSection.appendChild(commentsList);
  }

  // Comment form
  const commentForm = document.createElement("form");
  commentForm.className = "item-comment-form";
  const commentInput = document.createElement("textarea");
  commentInput.className = "item-comment-input";
  commentInput.placeholder = "Add a comment...";
  commentInput.rows = 2;
  const commentSubmit = document.createElement("button");
  commentSubmit.type = "submit";
  commentSubmit.className = "item-comment-submit";
  commentSubmit.textContent = "Comment";
  commentForm.append(commentInput, commentSubmit);
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = commentInput.value.trim();
    if (!text) return;
    await onAddComment(text);
    commentInput.value = "";
  });
  commentsSection.appendChild(commentForm);
  wrap.appendChild(commentsSection);

  // Actions bar
  const actionsBar = document.createElement("div");
  actionsBar.className = "item-actions";

  const moveBtn = document.createElement("button");
  moveBtn.type = "button";
  moveBtn.className = "item-action-btn";
  moveBtn.textContent = "Move";
  moveBtn.addEventListener("click", () => onMove());

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "item-action-btn item-action-btn--danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => onDelete());

  actionsBar.append(moveBtn, deleteBtn);

  if (sourceUrl) {
    const openSourceBtn = document.createElement("a");
    openSourceBtn.className = "item-action-btn";
    openSourceBtn.href = sourceUrl;
    openSourceBtn.target = "_blank";
    openSourceBtn.rel = "noopener noreferrer";
    openSourceBtn.textContent = "Open source";
    actionsBar.appendChild(openSourceBtn);
  }

  wrap.appendChild(actionsBar);
  container.appendChild(wrap);
}
