import { writeSseEvent } from "./sseEvents.js";

export async function parseStreamingResponse({
  streamResponse,
  res,
  extractOutputUrlCitations,
  maxWebSources = 16,
}) {
  const reader = streamResponse.body;
  const decoder = new TextDecoder();
  let buffer = "";
  let responseId = "";
  const pendingToolCalls = [];
  const activeToolCallsByCallId = new Map();
  const activeToolCallsByItemId = new Map();
  let webSources = [];
  let webSearchCalls = [];

  function toFiniteCount(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
  }

  function extractWebSearchCalls(response = {}) {
    const output = Array.isArray(response?.output) ? response.output : [];
    const calls = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      if (String(item.type || "").trim() !== "web_search_call") continue;
      const action = item.action && typeof item.action === "object" ? item.action : {};
      const sources = Array.isArray(action.sources) ? action.sources : [];
      calls.push({
        id: normalizeId(item.id),
        status: normalizeId(item.status).toLowerCase() || "completed",
        query: normalizeId(action.query || item.query),
        sourceCount: toFiniteCount(sources.length, 0),
      });
      if (calls.length >= 12) break;
    }
    return calls;
  }

  function normalizeId(value = "") {
    return String(value || "").trim();
  }

  function registerToolCall(toolCall) {
    const callId = normalizeId(toolCall?.callId);
    const itemId = normalizeId(toolCall?.itemId);
    if (callId) activeToolCallsByCallId.set(callId, toolCall);
    if (itemId) activeToolCallsByItemId.set(itemId, toolCall);
  }

  function unregisterToolCall(toolCall) {
    if (!toolCall || typeof toolCall !== "object") return;
    const callId = normalizeId(toolCall.callId);
    const itemId = normalizeId(toolCall.itemId);
    if (callId) activeToolCallsByCallId.delete(callId);
    if (itemId) activeToolCallsByItemId.delete(itemId);
  }

  function resolveToolCall({ callId = "", itemId = "" } = {}) {
    const normalizedCallId = normalizeId(callId);
    const normalizedItemId = normalizeId(itemId);
    if (normalizedItemId && activeToolCallsByItemId.has(normalizedItemId)) {
      return activeToolCallsByItemId.get(normalizedItemId);
    }
    if (normalizedCallId && activeToolCallsByCallId.has(normalizedCallId)) {
      return activeToolCallsByCallId.get(normalizedCallId);
    }
    if (activeToolCallsByCallId.size === 1) {
      return activeToolCallsByCallId.values().next().value || null;
    }
    return null;
  }

  for await (const chunk of reader) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk);
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "response.created") {
          responseId = parsed.response?.id || "";
        } else if (parsed.type === "response.output_text.delta" && parsed.delta) {
          writeSseEvent(res, "token", { token: parsed.delta });
        } else if (parsed.type === "response.completed" && parsed.response) {
          const sources = extractOutputUrlCitations(parsed.response, maxWebSources);
          if (sources.length > 0) {
            webSources = sources;
          }
          const searches = extractWebSearchCalls(parsed.response);
          if (searches.length > 0) {
            webSearchCalls = searches;
          }
        } else if (parsed.type === "response.output_item.added" && parsed.item?.type === "function_call") {
          const toolCall = {
            callId: normalizeId(parsed.item.call_id),
            itemId: normalizeId(parsed.item.id),
            name: normalizeId(parsed.item.name),
            args: "",
          };
          registerToolCall(toolCall);
        } else if (parsed.type === "response.function_call_arguments.delta") {
          const toolCall = resolveToolCall({
            callId: parsed.call_id,
            itemId: parsed.item_id,
          });
          if (toolCall) {
            toolCall.args += parsed.delta || "";
          }
        } else if (parsed.type === "response.output_item.done" && parsed.item?.type === "function_call") {
          const doneCallId = normalizeId(parsed.item.call_id);
          const doneItemId = normalizeId(parsed.item.id);
          const existingToolCall = resolveToolCall({
            callId: doneCallId,
            itemId: doneItemId,
          });
          const toolCall = existingToolCall || {
            callId: doneCallId,
            itemId: doneItemId,
            name: normalizeId(parsed.item.name),
            args: "",
          };
          const finalArgs = normalizeId(parsed.item.arguments) || toolCall.args;
          const finalCallId = normalizeId(toolCall.callId) || doneCallId;
          const finalName = normalizeId(toolCall.name) || normalizeId(parsed.item.name);
          pendingToolCalls.push({
            callId: finalCallId,
            name: finalName,
            args: finalArgs,
          });
          unregisterToolCall(toolCall);
        }
      } catch {
        // skip non-JSON lines
      }
    }
  }

  return {
    responseId,
    pendingToolCalls,
    webSources,
    webSearchCalls,
  };
}
