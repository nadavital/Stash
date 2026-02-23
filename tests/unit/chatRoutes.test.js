import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleChatRoutes } from "../../src/routes/chatRoutes.js";

function createSseResponseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    ended: false,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    write(chunk) {
      this.chunks.push(String(chunk || ""));
    },
    end() {
      this.ended = true;
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

describe("handleChatRoutes", () => {
  it("passes structured recent chat history into streaming model input", async () => {
    const capturedCalls = [];
    const recentMessages = [
      { role: "user", text: "find coffee shops" },
      { role: "assistant", text: "What city?" },
      { role: "user", text: "palo alto" },
    ];
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-1" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "midtown?",
        recentMessages,
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      isLikelyExternalInfoRequest: () => true,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async (payload) => {
        capturedCalls.push(payload);
        return createStreamingStub([
          `data: ${JSON.stringify({ type: "response.created", response: { id: "resp-1" } })}\n`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "ok" })}\n`,
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness: () => ({
        requestId: "req-1",
        traces: [],
        runToolCall: async () => ({ ok: true, result: {}, trace: {} }),
      }),
      resolveAgentToolArgs: () => ({}),
      executeChatToolCall: async () => ({}),
      logger: { error: () => {} },
      buildAgentNoteTitle: () => "item",
      createMemory: async () => ({}),
      askMemories: async () => ({}),
      buildProjectContext: async () => ({}),
    });

    assert.equal(handled, true);
    assert.equal(capturedCalls.length, 1);
    const payload = capturedCalls[0];
    assert.equal(Array.isArray(payload.input), true);
    assert.equal(payload.input.length, 4);
    assert.equal(payload.input[0].role, "user");
    assert.equal(payload.input[1].role, "assistant");
    assert.equal(payload.input[2].role, "user");
    assert.equal(payload.input[3].role, "user");
    assert.equal(payload.input[3].content?.[0]?.text?.includes("midtown?"), true);
    assert.equal(res.ended, true);
  });
});
