import crypto from "node:crypto";
import { logger } from "./logger.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeChatSourceType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return "";
  if (normalized === "url" || normalized === "link") return "link";
  if (normalized === "file" || normalized === "image") return normalized;
  if (normalized === "manual" || normalized === "text") return "text";
  return "";
}

function normalizeStringArray(rawValue, max = 50) {
  const values = Array.isArray(rawValue) ? rawValue : [];
  const output = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    output.push(normalized);
    if (output.length >= max) break;
  }
  return output;
}

function normalizeSingleSentence(value, maxLen = 140) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const firstQuestion = text.match(/[^?]{1,300}\?/);
  if (firstQuestion?.[0]) {
    return firstQuestion[0].trim().slice(0, maxLen);
  }
  const firstSentence = text.split(/[.!](?:\s|$)/)[0] || text;
  return firstSentence.trim().slice(0, maxLen);
}

const MEMORY_SCOPES = new Set(["all", "workspace", "user", "project", "item"]);

function normalizeMemoryScope(value) {
  const normalized = normalizeText(value).toLowerCase();
  return MEMORY_SCOPES.has(normalized) ? normalized : "";
}

function normalizeWorkingSetIds(rawValue, max = 50) {
  const values = Array.isArray(rawValue) ? rawValue : [];
  const ids = [];
  const seen = new Set();
  for (const value of values) {
    const id = normalizeText(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}

const FOLDER_ROLES = new Set(["viewer", "editor", "manager"]);

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (!isPlainObject(value)) return JSON.stringify(String(value));

  const keys = Object.keys(value).sort();
  const parts = [];
  for (const key of keys) {
    parts.push(`${JSON.stringify(key)}:${stableStringify(value[key])}`);
  }
  return `{${parts.join(",")}}`;
}

function parseRawArgs(rawArgs) {
  if (typeof rawArgs === "string") {
    const trimmed = rawArgs.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      throw new Error("Tool arguments must be a JSON object");
    }
    return parsed;
  }
  if (isPlainObject(rawArgs)) {
    return rawArgs;
  }
  return {};
}

function normalizeToolArgs(name, args) {
  const normalizedName = normalizeText(name);
  const source = isPlainObject(args) ? args : {};

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
      const options = [];
      const seen = new Set();
      rawOptions.forEach((option) => {
        const key = option.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        options.push(option);
      });
      return {
        question,
        options,
        allowFreeform: source.allowFreeform !== false,
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

export function createAgentToolHarness({ actor = null, requestId = "", executeTool, resolveArgs = null } = {}) {
  if (typeof executeTool !== "function") {
    throw new Error("createAgentToolHarness requires executeTool(name, args, actor)");
  }

  const idempotencyCache = new Map();
  const traces = [];
  const normalizedRequestId = normalizeText(requestId) || crypto.randomUUID();

  async function runToolCall({ name, rawArgs, callId = "", round = 0 } = {}) {
    const traceId = crypto.randomUUID();
    const startedAtMs = Date.now();
    const normalizedName = normalizeText(name);

    let parsedArgs = {};
    let resolvedArgs = {};
    let normalizedArgs = {};
    let idempotencyKey = "";
    try {
      parsedArgs = parseRawArgs(rawArgs);
      if (typeof resolveArgs === "function") {
        const maybeResolved = await resolveArgs(normalizedName, parsedArgs, {
          actor,
          requestId: normalizedRequestId,
          callId: normalizeText(callId),
          round: Number(round) || 0,
        });
        resolvedArgs = isPlainObject(maybeResolved) ? maybeResolved : parsedArgs;
      } else {
        resolvedArgs = parsedArgs;
      }
      normalizedArgs = normalizeToolArgs(normalizedName, resolvedArgs);
      idempotencyKey = `${normalizedName}:${stableStringify(normalizedArgs)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = {
        traceId,
        requestId: normalizedRequestId,
        callId: normalizeText(callId),
        round: Number(round) || 0,
        name: normalizedName,
        idempotencyKey: "",
        cacheHit: false,
        status: "validation_error",
        error: message,
        durationMs: Date.now() - startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date().toISOString(),
      };
      traces.push(trace);
      logger.warn("agent_tool_validation_failed", trace);
      return {
        ok: false,
        error: message,
        trace,
      };
    }

    if (idempotencyCache.has(idempotencyKey)) {
      const cachedResult = idempotencyCache.get(idempotencyKey);
      const trace = {
        traceId,
        requestId: normalizedRequestId,
        callId: normalizeText(callId),
        round: Number(round) || 0,
        name: normalizedName,
        idempotencyKey,
        cacheHit: true,
        status: "success",
        error: "",
        durationMs: Date.now() - startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date().toISOString(),
      };
      traces.push(trace);
      logger.info("agent_tool_cache_hit", trace);
      return {
        ok: true,
        result: cachedResult,
        trace,
      };
    }

    try {
      const result = await executeTool(normalizedName, normalizedArgs, actor);
      idempotencyCache.set(idempotencyKey, result);
      const trace = {
        traceId,
        requestId: normalizedRequestId,
        callId: normalizeText(callId),
        round: Number(round) || 0,
        name: normalizedName,
        idempotencyKey,
        cacheHit: false,
        status: "success",
        error: "",
        durationMs: Date.now() - startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date().toISOString(),
      };
      traces.push(trace);
      logger.info("agent_tool_executed", trace);
      return {
        ok: true,
        result,
        trace,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = {
        traceId,
        requestId: normalizedRequestId,
        callId: normalizeText(callId),
        round: Number(round) || 0,
        name: normalizedName,
        idempotencyKey,
        cacheHit: false,
        status: "error",
        error: message,
        durationMs: Date.now() - startedAtMs,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date().toISOString(),
      };
      traces.push(trace);
      logger.warn("agent_tool_failed", trace);
      return {
        ok: false,
        error: message,
        trace,
      };
    }
  }

  return {
    requestId: normalizedRequestId,
    traces,
    runToolCall,
  };
}
