import { buildNoteTitle } from "./mappers.js";
import { mergeTextWithBase } from "./revision-merge.js";
import {
  iconTypeFor,
  getNoteProcessingState,
  noteTypeIconMarkup,
  relativeTime,
  buildModalFullExtract,
} from "./note-utils.js";
import { renderMarkdownInto } from "./markdown.js";
import { createMarkdownEditor } from "../components/markdown-editor/markdown-editor.js";

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function normalizeActorLabel(value, fallback = "Workspace member") {
  const actor = String(value || "").trim();
  if (!actor) return fallback;
  if (/^[a-z]+_\w+/i.test(actor) || /^[A-Z]\d+$/i.test(actor) || /^[0-9a-f-]{16,}$/i.test(actor)) {
    return fallback;
  }
  return actor;
}

function latestCommentPreview(note) {
  const comments = Array.isArray(note?.metadata?.comments) ? note.metadata.comments : [];
  if (!comments.length) return "";
  const latest = comments
    .slice()
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())[0];
  const text = String(latest?.text || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > 160 ? `${text.slice(0, 159).trim()}...` : text;
}

export function buildItemActivityEntries(note, versions = []) {
  const comments = Array.isArray(note?.metadata?.comments) ? note.metadata.comments : [];
  const timelineEntries = [];

  comments.forEach((entry, index) => {
    timelineEntries.push({
      id: `comment-${index}-${String(entry?.createdAt || "")}`,
      type: "comment",
      text: entry?.text || "",
      actor: normalizeActorLabel(entry?.actor, "You"),
      createdAt: entry?.createdAt || "",
      ts: entry?.createdAt ? new Date(entry.createdAt).getTime() : 0,
    });
  });

  (Array.isArray(versions) ? versions : []).forEach((version) => {
    timelineEntries.push({
      id: `version-${String(version?.versionNumber || "")}-${String(version?.createdAt || "")}`,
      type: "edit",
      changeSummary: version?.changeSummary || "Edited",
      actor: normalizeActorLabel(version?.actorName || version?.actorUserId, "Workspace member"),
      createdAt: version?.createdAt || "",
      ts: version?.createdAt ? new Date(version.createdAt).getTime() : 0,
      versionNumber: version?.versionNumber,
      content: version?.content || "",
    });
  });

  timelineEntries.sort((a, b) => b.ts - a.ts);
  return timelineEntries;
}

/**
 * Renders the full item detail view into the given container.
 *
 * @param {HTMLElement} container  – the #item-detail element
 * @param {object}      note       – the note object to render
 * @param {object}      opts
 * @param {Array}       [opts.relatedNotes]
 * @param {boolean}     [opts.isEditing]      – controls non-file edit mode
 * @param {(id: string) => void} opts.onNavigate – navigate to another item
 * @param {(payload) => Promise}      opts.onEdit
 * @param {(state: {dirty: boolean, saving: boolean}) => void} [opts.onFileDraftStateChange]
 * @param {{active?: boolean, text?: string, entries?: Array<{text?: string, status?: string}>}} [opts.remoteActivity]
 * @param {{available?: boolean, pending?: boolean}} [opts.agentUndo]
 * @param {() => Promise<void>|void} [opts.onUndoAgentUpdate]
 */
