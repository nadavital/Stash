import { buildAgentNoteTitle } from "../chatHelpers.js";
import { sanitizeCreateFields } from "./contentFormatGuards.js";

const MAX_TOOL_BULK_ITEMS = 25;

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

function normalizeCreateNoteInput(args = {}, { chatAttachment = null, toolName = "create_note" } = {}) {
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

  const sanitized = sanitizeCreateFields(
    {
      title: args.title,
      content: rawContent,
    },
    {
      sourceType,
      fileMime: attachment?.fileMimeType || "",
      fileName: attachment?.fileName || "",
    }
  );
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
    throw new Error(`${toolName} requires content or an attachment`);
  }

  return {
    content,
    title,
    sourceType,
    sourceUrl,
    imageDataUrl: attachment?.imageDataUrl || null,
    fileDataUrl: attachment?.fileDataUrl || null,
    fileName: attachment?.fileName || "",
    fileMimeType: attachment?.fileMimeType || "",
    project: String(args.project || ""),
  };
}

async function runBatchCreate({
  batchCreateMemories,
  createMemory,
  items,
  project,
  actor,
  metadata,
  stopOnError,
}) {
  if (typeof batchCreateMemories === "function") {
    return batchCreateMemories({
      items,
      project,
      actor,
      metadata,
      stopOnError,
    });
  }

  const createdItems = [];
  const failedItems = [];
  for (let index = 0; index < items.length; index += 1) {
    try {
      const note = await createMemory({
        ...items[index],
        project: items[index]?.project || project,
        metadata,
        actor,
      });
      createdItems.push({ index, note });
    } catch (error) {
      if (stopOnError) throw error;
      failedItems.push({
        index,
        error: error instanceof Error ? error.message : "Batch create failed for item",
      });
    }
  }

  return {
    created: createdItems.length,
    failed: failedItems.length,
    items: [...createdItems, ...failedItems].sort((a, b) => a.index - b.index),
  };
}

export function createCaptureToolHandlers({ createMemory, batchCreateMemories }) {
  return {
    async create_note(args, actor, { chatAttachment = null } = {}) {
      const payload = normalizeCreateNoteInput(args, { chatAttachment, toolName: "create_note" });
      const note = await createMemory({
        ...payload,
        metadata: { createdFrom: "chat-agent", actorUserId: actor.userId },
        actor,
      });
      return {
        noteId: note.id,
        title: buildAgentNoteTitle(note, payload.content.slice(0, 80) || "New item"),
        sourceType: note.sourceType,
      };
    },

    async create_notes_bulk(args, actor) {
      const rawItems = Array.isArray(args?.items) ? args.items : [];
      const stopOnError = args?.stopOnError === true;
      if (!rawItems.length) {
        throw new Error("create_notes_bulk requires a non-empty items array");
      }
      if (rawItems.length > MAX_TOOL_BULK_ITEMS) {
        throw new Error(`create_notes_bulk supports at most ${MAX_TOOL_BULK_ITEMS} items per call`);
      }

      const normalizedItems = [];
      const indexMap = [];
      const preflightFailures = [];
      for (let i = 0; i < rawItems.length; i += 1) {
        try {
          const normalized = normalizeCreateNoteInput(rawItems[i], { toolName: "create_notes_bulk" });
          normalizedItems.push(normalized);
          indexMap.push(i);
        } catch (error) {
          if (stopOnError) throw error;
          preflightFailures.push({
            index: i,
            error: error instanceof Error ? error.message : "Batch create failed for item",
          });
        }
      }

      const result = await runBatchCreate({
        batchCreateMemories,
        createMemory,
        items: normalizedItems,
        project: String(args?.project || ""),
        actor,
        metadata: {
          createdFrom: "chat-agent-batch",
          actorUserId: actor.userId,
        },
        stopOnError,
      });

      const mappedItems = (Array.isArray(result.items) ? result.items : []).map((entry) => ({
        ...entry,
        index: indexMap[entry?.index] ?? entry?.index ?? -1,
      }));
      const combinedItems = [...mappedItems, ...preflightFailures].sort((a, b) => (a.index || 0) - (b.index || 0));
      const failed = Number(result.failed || 0) + preflightFailures.length;

      return {
        created: result.created,
        failed,
        items: combinedItems.map((entry) => {
          if (entry?.note) {
            const fallbackTitle = String(entry.note?.content || "").slice(0, 80) || "New item";
            return {
              index: entry.index,
              noteId: entry.note.id,
              title: buildAgentNoteTitle(entry.note, fallbackTitle),
              sourceType: entry.note.sourceType,
              status: "created",
            };
          }
          return {
            index: entry?.index ?? -1,
            status: "failed",
            error: String(entry?.error || "Batch create failed for item"),
          };
        }),
      };
    },
  };
}
