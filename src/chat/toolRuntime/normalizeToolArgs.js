import {
  FOLDER_ROLES,
  normalizeChatSourceType,
  normalizeMemoryScope,
  normalizeSingleSentence,
  normalizeStringArray,
  normalizeText,
  normalizeWorkingSetIds,
} from "./argUtils.js";

export function normalizeToolArgs(name, args) {
  const normalizedName = normalizeText(name);
  const source = args && typeof args === "object" && !Array.isArray(args) ? args : {};

  switch (normalizedName) {
    case "create_note": {
      const content = normalizeText(source.content);
      const imageDataUrl = normalizeText(source.imageDataUrl);
      const fileDataUrl = normalizeText(source.fileDataUrl);
      const hasAttachment = Boolean(imageDataUrl || fileDataUrl);
      if (!content && !hasAttachment) throw new Error("create_note requires content or an attachment");
      return {
        content,
        title: normalizeText(source.title),
        project: normalizeText(source.project),
        sourceType: normalizeChatSourceType(source.sourceType),
        sourceUrl: normalizeText(source.sourceUrl),
        imageDataUrl,
        fileDataUrl,
        fileName: normalizeText(source.fileName),
        fileMimeType: normalizeText(source.fileMimeType),
      };
    }
    case "create_folder": {
      const nameArg = normalizeText(source.name);
      if (!nameArg) throw new Error("create_folder requires a folder name");
      return {
        name: nameArg,
        description: normalizeText(source.description),
        color: normalizeText(source.color),
      };
    }
    case "list_workspace_members": {
      const query = normalizeText(source.query);
      const limit = Number(source.limit || 50);
      return {
        ...(query ? { query } : {}),
        limit: Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50,
      };
    }
    case "list_folder_collaborators": {
      const folderId = normalizeText(source.folderId || source.folder || source.id);
      if (!folderId) throw new Error("list_folder_collaborators requires folderId");
      return { folderId };
    }
    case "set_folder_collaborator": {
      const folderId = normalizeText(source.folderId || source.folder || source.id);
      const userId = normalizeText(source.userId);
      const email = normalizeText(source.email).toLowerCase();
      const role = normalizeText(source.role).toLowerCase();
      if (!folderId) throw new Error("set_folder_collaborator requires folderId");
      if (!userId && !email) throw new Error("set_folder_collaborator requires userId or email");
      return {
        folderId,
        ...(userId ? { userId } : {}),
        ...(email ? { email } : {}),
        role: FOLDER_ROLES.has(role) ? role : "viewer",
      };
    }
    case "remove_folder_collaborator": {
      const folderId = normalizeText(source.folderId || source.folder || source.id);
      const userId = normalizeText(source.userId);
      const email = normalizeText(source.email).toLowerCase();
      if (!folderId) throw new Error("remove_folder_collaborator requires folderId");
      if (!userId && !email) throw new Error("remove_folder_collaborator requires userId or email");
      return {
        folderId,
        ...(userId ? { userId } : {}),
        ...(email ? { email } : {}),
      };
    }
    case "list_activity": {
      const folderId = normalizeText(source.folderId || source.folder || source.project || "");
      const noteId = normalizeText(source.noteId || source.id || "");
      const limit = Number(source.limit || 30);
      return {
        ...(folderId ? { folderId } : {}),
        ...(noteId ? { noteId } : {}),
        limit: Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 30,
      };
    }
    case "search_notes": {
      const query = normalizeText(source.query);
      if (!query) throw new Error("search_notes requires a query");
      const scope = normalizeMemoryScope(source.scope);
      const workingSetIds = normalizeWorkingSetIds(source.workingSetIds, 100);
      return {
        query,
        project: normalizeText(source.project),
        ...(scope ? { scope } : {}),
        ...(workingSetIds.length ? { workingSetIds } : {}),
      };
    }
    case "retry_note_enrichment": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("retry_note_enrichment requires an id");
      return { id };
    }
    case "ask_user_question": {
      const question = normalizeSingleSentence(source.question, 140);
      if (!question) throw new Error("ask_user_question requires a question");
      const rawOptions = normalizeStringArray(source.options, 4);
      let options = [];
      const seen = new Set();
      rawOptions.forEach((option) => {
        const key = option.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        options.push(option);
      });
      const rawAnswerMode = normalizeText(source.answerMode).toLowerCase();
      const validModes = new Set(["freeform_only", "choices_only", "choices_plus_freeform"]);
      if (!validModes.has(rawAnswerMode)) {
        throw new Error("ask_user_question requires answerMode");
      }
      if (rawAnswerMode === "choices_plus_freeform") {
        options = options.filter((option) => !isGenericOtherOption(option));
      }
      if (rawAnswerMode !== "freeform_only" && options.length === 0) {
        throw new Error("ask_user_question requires options for choice answerMode");
      }
      const resolvedOptions = rawAnswerMode === "freeform_only" ? [] : options;
      return {
        question,
        options: resolvedOptions,
        answerMode: rawAnswerMode,
        context: normalizeSingleSentence(source.context, 120),
      };
    }
    case "get_note_raw_content": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("get_note_raw_content requires an id");
      return {
        id,
        includeMarkdown: source.includeMarkdown !== false,
        maxChars: Number(source.maxChars || 12000),
      };
    }
    case "update_note": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("update_note requires an id");
      const parsedBaseRevision = Number(source.baseRevision);
      return {
        id,
        ...(source.title !== undefined ? { title: String(source.title || "").trim() } : {}),
        ...(source.content !== undefined ? { content: String(source.content || "") } : {}),
        ...(source.summary !== undefined ? { summary: String(source.summary || "") } : {}),
        ...(source.tags !== undefined ? { tags: normalizeStringArray(source.tags, 40) } : {}),
        ...(source.project !== undefined ? { project: normalizeText(source.project) } : {}),
        ...(Number.isFinite(parsedBaseRevision) && parsedBaseRevision >= 1
          ? { baseRevision: Math.floor(parsedBaseRevision) }
          : {}),
      };
    }
    case "update_note_attachment": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("update_note_attachment requires an id");
      const parsedBaseRevision = Number(source.baseRevision);
      return {
        id,
        ...(source.content !== undefined ? { content: String(source.content || "") } : {}),
        ...(source.imageDataUrl !== undefined ? { imageDataUrl: normalizeText(source.imageDataUrl) } : {}),
        ...(source.fileDataUrl !== undefined ? { fileDataUrl: normalizeText(source.fileDataUrl) } : {}),
        ...(source.fileName !== undefined ? { fileName: normalizeText(source.fileName) } : {}),
        ...(source.fileMimeType !== undefined ? { fileMimeType: normalizeText(source.fileMimeType) } : {}),
        requeueEnrichment: source.requeueEnrichment !== false,
        ...(Number.isFinite(parsedBaseRevision) && parsedBaseRevision >= 1
          ? { baseRevision: Math.floor(parsedBaseRevision) }
          : {}),
      };
    }
    case "update_note_markdown": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("update_note_markdown requires an id");
      const parsedBaseRevision = Number(source.baseRevision);
      return {
        id,
        ...(source.content !== undefined ? { content: String(source.content || "") } : {}),
        ...(source.rawContent !== undefined ? { rawContent: String(source.rawContent || "") } : {}),
        ...(source.markdownContent !== undefined ? { markdownContent: String(source.markdownContent || "") } : {}),
        requeueEnrichment: source.requeueEnrichment !== false,
        ...(Number.isFinite(parsedBaseRevision) && parsedBaseRevision >= 1
          ? { baseRevision: Math.floor(parsedBaseRevision) }
          : {}),
      };
    }
    case "add_note_comment": {
      const id = normalizeText(source.id);
      const text = normalizeText(source.text);
      if (!id) throw new Error("add_note_comment requires an id");
      if (!text) throw new Error("add_note_comment requires text");
      return { id, text };
    }
    case "list_note_versions": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("list_note_versions requires an id");
      return { id };
    }
    case "restore_note_version": {
      const id = normalizeText(source.id);
      const versionNumber = Number(source.versionNumber || 0);
      if (!id) throw new Error("restore_note_version requires an id");
      if (!Number.isFinite(versionNumber) || versionNumber <= 0) {
        throw new Error("restore_note_version requires a positive versionNumber");
      }
      return { id, versionNumber: Math.floor(versionNumber) };
    }
    default:
      throw new Error(`Unknown tool: ${normalizedName}`);
  }
}

function isGenericOtherOption(option = "") {
  const value = String(option || "").trim().toLowerCase();
  if (!value) return false;
  return /^(other|something else|anything else|else|another option|not sure|none of these|none)\b/i.test(value);
}
