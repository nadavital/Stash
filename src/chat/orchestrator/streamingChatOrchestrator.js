import { parseStreamingResponse } from "./streamingResponseParser.js";
import { writeSseEvent } from "./sseEvents.js";
import { runPendingToolCalls } from "./toolRoundRunner.js";

export async function runStreamingChatOrchestrator({
  res,
  createStreamingResponse,
  extractOutputUrlCitations,
  responseTools,
  responseInclude,
  harness,
  initialInput,
  initialInstructions,
  maxToolRounds = 3,
  temperature = 0.2,
}) {
  const parsedRoundLimit = Number(maxToolRounds);
  const normalizedMaxToolRounds =
    Number.isFinite(parsedRoundLimit) && parsedRoundLimit >= 0 ? Math.floor(parsedRoundLimit) : 3;
  let currentInput = initialInput;
  let currentInstructions = initialInstructions;
  let currentPreviousId = undefined;
  let toolRounds = 0;

  while (true) {
    const streamResponse = await createStreamingResponse({
      instructions: currentInstructions,
      input: currentInput,
      tools: responseTools,
      include: responseInclude,
      previousResponseId: currentPreviousId,
      temperature,
    });

    const roundResult = await parseStreamingResponse({
      streamResponse,
      res,
      extractOutputUrlCitations,
      maxWebSources: 16,
    });

    if (roundResult.webSources.length > 0) {
      writeSseEvent(res, "web_sources", { webSources: roundResult.webSources });
    }
    if (roundResult.webSearchCalls.length > 0) {
      writeSseEvent(res, "web_search_trace", { webSearchCalls: roundResult.webSearchCalls });
    }

    if (roundResult.pendingToolCalls.length === 0) {
      break;
    }

    if (toolRounds >= normalizedMaxToolRounds) {
      writeSseEvent(res, "debug_error", {
        code: "tool_round_limit_reached",
        message: "Tool round limit reached before pending tool calls were resolved",
        maxToolRounds: normalizedMaxToolRounds,
        pendingToolCalls: roundResult.pendingToolCalls.length,
      });
      break;
    }

    const { toolOutputs } = await runPendingToolCalls({
      pendingToolCalls: roundResult.pendingToolCalls,
      harness,
      res,
      round: toolRounds,
    });

    // If this round only asks a user follow-up, stop here and let the client
    // render the structured follow-up card without a duplicated assistant echo.
    const onlyAskUserQuestion =
      roundResult.pendingToolCalls.length > 0 &&
      roundResult.pendingToolCalls.every((toolCall) => String(toolCall?.name || "").trim() === "ask_user_question");
    if (onlyAskUserQuestion) {
      break;
    }

    currentPreviousId = roundResult.responseId;
    currentInput = toolOutputs;
    currentInstructions = undefined;
    toolRounds++;
  }

  writeSseEvent(res, "tool_trace", {
    requestId: harness.requestId,
    traces: harness.traces,
  });
  writeSseEvent(res, "done", { done: true });
}
