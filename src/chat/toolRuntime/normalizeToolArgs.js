import {
  FOLDER_ROLES,
  normalizeChatSourceType,
  normalizeMemoryScope,
  normalizeSingleSentence,
  normalizeStringArray,
  normalizeText,
  normalizeWorkingSetIds,
} from "./argUtils.js";
import { normalizeTaskSpec } from "../../tasks/taskSpec.js";

function normalizeIsoDateTime(value, { fieldName = "datetime" } = {}) {
  const text = normalizeText(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO datetime`);
  }
  return parsed.toISOString();
}

function normalizeTaskDraftArgs(source, { toolName = "create_task", includeConfirmed = false } = {}) {
  const title = normalizeText(source.title || source.name);
  if (!title) throw new Error(`${toolName} requires title`);
  const prompt = normalizeText(source.prompt) || title;
  const scopeFolder = normalizeText(source.scopeFolder || source.project);
  const scheduleTypeRaw = normalizeText(source.scheduleType).toLowerCase();
  const intervalMinutes = normalizePositiveInt(source.intervalMinutes, { min: 5, max: 10080 });
  const scheduleType = scheduleTypeRaw || (intervalMinutes ? "interval" : "manual");
  if (scheduleType !== "manual" && scheduleType !== "interval") {
    throw new Error(`${toolName} scheduleType must be manual or interval`);
  }
  const normalized = {
    title,
    prompt,
    ...(scopeFolder ? { scopeFolder } : {}),
    scheduleType,
    ...(intervalMinutes !== undefined ? { intervalMinutes } : {}),
    ...(includeConfirmed && source.confirmed !== undefined ? { confirmed: source.confirmed === true } : {}),
    ...(source.timezone !== undefined ? { timezone: normalizeText(source.timezone) } : {}),
    ...(source.nextRunAt !== undefined
      ? { nextRunAt: normalizeIsoDateTime(source.nextRunAt, { fieldName: `${toolName} nextRunAt` }) }
      : {}),
    ...(source.maxActionsPerRun !== undefined
      ? { maxActionsPerRun: normalizePositiveInt(source.maxActionsPerRun, { min: 1, max: 25, required: true }) }
      : {}),
    ...(source.maxConsecutiveFailures !== undefined
      ? { maxConsecutiveFailures: normalizePositiveInt(source.maxConsecutiveFailures, { min: 1, max: 20, required: true }) }
      : {}),
    ...(source.dryRun !== undefined ? { dryRun: source.dryRun === true } : {}),
  };
  normalized.spec = normalizeTaskSpec(source.spec, normalized);
  return normalized;
}

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
    case "create_notes_bulk": {
      const rawItems = Array.isArray(source.items) ? source.items : [];
      if (rawItems.length === 0) {
        throw new Error("create_notes_bulk requires a non-empty items array");
      }
      return {
        ...(source.project !== undefined ? { project: normalizeText(source.project) } : {}),
        ...(source.stopOnError !== undefined ? { stopOnError: source.stopOnError === true } : {}),
        items: rawItems.map((item, index) => normalizeCreateNotesBulkItem(item, index)),
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
    case "list_tasks": {
      const limit = Number(source.limit || 30);
      return {
        ...(source.status !== undefined
          ? { status: normalizeTaskStatus(source.status, { allowAll: true, allowEmpty: true }) || "all" }
          : {}),
        limit: Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 30,
      };
    }
    case "create_task": {
      return normalizeTaskDraftArgs(source, { toolName: "create_task", includeConfirmed: true });
    }
    case "propose_task": {
      return normalizeTaskDraftArgs(source, { toolName: "propose_task", includeConfirmed: false });
    }
    case "update_task": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("update_task requires id");

      const patch = {
        id,
      };
      if (source.title !== undefined || source.name !== undefined) {
        patch.title = normalizeText(source.title || source.name);
      }
      if (source.prompt !== undefined) {
        patch.prompt = normalizeText(source.prompt);
      }
      if (source.scopeFolder !== undefined || source.project !== undefined) {
        patch.scopeFolder = normalizeText(source.scopeFolder || source.project);
      }
      if (source.scopeType !== undefined) {
        const scopeType = normalizeText(source.scopeType).toLowerCase();
        if (scopeType !== "workspace" && scopeType !== "folder") {
          throw new Error("update_task scopeType must be workspace or folder");
        }
        patch.scopeType = scopeType;
      }
      if (source.scheduleType !== undefined) {
        const scheduleType = normalizeText(source.scheduleType).toLowerCase();
        if (scheduleType !== "manual" && scheduleType !== "interval") {
          throw new Error("update_task scheduleType must be manual or interval");
        }
        patch.scheduleType = scheduleType;
      }
      if (source.intervalMinutes !== undefined) {
        patch.intervalMinutes = normalizePositiveInt(source.intervalMinutes, { min: 5, max: 10080 });
      }
      if (source.timezone !== undefined) {
        patch.timezone = normalizeText(source.timezone);
      }
      if (source.nextRunAt !== undefined) {
        patch.nextRunAt = normalizeIsoDateTime(source.nextRunAt, { fieldName: "update_task nextRunAt" });
      }
      if (source.maxActionsPerRun !== undefined) {
        patch.maxActionsPerRun = normalizePositiveInt(source.maxActionsPerRun, { min: 1, max: 25, required: true });
      }
      if (source.maxConsecutiveFailures !== undefined) {
        patch.maxConsecutiveFailures = normalizePositiveInt(source.maxConsecutiveFailures, { min: 1, max: 20, required: true });
      }
      if (source.dryRun !== undefined) {
        patch.dryRun = source.dryRun === true;
      }
      if (source.spec !== undefined) {
        const rawSpec = source.spec;
        if (rawSpec !== null && (typeof rawSpec !== "object" || Array.isArray(rawSpec))) {
          throw new Error("update_task spec must be an object");
        }
        patch.spec = rawSpec;
      }
      if (source.status !== undefined) {
        patch.status = normalizeTaskStatus(source.status);
      }

      if (Object.keys(patch).length < 2) {
        throw new Error("update_task requires at least one field to update");
      }
      return patch;
    }
    case "complete_task": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("complete_task requires id");
      return { id };
    }
    case "delete_task": {
      const id = normalizeText(source.id);
      if (!id) throw new Error("delete_task requires id");
      return { id };
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
    case "fetch_rss": {
      const urlText = normalizeText(source.url);
      if (!urlText) throw new Error("fetch_rss requires url");
      let parsed = null;
      try {
        parsed = new URL(urlText);
      } catch {
        throw new Error("fetch_rss url must be a valid absolute URL");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("fetch_rss supports only http(s) URLs");
      }
      const limitRaw = Number(source.limit || 12);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 12;
      return {
        url: parsed.toString(),
        limit,
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

function normalizeTaskStatus(value, { allowAll = false, allowEmpty = false } = {}) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return allowEmpty ? "" : "active";
  }
  if (allowAll && (normalized === "all" || normalized === "any")) return "";
  if (["pending", "pending_approval", "approval"].includes(normalized)) return "pending_approval";
  if (["open", "active", "running"].includes(normalized)) return "active";
  if (["paused", "inactive", "closed", "complete", "completed", "done"].includes(normalized)) return "paused";
  throw new Error("Invalid task status");
}

function normalizePositiveInt(value, { min = 1, max = 10080, required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error("Expected positive integer");
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Expected positive integer");
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeCreateNotesBulkItem(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`create_notes_bulk item at index ${index} must be an object`);
  }

  const content = normalizeText(item.content);
  const imageDataUrl = normalizeText(item.imageDataUrl);
  const fileDataUrl = normalizeText(item.fileDataUrl);
  const hasAttachment = Boolean(imageDataUrl || fileDataUrl);
  if (!content && !hasAttachment) {
    throw new Error(`create_notes_bulk item at index ${index} requires content or an attachment`);
  }

  return {
    content,
    title: normalizeText(item.title),
    project: normalizeText(item.project),
    sourceType: normalizeChatSourceType(item.sourceType),
    sourceUrl: normalizeText(item.sourceUrl),
    imageDataUrl,
    fileDataUrl,
    fileName: normalizeText(item.fileName),
    fileMimeType: normalizeText(item.fileMimeType),
  };
}
