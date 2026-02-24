import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStreamingResponse } from "../../src/chat/orchestrator/streamingResponseParser.js";
import { runStreamingChatOrchestrator } from "../../src/chat/orchestrator/streamingChatOrchestrator.js";

function createSseResponseRecorder() {
  return {
    chunks: [],
    write(chunk) {
      this.chunks.push(String(chunk || ""));
    },
  };
}

function createStreamingStub(events = []) {
  return {
    body: {
      async *[Symbol.asyncIterator]() {
        for (const entry of events) {
          yield entry;
        }
      },
    },
  };
}

function encodeEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n`;
}

describe("streaming orchestrator + parser", () => {
  it("parses interleaved function-call argument deltas by item id", async () => {
    const res = createSseResponseRecorder();
    const streamResponse = createStreamingStub([
      encodeEvent({ type: "response.created", response: { id: "resp-1" } }),
      encodeEvent({
        type: "response.output_item.added",
        item: { id: "item-1", type: "function_call", call_id: "call-1", name: "search_notes" },
      }),
      encodeEvent({
        type: "response.output_item.added",
        item: { id: "item-2", type: "function_call", call_id: "call-2", name: "get_note_raw_content" },
      }),
      encodeEvent({ type: "response.function_call_arguments.delta", item_id: "item-1", delta: "{\"query\":\"plan" }),
      encodeEvent({ type: "response.function_call_arguments.delta", item_id: "item-2", delta: "{\"id\":\"note-2\"}" }),
      encodeEvent({ type: "response.function_call_arguments.delta", item_id: "item-1", delta: "ning\"}" }),
      encodeEvent({
        type: "response.output_item.done",
        item: { id: "item-2", type: "function_call", call_id: "call-2", name: "get_note_raw_content" },
      }),
      encodeEvent({
        type: "response.output_item.done",
        item: { id: "item-1", type: "function_call", call_id: "call-1", name: "search_notes" },
      }),
      "data: [DONE]\n",
    ]);

    const parsed = await parseStreamingResponse({
      streamResponse,
      res,
      extractOutputUrlCitations: () => [],
    });

    assert.equal(parsed.responseId, "resp-1");
    assert.deepEqual(
      parsed.pendingToolCalls.map((toolCall) => toolCall.callId),
      ["call-2", "call-1"],
    );
    assert.equal(parsed.pendingToolCalls[0]?.args, "{\"id\":\"note-2\"}");
    assert.equal(parsed.pendingToolCalls[1]?.args, "{\"query\":\"planning\"}");
  });

  it("stops executing tool rounds once maxToolRounds is reached", async () => {
    const res = createSseResponseRecorder();
    let responseCalls = 0;
    let toolCalls = 0;
    const harness = {
      requestId: "req-1",
      traces: [],
      runToolCall: async () => {
        toolCalls += 1;
        return {
          ok: true,
          result: { ok: true },
          trace: { traceId: `trace-${toolCalls}`, cacheHit: false, durationMs: 1 },
        };
      },
    };

    await runStreamingChatOrchestrator({
      res,
      createStreamingResponse: async () => {
        responseCalls += 1;
        const index = responseCalls;
        return createStreamingStub([
          encodeEvent({ type: "response.created", response: { id: `resp-${index}` } }),
          encodeEvent({
            type: "response.output_item.added",
            item: { id: `item-${index}`, type: "function_call", call_id: `call-${index}`, name: "search_notes" },
          }),
          encodeEvent({
            type: "response.output_item.done",
            item: {
              id: `item-${index}`,
              type: "function_call",
              call_id: `call-${index}`,
              name: "search_notes",
              arguments: "{\"query\":\"roadmap\"}",
            },
          }),
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      responseTools: [],
      responseInclude: undefined,
      harness,
      initialInput: [],
      initialInstructions: "Test",
      maxToolRounds: 2,
      temperature: 0,
    });

    assert.equal(toolCalls, 2);
    assert.equal(responseCalls, 3);
    const output = res.chunks.join("");
    assert.match(output, /tool_round_limit_reached/);
    assert.match(output, /event:\s*done/);
  });
});
