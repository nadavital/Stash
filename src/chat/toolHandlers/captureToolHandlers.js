import { buildAgentNoteTitle } from "../chatHelpers.js";
import { sanitizeCreateFields } from "./contentFormatGuards.js";

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

export function createCaptureToolHandlers({ createMemory }) {
  return {
    async create_note(args, actor, { chatAttachment = null } = {}) {
      const rawContent = String(args.content || "").trim();
      const sourceUrlArg = String(args.sourceUrl || "").trim();
      const attachment = resolveAttachment(args, chatAttachment);
      const attachmentPresent = Boolean(attachment?.fileDataUrl || attachment?.imageDataUrl);
      const requestedSourceType = String(args.sourceType || "").trim().toLowerCase();
      let sourceType = "text";
      if (attachmentPresent) {
        sourceType = attachment?.fileMimeType?.toLowerCase().startsWith("image/") ? "image" : "file";
      } else if (requestedSourceType === "url" || requestedSourceType === "link") {
        sourceType = "link";
      } else if (requestedSourceType === "file" || requestedSourceType === "image") {
        sourceType = requestedSourceType;
      }
      const sanitized = sanitizeCreateFields({
        title: args.title,
        content: rawContent,
      }, {
        sourceType,
        fileMime: attachment?.fileMimeType || "",
        fileName: attachment?.fileName || "",
      });
      const content = String(sanitized.content || "");
      const title = String(sanitized.title || "");
      let sourceUrl = sourceUrlArg;
      if (!requestedSourceType && /^https?:\/\//i.test(content)) {
        sourceType = "link";
        sourceUrl = content;
      } else if ((requestedSourceType === "url" || requestedSourceType === "link") && /^https?:\/\//i.test(content)) {
        sourceUrl = content;
      } else if (sourceUrlArg && /^https?:\/\//i.test(sourceUrlArg)) {
        sourceType = "link";
      }
      if (!content && !attachmentPresent) {
        throw new Error("create_note requires content or an attachment");
      }
      const note = await createMemory({
        content,
        title,
        sourceType,
        sourceUrl,
        imageDataUrl: attachment?.imageDataUrl || null,
        fileDataUrl: attachment?.fileDataUrl || null,
        fileName: attachment?.fileName || "",
        fileMimeType: attachment?.fileMimeType || "",
        project: args.project || "",
        metadata: { createdFrom: "chat-agent", actorUserId: actor.userId },
        actor,
      });
      return {
        noteId: note.id,
        title: buildAgentNoteTitle(note, content.slice(0, 80) || "New item"),
        sourceType: note.sourceType,
      };
    },
  };
}
