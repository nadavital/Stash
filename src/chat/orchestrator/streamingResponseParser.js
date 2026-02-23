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
  let currentToolCall = null;
  let webSources = [];

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
        } else if (parsed.type === "response.output_item.added" && parsed.item?.type === "function_call") {
          currentToolCall = { callId: parsed.item.call_id, name: parsed.item.name, args: "" };
        } else if (parsed.type === "response.function_call_arguments.delta") {
          if (currentToolCall) currentToolCall.args += parsed.delta || "";
        } else if (parsed.type === "response.output_item.done" && parsed.item?.type === "function_call") {
          if (currentToolCall) {
            currentToolCall.args = parsed.item.arguments || currentToolCall.args;
            pendingToolCalls.push(currentToolCall);
            currentToolCall = null;
          }
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
  };
}