export function renderItemDetail(container, note, {
  relatedNotes = [],
  isEditing = false,
  onNavigate,
  onEdit,
  onFileDraftStateChange,
  remoteActivity = null,
  agentUndo = null,
  onUndoAgentUpdate = null,
}) {
  if (!note || !container) return;

  // Clean up previous content
  const loading = container.querySelector(".item-detail-loading");
  if (loading) loading.remove();
  const existing = container.querySelector(".item-detail-content");
  if (existing) {
    if (typeof existing._dispose === "function") existing._dispose();
    existing.remove();
  }

  const wrap = document.createElement("div");
  wrap.className = "item-detail-content";
  const isFileNote = String(note.sourceType || "").trim().toLowerCase() === "file";

  // Header
  const header = document.createElement("div");
  header.className = "item-header";

  const noteType = iconTypeFor(note);
  const typeBadge = document.createElement("span");
  typeBadge.className = "item-type-badge";
  typeBadge.dataset.type = noteType;
  typeBadge.innerHTML = `${noteTypeIconMarkup(noteType)} <span>${noteType}</span>`;
  header.appendChild(typeBadge);

  const explicitNoteTitle = String(note.title || note.metadata?.title || "").trim();
  const initialNoteTitle = explicitNoteTitle || buildNoteTitle(note);
  const titleEl = document.createElement("h1");
  titleEl.className = "item-title";
  titleEl.textContent = initialNoteTitle;
  header.appendChild(titleEl);

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

  const latestComment = latestCommentPreview(note);
  if (latestComment) {
    const commentPreview = document.createElement("p");
    commentPreview.className = "item-comment-preview";
    commentPreview.textContent = `Latest comment: ${latestComment}`;
    header.appendChild(commentPreview);
  }
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

  // Full content (hoisted) — rendered as markdown for non-file notes.
  let contentSection = null;
  let relatedSection = null;
  let editForm = null;
  let mdEditor = null;
  const editController = {
    isEditing: false,
    focusEditEditor() {},
    setRemoteActivity() {},
    getPendingEditPayload() {
      return null;
    },
  };
  const fullExtract = buildModalFullExtract(note);
  const displayContent = fullExtract || String(note.content || "").trim();

  if (isFileNote && onEdit) {
    const liveSection = document.createElement("section");
    liveSection.className = "item-file-live";

    const liveHeader = document.createElement("div");
    liveHeader.className = "item-file-live-head";

    const liveTitle = document.createElement("h2");
    liveTitle.className = "item-file-live-title";
    liveTitle.textContent = "File content";

    const liveSignals = document.createElement("div");
    liveSignals.className = "item-file-live-signals";

    const liveRemote = document.createElement("span");
    liveRemote.className = "item-file-live-remote hidden";

    const liveStatus = document.createElement("span");
    liveStatus.className = "item-file-live-status";
    liveStatus.textContent = "All changes saved";

    const liveUndoBtn = document.createElement("button");
    liveUndoBtn.type = "button";
    liveUndoBtn.className = "item-file-live-undo hidden";
    liveUndoBtn.textContent = "Undo";

    liveSignals.append(liveRemote, liveStatus, liveUndoBtn);
    liveHeader.append(liveTitle, liveSignals);

    titleEl.classList.add("item-title--editable");
    titleEl.contentEditable = "true";
    titleEl.spellcheck = true;
    titleEl.setAttribute("role", "textbox");
    titleEl.setAttribute("aria-label", "File title");

    const initialDraft = displayContent;
    const fileEditor = createMarkdownEditor(initialDraft);
    fileEditor.textarea.classList.add("item-file-live-textarea");

    let saveTimer = null;
    let baselineDraft = fileEditor.getValue();
    let baselineTitle = String(titleEl.textContent || "").replace(/\s+/g, " ").trim();
    let inflight = false;
    let queued = false;
    let undoPending = false;

    function readTitleText() {
      return String(titleEl.textContent || "").replace(/\s+/g, " ").trim();
    }

    function reportDraftState() {
      if (typeof onFileDraftStateChange === "function") {
        onFileDraftStateChange({
          dirty: fileEditor.getValue() !== baselineDraft || readTitleText() !== baselineTitle,
          saving: inflight || queued,
        });
      }
    }

    function updateLiveStatus(text, tone = "") {
      liveStatus.textContent = text;
      liveStatus.classList.remove("is-saving", "is-error");
      if (tone === "saving") liveStatus.classList.add("is-saving");
      if (tone === "error") liveStatus.classList.add("is-error");
      reportDraftState();
    }

    function extractNoteDraftValue(value, fallback = "") {
      return String(value?.markdownContent || value?.rawContent || value?.content || fallback || "");
    }

    function extractNoteTitle(value, fallback = "") {
      const explicit = String(value?.title || value?.metadata?.title || "").trim();
      if (explicit) return explicit;
      return String(fallback || "").trim();
    }

    function setRemoteActivityState(state = null) {
      const active = Boolean(state?.active);
      const label = String(state?.text || "").trim();
      const displayText = active ? "Agent editing..." : label;
      if (!displayText) {
        liveRemote.classList.add("hidden");
        liveRemote.classList.remove("is-active");
        liveRemote.textContent = "";
      } else {
        liveRemote.textContent = displayText;
        liveRemote.classList.remove("hidden");
        liveRemote.classList.toggle("is-active", active);
      }
    }

    function setUndoState(state = null) {
      const available = Boolean(state?.available);
      const pending = Boolean(state?.pending || undoPending);
      if (!available) {
        liveUndoBtn.classList.add("hidden");
        liveUndoBtn.disabled = false;
        liveUndoBtn.textContent = "Undo";
        return;
      }
      liveUndoBtn.classList.remove("hidden");
      liveUndoBtn.disabled = pending;
      liveUndoBtn.textContent = pending ? "Undoing..." : "Undo";
    }

    async function flushDraft(force = false) {
      if (inflight) {
        queued = true;
        reportDraftState();
        return;
      }
      const draft = fileEditor.getValue();
      const nextTitle = readTitleText();
      const titleChanged = nextTitle !== baselineTitle;
      if (!force && draft === baselineDraft && !titleChanged) {
        updateLiveStatus("All changes saved");
        return;
      }
      inflight = true;
      updateLiveStatus("Saving...", "saving");
      try {
        let workingDraft = draft;
        let workingTitle = nextTitle;
        let workingBaseDraft = baselineDraft;
        let workingBaseTitle = baselineTitle;
        let finalized = false;
        let remoteOnlyRebase = false;
        let sawConflict = false;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          const includeTitle = workingTitle !== workingBaseTitle;
          const result = await onEdit({
            mode: "file-live",
            ...(includeTitle ? { title: workingTitle } : {}),
            content: workingDraft,
            rawContent: workingDraft,
            markdownContent: workingDraft,
            requeueEnrichment: false,
          });

          if (result?.conflict) {
            const latestNote = result.note || null;
            if (!latestNote || attempt > 0) {
              sawConflict = true;
              break;
            }
            const latestDraft = extractNoteDraftValue(latestNote, workingBaseDraft);
            const latestTitle = extractNoteTitle(latestNote, workingBaseTitle) || workingBaseTitle;
            const mergedDraft = mergeTextWithBase(workingBaseDraft, workingDraft, latestDraft);
            const mergedTitle = mergeTextWithBase(workingBaseTitle, workingTitle, latestTitle);

            baselineDraft = latestDraft;
            baselineTitle = latestTitle;
            workingBaseDraft = latestDraft;
            workingBaseTitle = latestTitle;

            if (mergedDraft.status === "conflict" || mergedTitle.status === "conflict") {
              sawConflict = true;
              break;
            }

            workingDraft = mergedDraft.text;
            workingTitle = mergedTitle.text;

            if (workingDraft !== fileEditor.getValue()) {
              fileEditor.setValue(workingDraft);
            }
            if (workingTitle !== readTitleText()) {
              titleEl.textContent = workingTitle;
            }

            const hasLocalDelta = workingDraft !== latestDraft || workingTitle !== latestTitle;
            if (!hasLocalDelta) {
              finalized = true;
              remoteOnlyRebase = true;
              break;
            }

            updateLiveStatus("Another update came in. Syncing...", "saving");
            continue;
          }

          if (result?.note) {
            baselineDraft = extractNoteDraftValue(result.note, workingDraft);
            baselineTitle = extractNoteTitle(result.note, workingTitle) || workingTitle;
          } else {
            baselineDraft = workingDraft;
            baselineTitle = workingTitle;
          }
          if (baselineDraft !== fileEditor.getValue()) {
            fileEditor.setValue(baselineDraft);
          }
          if (baselineTitle !== readTitleText()) {
            titleEl.textContent = baselineTitle;
          }
          finalized = true;
          break;
        }

        if (finalized) {
          updateLiveStatus(remoteOnlyRebase ? "Remote edits applied" : "All changes saved");
        } else if (sawConflict) {
          updateLiveStatus("Couldn’t sync automatically. Your draft is still safe.", "error");
        } else {
          updateLiveStatus("Update couldn’t be applied yet. We’ll keep retrying.", "error");
        }
      } catch {
        updateLiveStatus("Save failed. Keep typing to retry.", "error");
      } finally {
        inflight = false;
        if (queued) {
          queued = false;
          void flushDraft();
        } else {
          reportDraftState();
        }
      }
    }

    function scheduleDraftSave() {
      clearTimeout(saveTimer);
      updateLiveStatus("Unsaved changes");
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        void flushDraft();
      }, 700);
    }

    fileEditor.textarea.addEventListener("input", scheduleDraftSave);
    titleEl.addEventListener("input", scheduleDraftSave);
    titleEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        titleEl.blur();
      }
    });
    fileEditor.textarea.addEventListener("blur", () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      void flushDraft(true);
    });
    titleEl.addEventListener("blur", () => {
      titleEl.textContent = readTitleText();
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      void flushDraft(true);
    });

    wrap._dispose = () => {
      if (saveTimer) clearTimeout(saveTimer);
      fileEditor.destroy();
      if (typeof onFileDraftStateChange === "function") {
        onFileDraftStateChange({ dirty: false, saving: false });
      }
    };

    liveUndoBtn.addEventListener("click", async () => {
      if (undoPending || typeof onUndoAgentUpdate !== "function") return;
      undoPending = true;
      setUndoState(agentUndo);
      try {
        await onUndoAgentUpdate();
      } finally {
        undoPending = false;
        setUndoState(agentUndo);
      }
    });

    editController.setRemoteActivity = (state) => {
      setRemoteActivityState(state);
    };
    editController.setAgentUndo = (state) => {
      agentUndo = state || null;
      setUndoState(agentUndo);
    };
    setRemoteActivityState(remoteActivity);
    setUndoState(agentUndo);
    reportDraftState();
    liveSection.append(liveHeader, fileEditor.element);
    wrap.appendChild(liveSection);
  } else if (displayContent) {
    contentSection = document.createElement("div");
    contentSection.className = "item-full-content";

    const contentBody = document.createElement("div");
    contentBody.className = "item-content-body";
    renderMarkdownInto(contentBody, displayContent);

    contentSection.appendChild(contentBody);
    wrap.appendChild(contentSection);
  }

  if (onEdit && !isFileNote) {
    if (isEditing) {
      const initialEditTitle = String(titleEl.textContent || "").replace(/\s+/g, " ").trim();
      titleEl.classList.add("item-title--editable");
      titleEl.contentEditable = "true";
      titleEl.spellcheck = true;
      titleEl.setAttribute("role", "textbox");
      titleEl.setAttribute("aria-label", "Note title");
      titleEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          titleEl.blur();
        }
      });

      editForm = document.createElement("div");
      editForm.className = "item-edit-form";

      const contentLabel = document.createElement("label");
      contentLabel.className = "item-edit-label";
      contentLabel.textContent = "Content";

      mdEditor = createMarkdownEditor(displayContent);
      editForm.append(contentLabel, mdEditor.element);
      wrap.appendChild(editForm);

      if (contentSection) contentSection.classList.add("hidden");

      editController.isEditing = true;
      editController.focusEditEditor = () => {
        const target = mdEditor?.textarea;
        if (!target) return;
        requestAnimationFrame(() => target.focus());
      };
      editController.getPendingEditPayload = () => {
        const nextTitle = String(titleEl.textContent || "").replace(/\s+/g, " ").trim();
        return {
          ...(nextTitle !== initialEditTitle ? { title: nextTitle } : {}),
          content: mdEditor.getValue(),
        };
      };
    } else {
      titleEl.classList.remove("item-title--editable");
      titleEl.contentEditable = "false";
      titleEl.removeAttribute("role");
      titleEl.removeAttribute("aria-label");
    }

    if (!wrap._dispose && mdEditor) {
      wrap._dispose = () => {
        mdEditor.destroy();
      };
    }
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

  if (editController.isEditing && relatedSection) {
    relatedSection.classList.add("hidden");
  }

  container.appendChild(wrap);
  return editController;
}
