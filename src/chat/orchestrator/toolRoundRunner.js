import { writeSseEvent } from "./sseEvents.js";

function parseToolNoteId(rawArgs) {
  try {
    const parsed = JSON.parse(String(rawArgs || "{}"));
    return String(parsed?.id || "").trim();
  } catch {
    return "";
  }
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

export async function runPendingToolCalls({
  pendingToolCalls,
  harness,
  res,
  round,
}) {
  const toolOutputs = [];

  for (const toolCall of pendingToolCalls) {
    const toolNoteId = parseToolNoteId(toolCall.args);
    const toolCallNoteId = isCitationAliasNoteId(toolNoteId) ? "" : toolNoteId;
    const patchPreview = parseToolCallPatchPreview(toolCall.name, toolCall.args);
    writeSseEvent(res, "tool_call", {
      name: toolCall.name,
      status: "executing",
      ...(toolCallNoteId ? { noteId: toolCallNoteId } : {}),
      ...(patchPreview ? { patch: patchPreview } : {}),
    });
    const execution = await harness.runToolCall({
      name: toolCall.name,
      rawArgs: toolCall.args,
      callId: toolCall.callId,
      round,
    });
    const resultNoteId = execution.ok ? String(execution.result?.noteId || "").trim() : "";
    const toolResultNoteId = resultNoteId || toolCallNoteId;
    writeSseEvent(res, "tool_result", {
      name: toolCall.name,
      ...(toolResultNoteId ? { noteId: toolResultNoteId } : {}),
      ...(execution.ok
        ? { result: execution.result }
        : { error: execution.error || "Tool call failed" }),
      traceId: execution.trace?.traceId || "",
      cacheHit: Boolean(execution.trace?.cacheHit),
      durationMs: Number(execution.trace?.durationMs || 0),
    });
    writeSseEvent(res, "tool_trace", execution.trace || null);

    toolOutputs.push({
      type: "function_call_output",
      call_id: toolCall.callId,
      output: JSON.stringify(execution.ok ? execution.result : { error: execution.error || "Tool call failed" }),
    });
  }

  return { toolOutputs };
}
