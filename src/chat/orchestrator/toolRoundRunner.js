import { writeSseEvent } from "./sseEvents.js";

function parseToolNoteId(rawArgs) {
  try {
    const parsed = JSON.parse(String(rawArgs || "{}"));
    return String(parsed?.id || "").trim();
  } catch {
    return "";
  }
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
    writeSseEvent(res, "tool_call", {
      name: toolCall.name,
      status: "executing",
      ...(toolNoteId ? { noteId: toolNoteId } : {}),
    });
    const execution = await harness.runToolCall({
      name: toolCall.name,
      rawArgs: toolCall.args,
      callId: toolCall.callId,
      round,
    });
    writeSseEvent(res, "tool_result", {
      name: toolCall.name,
      ...(toolNoteId ? { noteId: toolNoteId } : {}),
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
