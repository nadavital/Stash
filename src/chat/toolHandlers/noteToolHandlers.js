import { buildAgentNoteTitle } from "../chatHelpers.js";
import { sanitizeUpdateFields } from "./contentFormatGuards.js";

function resolveAttachment(args, chatAttachment = null) {
  if (chatAttachment && (chatAttachment.fileDataUrl || chatAttachment.imageDataUrl)) {
    return chatAttachment;
  }
  return {
    imageDataUrl: String(args.imageDataUrl || "").trim() || null,
    fileDataUrl: String(args.fileDataUrl || "").trim() || null,
    fileName: String(args.fileName || ""),
    fileMimeType: String(args.fileMimeType || ""),
  };
}

function toPositiveRevision(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

function isRevisionConflictError(error) {
  return (
    String(error?.code || "").trim().toUpperCase() === "REVISION_CONFLICT" ||
    /revision conflict/i.test(String(error?.message || ""))
  );
}

async function resolveLatestSnapshot({ id, actor, getMemoryRawContent }) {
  try {
    return await getMemoryRawContent({
      id,
      includeMarkdown: false,
      maxChars: 200,
      actor,
    });
  } catch {
    return null;
  }
}

async function runWithAutoRebase({
  id,
  actor,
  requestedBaseRevision,
  getMemoryRawContent,
  performUpdate,
  initialSnapshot = null,
}) {
  const requested = toPositiveRevision(requestedBaseRevision);
  const snapshot = initialSnapshot || (await resolveLatestSnapshot({ id, actor, getMemoryRawContent }));
  const freshRevision = toPositiveRevision(snapshot?.revision);
  let baseRevision = freshRevision || requested || null;

  try {
    return await performUpdate(baseRevision);
  } catch (error) {
    if (!isRevisionConflictError(error)) throw error;
    const conflictRevision = toPositiveRevision(error?.conflict?.currentRevision);
    const retryRevision =
      conflictRevision ||
      toPositiveRevision((await resolveLatestSnapshot({ id, actor, getMemoryRawContent }))?.revision);
    if (!retryRevision || retryRevision === baseRevision) {
      throw error;
    }
    baseRevision = retryRevision;
    return performUpdate(baseRevision);
  }
}

export function createNoteToolHandlers({
  getMemoryRawContent,
  updateMemory,
  updateMemoryAttachment,
  updateMemoryExtractedContent,
  addMemoryComment,
  listMemoryVersions,
  restoreMemoryVersion,
  retryMemoryEnrichment,
}) {
  return {
    async get_note_raw_content(args, actor) {
      return getMemoryRawContent({
        id: String(args.id || "").trim(),
        includeMarkdown: args.includeMarkdown !== false,
        maxChars: Number(args.maxChars || 12000),
        actor,
      });
    },

    async update_note(args, actor) {
      const id = String(args.id || "").trim();
      const latestSnapshot = await resolveLatestSnapshot({ id, actor, getMemoryRawContent });
      const sanitized = sanitizeUpdateFields({
        title: args.title,
        content: args.content,
        summary: args.summary,
      }, latestSnapshot);
      const note = await runWithAutoRebase({
        id,
        actor,
        requestedBaseRevision: args.baseRevision,
        getMemoryRawContent,
        initialSnapshot: latestSnapshot,
        performUpdate: (baseRevision) => updateMemory({
          id,
          title: sanitized.title,
          content: sanitized.content,
          summary: sanitized.summary,
          tags: Array.isArray(args.tags)
            ? args.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
            : undefined,
          project: args.project,
          baseRevision,
          actor,
        }),
      });
      const patch = {
        ...(args.title !== undefined ? { title: String(note?.metadata?.title || "").trim() } : {}),
        ...(args.content !== undefined ? { content: String(note?.content || "") } : {}),
        ...(args.summary !== undefined ? { summary: String(note?.summary || "") } : {}),
        ...(args.tags !== undefined ? { tags: Array.isArray(note?.tags) ? note.tags : [] } : {}),
        ...(args.project !== undefined ? { project: String(note?.project || "") } : {}),
        ...(note?.status ? { status: String(note.status) } : {}),
        ...(Number.isFinite(Number(note?.revision)) ? { revision: Number(note.revision) } : {}),
      };
      return {
        noteId: note.id,
        title: buildAgentNoteTitle(note, "Updated item"),
        patch,
      };
    },

    async update_note_attachment(args, actor, { chatAttachment = null } = {}) {
      const attachment = resolveAttachment(args, chatAttachment);
      const id = String(args.id || "").trim();
      const latestSnapshot = await resolveLatestSnapshot({ id, actor, getMemoryRawContent });
      const sanitized = sanitizeUpdateFields({
        content: args.content,
      }, latestSnapshot);
      const note = await runWithAutoRebase({
        id,
        actor,
        requestedBaseRevision: args.baseRevision,
        getMemoryRawContent,
        initialSnapshot: latestSnapshot,
        performUpdate: (baseRevision) => updateMemoryAttachment({
          id,
          content: sanitized.content,
          fileDataUrl: attachment.fileDataUrl,
          imageDataUrl: attachment.imageDataUrl,
          fileName: attachment.fileName,
          fileMimeType: attachment.fileMimeType,
          baseRevision,
          requeueEnrichment: args.requeueEnrichment !== false,
          actor,
        }),
      });
      return {
        noteId: note.id,
        sourceType: note.sourceType || "",
        fileName: note.fileName || "",
        status: note.status || "",
      };
    },

    async update_note_markdown(args, actor) {
      const id = String(args.id || "").trim();
      const latestSnapshot = await resolveLatestSnapshot({ id, actor, getMemoryRawContent });
      const sanitized = sanitizeUpdateFields({
        content: args.content,
        rawContent: args.rawContent,
        markdownContent: args.markdownContent,
      }, latestSnapshot);
      const note = await runWithAutoRebase({
        id,
        actor,
        requestedBaseRevision: args.baseRevision,
        getMemoryRawContent,
        initialSnapshot: latestSnapshot,
        performUpdate: (baseRevision) => updateMemoryExtractedContent({
          id,
          content: sanitized.content,
          rawContent: sanitized.rawContent,
          markdownContent: sanitized.markdownContent,
          baseRevision,
          requeueEnrichment: args.requeueEnrichment !== false,
          actor,
        }),
      });
      const patch = {
        ...(args.content !== undefined ? { content: String(note?.content || "") } : {}),
        ...(args.rawContent !== undefined ? { rawContent: String(note?.rawContent || "") } : {}),
        ...(args.markdownContent !== undefined ? { markdownContent: String(note?.markdownContent || "") } : {}),
        ...(note?.status ? { status: String(note.status) } : {}),
        ...(Number.isFinite(Number(note?.revision)) ? { revision: Number(note.revision) } : {}),
      };
      return {
        noteId: note.id,
        status: note.status || "",
        patch,
      };
    },

    async add_note_comment(args, actor) {
      const result = await addMemoryComment({
        id: String(args.id || "").trim(),
        text: String(args.text || ""),
        actor,
      });
      return {
        noteId: result.note?.id || String(args.id || "").trim(),
        commentId: result.comment?.id || "",
      };
    },

    async list_note_versions(args, actor) {
      const result = await listMemoryVersions({
        id: String(args.id || "").trim(),
        actor,
      });
      return {
        noteId: String(args.id || "").trim(),
        versions: (result.items || []).slice(0, 20).map((item) => ({
          versionNumber: item.versionNumber,
          createdAt: item.createdAt,
          changeSummary: item.changeSummary || "",
        })),
      };
    },

    async restore_note_version(args, actor) {
      const note = await restoreMemoryVersion({
        id: String(args.id || "").trim(),
        versionNumber: Number(args.versionNumber || 0),
        actor,
      });
      return { noteId: note.id, status: note.status || "" };
    },

    async retry_note_enrichment(args, actor) {
      const result = await retryMemoryEnrichment({
        id: String(args.id || "").trim(),
        actor,
      });
      return {
        noteId: result.note?.id || String(args.id || "").trim(),
        queued: result.queued === true,
        source: result.source || "",
      };
    },
  };
}
