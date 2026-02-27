import { writeSseEvent } from "./sseEvents.js";

function parseRawArgs(rawArgs) {
  try {
    const parsed = JSON.parse(String(rawArgs || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseToolNoteId(rawArgs) {
  const parsed = parseRawArgs(rawArgs);
  return String(parsed?.id || "").trim();
}

function isCitationAliasNoteId(value = "") {
  return /^N\d+$/i.test(String(value || "").trim());
}

function parseToolCallPatchPreview(toolName, rawArgs) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(rawArgs || "{}"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  if (toolName === "update_note") {
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(parsed, "title")) patch.title = String(parsed.title || "").trim();
    if (Object.prototype.hasOwnProperty.call(parsed, "content")) patch.content = String(parsed.content || "");
    if (Object.prototype.hasOwnProperty.call(parsed, "summary")) patch.summary = String(parsed.summary || "");
    if (Object.prototype.hasOwnProperty.call(parsed, "tags")) {
      patch.tags = Array.isArray(parsed.tags)
        ? parsed.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
        : [];
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "project")) patch.project = String(parsed.project || "").trim();
    return Object.keys(patch).length > 0 ? patch : null;
  }

  if (toolName === "update_note_markdown") {
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(parsed, "content")) patch.content = String(parsed.content || "");
    if (Object.prototype.hasOwnProperty.call(parsed, "rawContent")) patch.rawContent = String(parsed.rawContent || "");
    if (Object.prototype.hasOwnProperty.call(parsed, "markdownContent")) patch.markdownContent = String(parsed.markdownContent || "");
    return Object.keys(patch).length > 0 ? patch : null;
  }

  return null;
}

function parseBaseRevision(args = {}) {
  const value = Number(args?.baseRevision);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function parseNextRevision({ patch = null, result = null } = {}) {
  const patchRevision = Number(patch?.revision);
  if (Number.isFinite(patchRevision) && patchRevision > 0) {
    return Math.floor(patchRevision);
  }
  const resultRevision = Number(result?.revision);
  if (Number.isFinite(resultRevision) && resultRevision > 0) {
    return Math.floor(resultRevision);
  }
  return null;
}

function mapMutationDescriptor(toolName = "") {
  const normalized = String(toolName || "").trim().toLowerCase();
  switch (normalized) {
    case "create_note":
      return { entityType: "note", mutationType: "note.create" };
    case "update_note":
      return { entityType: "note", mutationType: "note.update" };
    case "update_note_markdown":
      return { entityType: "note", mutationType: "note.content.update" };
    case "update_note_attachment":
      return { entityType: "note", mutationType: "note.attachment.update" };
    case "add_note_comment":
      return { entityType: "note", mutationType: "note.comment.add" };
    case "restore_note_version":
      return { entityType: "note", mutationType: "note.version.restore" };
    case "retry_note_enrichment":
      return { entityType: "note", mutationType: "note.enrichment.retry" };
    case "delete_note":
      return { entityType: "note", mutationType: "note.delete" };
    case "create_folder":
      return { entityType: "folder", mutationType: "folder.create" };
    case "set_folder_collaborator":
      return { entityType: "folder", mutationType: "folder.collaborator.set" };
    case "remove_folder_collaborator":
      return { entityType: "folder", mutationType: "folder.collaborator.remove" };
    case "update_folder":
      return { entityType: "folder", mutationType: "folder.update" };
    case "delete_folder":
      return { entityType: "folder", mutationType: "folder.delete" };
    case "create_task":
      return { entityType: "task", mutationType: "task.create" };
    case "update_task":
      return { entityType: "task", mutationType: "task.update" };
    case "complete_task":
      return { entityType: "task", mutationType: "task.pause" };
    case "delete_task":
      return { entityType: "task", mutationType: "task.delete" };
    default:
      return null;
  }
}

function buildMutationPatch(toolName = "", args = {}, executionResult = null, patchPreview = null) {
  const resultPatch = executionResult?.patch && typeof executionResult.patch === "object"
    ? executionResult.patch
    : null;
  if (resultPatch) return resultPatch;
  if (patchPreview) return patchPreview;

  const normalized = String(toolName || "").trim().toLowerCase();
  if (normalized === "create_note") {
    const patch = {};
    if (typeof args.title === "string" && args.title.trim()) patch.title = String(args.title).trim();
    if (typeof args.content === "string") patch.content = String(args.content);
    if (typeof args.project === "string") patch.project = String(args.project).trim();
    if (typeof executionResult?.sourceType === "string" && executionResult.sourceType.trim()) {
      patch.sourceType = String(executionResult.sourceType).trim();
    }
    return Object.keys(patch).length > 0 ? patch : null;
  }
  if (normalized === "create_folder") {
    const patch = {};
    if (typeof executionResult?.name === "string" && executionResult.name.trim()) {
      patch.name = String(executionResult.name).trim();
    } else if (typeof args.name === "string" && args.name.trim()) {
      patch.name = String(args.name).trim();
    }
    return Object.keys(patch).length > 0 ? patch : null;
  }
  if (normalized === "create_task" || normalized === "update_task" || normalized === "complete_task") {
    const task = executionResult?.task && typeof executionResult.task === "object" ? executionResult.task : null;
    if (!task) return null;
    const patch = {};
    if (typeof task.title === "string") patch.title = String(task.title);
    if (typeof task.prompt === "string") patch.prompt = String(task.prompt);
    if (typeof task.scopeFolder === "string") patch.scopeFolder = String(task.scopeFolder);
    if (typeof task.scheduleType === "string") patch.scheduleType = String(task.scheduleType);
    if (typeof task.intervalMinutes === "number") patch.intervalMinutes = Number(task.intervalMinutes);
    if (typeof task.approvalStatus === "string") patch.approvalStatus = String(task.approvalStatus);
    if (typeof task.status === "string") patch.status = String(task.status);
    if (typeof task.state === "string") patch.state = String(task.state);
    if (typeof task.createdAt === "string") patch.createdAt = String(task.createdAt);
    if (typeof task.nextRunAt === "string") patch.nextRunAt = String(task.nextRunAt);
    return Object.keys(patch).length > 0 ? patch : null;
  }
  if (normalized === "delete_task") {
    if (executionResult && typeof executionResult === "object" && executionResult.deleted === true) {
      return {
        deleted: true,
      };
    }
    return null;
  }
  if (normalized === "update_note_attachment") {
    const patch = {};
    if (typeof args.content === "string") patch.content = String(args.content);
    if (typeof executionResult?.fileName === "string" && executionResult.fileName) {
      patch.fileName = String(executionResult.fileName);
    }
    if (typeof executionResult?.sourceType === "string" && executionResult.sourceType) {
      patch.sourceType = String(executionResult.sourceType);
    }
    if (typeof executionResult?.status === "string" && executionResult.status) {
      patch.status = String(executionResult.status);
    }
    return Object.keys(patch).length > 0 ? patch : null;
  }
  return null;
}

function resolveEntityId(descriptor = null, args = {}, executionResult = null, toolCallNoteId = "") {
  if (!descriptor) return "";
  if (descriptor.entityType === "note") {
    const fromResult = String(executionResult?.noteId || "").trim();
    if (fromResult) return fromResult;
    const fromArgs = String(args?.id || toolCallNoteId || "").trim();
    return isCitationAliasNoteId(fromArgs) ? "" : fromArgs;
  }
  if (descriptor.entityType === "folder") {
    const fromResult = String(executionResult?.folderId || "").trim();
    if (fromResult) return fromResult;
    return String(args?.folderId || "").trim();
  }
  if (descriptor.entityType === "task") {
    const fromResult = String(executionResult?.task?.id || executionResult?.id || "").trim();
    if (fromResult) return fromResult;
    return String(args?.id || "").trim();
  }
  return "";
}

function emitWorkspaceAction(res, eventType, payload) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  writeSseEvent(res, eventType, safePayload);
}

export async function runPendingToolCalls({
  pendingToolCalls,
  harness,
  res,
  round,
}) {
  const toolOutputs = [];

  for (const toolCall of pendingToolCalls) {
    const parsedArgs = parseRawArgs(toolCall.args);
    const toolNoteId = parseToolNoteId(toolCall.args);
    const toolCallNoteId = isCitationAliasNoteId(toolNoteId) ? "" : toolNoteId;
    const patchPreview = parseToolCallPatchPreview(toolCall.name, toolCall.args);
    const actionId = `${String(harness.requestId || "").trim()}:${Number(round) || 0}:${String(toolCall.callId || toolCall.name || "tool").trim()}`;
    const descriptor = mapMutationDescriptor(toolCall.name);
    const baseRevision = parseBaseRevision(parsedArgs);
    const actor = harness?.actor && typeof harness.actor === "object"
      ? {
          userId: String(harness.actor.userId || "").trim(),
          workspaceId: String(harness.actor.workspaceId || "").trim(),
          role: String(harness.actor.role || "").trim(),
        }
      : null;

    writeSseEvent(res, "tool_call", {
      actionId,
      name: toolCall.name,
      status: "executing",
      ...(toolCallNoteId ? { noteId: toolCallNoteId } : {}),
      ...(patchPreview ? { patch: patchPreview } : {}),
    });
    if (descriptor) {
      const entityId = resolveEntityId(descriptor, parsedArgs, null, toolCallNoteId);
      const payload = {
        actionId,
        entityType: descriptor.entityType,
        entityId,
        mutationType: descriptor.mutationType,
        patch: patchPreview || null,
        baseRevision,
        nextRevision: null,
        actor,
        name: toolCall.name,
        phase: "start",
      };
      emitWorkspaceAction(res, "workspace_action_start", payload);
      emitWorkspaceAction(res, "workspace_action_progress", {
        ...payload,
        phase: "progress",
        status: "executing",
      });
    }

    const execution = await harness.runToolCall({
      name: toolCall.name,
      rawArgs: toolCall.args,
      callId: toolCall.callId,
      round,
    });
    const resultNoteId = execution.ok ? String(execution.result?.noteId || "").trim() : "";
    const toolResultNoteId = resultNoteId || toolCallNoteId;
    writeSseEvent(res, "tool_result", {
      actionId,
      name: toolCall.name,
      ...(toolResultNoteId ? { noteId: toolResultNoteId } : {}),
      ...(execution.ok
        ? { result: execution.result }
        : { error: execution.error || "Tool call failed" }),
      traceId: execution.trace?.traceId || "",
      cacheHit: Boolean(execution.trace?.cacheHit),
      durationMs: Number(execution.trace?.durationMs || 0),
    });
    if (descriptor) {
      const executionResult = execution.ok && execution.result && typeof execution.result === "object"
        ? execution.result
        : null;
      const patch = buildMutationPatch(toolCall.name, parsedArgs, executionResult, patchPreview);
      const nextRevision = parseNextRevision({ patch, result: executionResult });
      const entityId = resolveEntityId(descriptor, parsedArgs, executionResult, toolResultNoteId);
      const payload = {
        actionId,
        entityType: descriptor.entityType,
        entityId,
        mutationType: descriptor.mutationType,
        patch: patch || null,
        baseRevision,
        nextRevision,
        actor,
        name: toolCall.name,
        ...(executionResult ? { result: executionResult } : {}),
      };
      if (execution.ok) {
        emitWorkspaceAction(res, "workspace_action_commit", {
          ...payload,
          phase: "commit",
        });
      } else {
        emitWorkspaceAction(res, "workspace_action_error", {
          ...payload,
          phase: "error",
          error: execution.error || "Tool call failed",
        });
      }
    }
    writeSseEvent(res, "tool_trace", execution.trace || null);

    toolOutputs.push({
      type: "function_call_output",
      call_id: toolCall.callId,
      output: JSON.stringify(execution.ok ? execution.result : { error: execution.error || "Tool call failed" }),
    });
  }

  return { toolOutputs };
}
