import { buildNoteTitle } from "./mappers.js";
import {
  iconTypeFor,
  getNoteProcessingState,
  noteTypeIconMarkup,
  relativeTime,
  buildModalSummary,
  buildModalFullExtract,
} from "./note-utils.js";
import { renderMarkdownInto } from "./markdown.js";
import { createMarkdownEditor } from "../components/markdown-editor/markdown-editor.js";

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
 * @param {Array}       [opts.versions]       – pre-fetched version history
 * @param {HTMLElement}  [opts.actionsBar]     – external actions bar element (for edit mode show/hide)
 * @param {(id: string) => void} opts.onNavigate – navigate to another item
 * @param {(text: string) => Promise} opts.onAddComment
 * @param {(payload) => Promise}      opts.onEdit
 * @param {(versionNumber) => Promise} opts.onRestoreVersion
 */
export function renderItemDetail(container, note, {
  relatedNotes = [],
  versions = [],
  actionsBar: externalActionsBar = null,
  onNavigate,
  onAddComment,
  onEdit,
  onFetchVersions,
  onRestoreVersion,
}) {
  if (!note || !container) return;

  // Clean up previous content
  const loading = container.querySelector(".item-detail-loading");
  if (loading) loading.remove();
  const existing = container.querySelector(".item-detail-content");
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.className = "item-detail-content";

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

  // Show "edited" indicator if updated significantly after creation
  const createdMs = note.createdAt ? new Date(note.createdAt).getTime() : 0;
  const updatedMs = note.updatedAt ? new Date(note.updatedAt).getTime() : 0;
  if (updatedMs && createdMs && (updatedMs - createdMs) > 60000) {
    const editSep = document.createElement("span");
    editSep.className = "item-meta-sep";
    editSep.textContent = " \u00B7 ";
    metaRow.appendChild(editSep);

    const editedEl = document.createElement("span");
    editedEl.className = "item-date";
    editedEl.textContent = `edited ${relativeTime(note.updatedAt)}`;
    editedEl.title = note.updatedAt || "";
    metaRow.appendChild(editedEl);
  }

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

  // Summary (hoisted so edit handler can show/hide)
  let summaryBlock = null;
  const summaryText = buildModalSummary(note);
  if (summaryText) {
    summaryBlock = document.createElement("div");
    summaryBlock.className = "item-summary";
    summaryBlock.textContent = summaryText;
    wrap.appendChild(summaryBlock);
  }

  // Tags (hoisted)
  let tagRow = null;
  const tags = Array.isArray(note.tags) ? note.tags.filter(Boolean) : [];
  if (tags.length) {
    tagRow = document.createElement("div");
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
      sourceLink.textContent = "Open link";
    }
    sourceRow.appendChild(sourceLink);
    wrap.appendChild(sourceRow);
  }

  // Full content (hoisted) — rendered as markdown
  let contentSection = null;
  const fullExtract = buildModalFullExtract(note);
  if (fullExtract) {
    contentSection = document.createElement("div");
    contentSection.className = "item-full-content";

    const contentBody = document.createElement("div");
    contentBody.className = "item-content-body";
    renderMarkdownInto(contentBody, fullExtract);

    contentSection.appendChild(contentBody);
    wrap.appendChild(contentSection);
  }

  // Edit form (hidden by default) — references to sections we need to toggle
  let editForm = null;
  let relatedSection = null;
  let activitySection = null;
  let mdEditor = null;
  const actionsBar = externalActionsBar;

  if (onEdit) {
    editForm = document.createElement("div");
    editForm.className = "item-edit-form hidden";

    const contentLabel = document.createElement("label");
    contentLabel.className = "item-edit-label";
    contentLabel.textContent = "Content";

    mdEditor = createMarkdownEditor(note.content || "");

    const editRow = document.createElement("div");
    editRow.className = "item-edit-row";

    const tagsGroup = document.createElement("div");
    tagsGroup.className = "item-edit-group";
    const tagsLabel = document.createElement("label");
    tagsLabel.className = "item-edit-label";
    tagsLabel.textContent = "Tags (comma-separated)";
    const tagsInput = document.createElement("input");
    tagsInput.type = "text";
    tagsInput.className = "item-edit-input";
    tagsInput.value = tags.join(", ");
    tagsGroup.append(tagsLabel, tagsInput);

    const projectGroup = document.createElement("div");
    projectGroup.className = "item-edit-group";
    const projectLabel = document.createElement("label");
    projectLabel.className = "item-edit-label";
    projectLabel.textContent = "Project";
    const projectInput = document.createElement("input");
    projectInput.type = "text";
    projectInput.className = "item-edit-input";
    projectInput.value = note.project || "";
    projectGroup.append(projectLabel, projectInput);

    editRow.append(tagsGroup, projectGroup);

    const editActions = document.createElement("div");
    editActions.className = "item-edit-actions";

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "item-action-btn item-action-btn--primary";
    doneBtn.textContent = "Save";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "item-action-btn";
    cancelBtn.textContent = "Cancel";

    function exitEditMode() {
      editForm.classList.add("hidden");
      if (summaryBlock) summaryBlock.classList.remove("hidden");
      if (tagRow) tagRow.classList.remove("hidden");
      if (contentSection) contentSection.classList.remove("hidden");
      if (relatedSection) relatedSection.classList.remove("hidden");
      if (activitySection) activitySection.classList.remove("hidden");
      if (actionsBar) actionsBar.classList.remove("hidden");
    }

    cancelBtn.addEventListener("click", exitEditMode);

    async function submitEdit() {
      doneBtn.disabled = true;
      doneBtn.textContent = "Saving...";
      const parsedTags = tagsInput.value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await onEdit({
        content: mdEditor.getValue(),
        tags: parsedTags,
        project: projectInput.value.trim(),
      });
    }

    doneBtn.addEventListener("click", submitEdit);

    // Cmd/Ctrl+Enter to save, Esc to cancel
    editForm.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitEdit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        exitEditMode();
      }
    });

    editActions.append(doneBtn, cancelBtn);
    editForm.append(contentLabel, mdEditor.element, editRow, editActions);
    wrap.appendChild(editForm);
  }

  // Related notes
  if (relatedNotes.length) {
    relatedSection = document.createElement("div");
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

  // ── Activity Timeline (unified comments + version history) ──
  const comments = Array.isArray(note.metadata?.comments) ? note.metadata.comments : [];

  const timelineEntries = [];

  comments.forEach((c) => {
    timelineEntries.push({
      type: "comment",
      text: c.text || "",
      actor: c.actor || "You",
      createdAt: c.createdAt,
      ts: c.createdAt ? new Date(c.createdAt).getTime() : 0,
    });
  });

  versions.forEach((v) => {
    timelineEntries.push({
      type: "edit",
      changeSummary: v.changeSummary || "Edited",
      actor: v.actorUserId || "Unknown",
      createdAt: v.createdAt,
      ts: v.createdAt ? new Date(v.createdAt).getTime() : 0,
      versionNumber: v.versionNumber,
      content: v.content,
    });
  });

  timelineEntries.sort((a, b) => b.ts - a.ts);

  activitySection = document.createElement("div");
  activitySection.className = "item-activity";

  const activityHeading = document.createElement("h3");
  activityHeading.className = "item-activity-heading";
  activityHeading.textContent = `Activity${timelineEntries.length ? ` (${timelineEntries.length})` : ""}`;
  activitySection.appendChild(activityHeading);

  if (timelineEntries.length) {
    const feed = document.createElement("div");
    feed.className = "item-activity-feed";

    timelineEntries.forEach((entry) => {
      const entryEl = document.createElement("div");
      entryEl.className = "activity-entry";

      // Icon
      const iconEl = document.createElement("div");
      const iconClass = entry.type === "comment" ? "activity-icon--comment"
        : entry.type === "enrichment" ? "activity-icon--enrichment"
        : "activity-icon--edit";
      iconEl.className = `activity-icon ${iconClass}`;

      if (entry.type === "comment") {
        iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 10c0 .55-.45 1-1 1H5l-3 3V3c0-.55.45-1 1-1h10c.55 0 1 .45 1 1v7z"/></svg>`;
      } else if (entry.type === "enrichment") {
        iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="8 1 10 6 15 6 11 9.5 12.5 15 8 11.5 3.5 15 5 9.5 1 6 6 6"/></svg>`;
      } else {
        iconEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>`;
      }
      entryEl.appendChild(iconEl);

      // Content column
      const contentEl = document.createElement("div");
      contentEl.className = "activity-content";

      // Meta line
      const metaEl = document.createElement("div");
      metaEl.className = "activity-meta";
      const typeLabel = entry.type === "comment" ? "Comment"
        : entry.type === "enrichment" ? "AI enriched"
        : "Edited";
      metaEl.innerHTML = `<strong>${typeLabel}</strong> \u00B7 ${entry.actor} \u00B7 ${relativeTime(entry.createdAt)}`;
      contentEl.appendChild(metaEl);

      // Body
      const bodyEl = document.createElement("div");
      bodyEl.className = "activity-body";
      if (entry.type === "comment") {
        bodyEl.textContent = entry.text;
      } else if (entry.type === "edit") {
        bodyEl.textContent = entry.changeSummary;
      } else {
        bodyEl.textContent = "AI enriched this note";
      }
      contentEl.appendChild(bodyEl);

      // Version actions (Preview/Restore)
      if (entry.type === "edit" && onRestoreVersion) {
        const actionsEl = document.createElement("div");
        actionsEl.className = "activity-actions";

        const previewBtn = document.createElement("button");
        previewBtn.type = "button";
        previewBtn.className = "item-action-btn";
        previewBtn.textContent = "Preview";

        const restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "item-action-btn item-action-btn--primary";
        restoreBtn.textContent = "Restore";

        let previewEl = null;
        previewBtn.addEventListener("click", () => {
          if (previewEl) {
            previewEl.remove();
            previewEl = null;
            previewBtn.textContent = "Preview";
            return;
          }
          previewEl = document.createElement("div");
          previewEl.className = "activity-preview";
          const previewText = (entry.content || "").slice(0, 500) + ((entry.content || "").length > 500 ? "..." : "");
          renderMarkdownInto(previewEl, previewText);
          contentEl.appendChild(previewEl);
          previewBtn.textContent = "Hide preview";
        });

        restoreBtn.addEventListener("click", async () => {
          if (!window.confirm(`Restore to version ${entry.versionNumber}? Current state will be saved as a new version.`)) return;
          restoreBtn.disabled = true;
          restoreBtn.textContent = "Restoring...";
          await onRestoreVersion(entry.versionNumber);
        });

        actionsEl.append(previewBtn, restoreBtn);
        contentEl.appendChild(actionsEl);
      }

      entryEl.appendChild(contentEl);
      feed.appendChild(entryEl);
    });

    activitySection.appendChild(feed);
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
  activitySection.appendChild(commentForm);
  wrap.appendChild(activitySection);

  container.appendChild(wrap);
}
