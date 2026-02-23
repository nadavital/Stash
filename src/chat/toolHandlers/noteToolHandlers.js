import { buildAgentNoteTitle } from "../chatHelpers.js";

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
      const note = await updateMemory({
        id: String(args.id || "").trim(),
        title: args.title,
        content: args.content,
        summary: args.summary,
        tags: Array.isArray(args.tags)
          ? args.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
          : undefined,
        project: args.project,
        baseRevision: args.baseRevision,
        actor,
      });
      return { noteId: note.id, title: buildAgentNoteTitle(note, "Updated item") };
    },

    async update_note_attachment(args, actor, { chatAttachment = null } = {}) {
      const attachment = resolveAttachment(args, chatAttachment);
      const note = await updateMemoryAttachment({
        id: String(args.id || "").trim(),
        content: args.content,
        fileDataUrl: attachment.fileDataUrl,
        imageDataUrl: attachment.imageDataUrl,
        fileName: attachment.fileName,
        fileMimeType: attachment.fileMimeType,
        baseRevision: args.baseRevision,
        requeueEnrichment: args.requeueEnrichment !== false,
        actor,
      });
      return {
        noteId: note.id,
        sourceType: note.sourceType || "",
        fileName: note.fileName || "",
        status: note.status || "",
      };
    },

    async update_note_markdown(args, actor) {
      const note = await updateMemoryExtractedContent({
        id: String(args.id || "").trim(),
        content: args.content,
        rawContent: args.rawContent,
        markdownContent: args.markdownContent,
        baseRevision: args.baseRevision,
        requeueEnrichment: args.requeueEnrichment !== false,
        actor,
      });
      return { noteId: note.id, status: note.status || "" };
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
