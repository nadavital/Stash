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
  let currentInput = initialInput;
  let currentInstructions = initialInstructions;
  let currentPreviousId = undefined;
  let toolRounds = 0;

  while (toolRounds <= maxToolRounds) {
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

    if (roundResult.pendingToolCalls.length === 0) {
      break;
    }

    const { toolOutputs } = await runPendingToolCalls({
      pendingToolCalls: roundResult.pendingToolCalls,
      harness,
      res,
      round: toolRounds,
    });

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
