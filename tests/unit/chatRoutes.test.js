import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleChatRoutes } from "../../src/routes/chatRoutes.js";
import { createAgentToolHarness } from "../../src/agentHarness.js";
import { buildTaskProposalSignature } from "../../src/chat/taskSetupPolicy.js";

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

function createFunctionCallStream({
  responseId = "resp-tool",
  callId = "call-1",
  itemId = "item-1",
  name = "create_task",
  args = {},
} = {}) {
  return createStreamingStub([
    `data: ${JSON.stringify({ type: "response.created", response: { id: responseId } })}\n`,
    `data: ${JSON.stringify({ type: "response.output_item.added", item: { type: "function_call", id: itemId, call_id: callId, name } })}\n`,
    `data: ${JSON.stringify({ type: "response.function_call_arguments.delta", item_id: itemId, call_id: callId, delta: JSON.stringify(args) })}\n`,
    `data: ${JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", id: itemId, call_id: callId, name, arguments: JSON.stringify(args) } })}\n`,
    `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
    "data: [DONE]\n",
  ]);
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
    assert.equal(payload.input[0].content?.[0]?.type, "input_text");
    assert.equal(payload.input[1].content?.[0]?.type, "output_text");
    assert.equal(payload.input[2].content?.[0]?.type, "input_text");
    assert.equal(payload.input[3].content?.[0]?.type, "input_text");
    assert.equal(payload.input[3].content?.[0]?.text?.includes("midtown?"), true);
    assert.equal(res.ended, true);
  });

  it("returns explicit retry fallback on streaming failures", async () => {
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-2" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "move this note to text files",
        recentMessages: [
          { role: "user", text: "move this note to a different folder" },
          { role: "assistant", text: "Which folder should I move this into?" },
        ],
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      isLikelyExternalInfoRequest: () => false,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [{ rank: 1, score: 1, note: { id: "n1", title: "Brainstorm Template" } }],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async () => {
        throw new Error("upstream timeout");
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness: () => ({
        requestId: "req-2",
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
    assert.equal(res.ended, true);
    const output = res.chunks.join("\n");
    assert.match(output, /event:\s*debug_error/i);
    assert.match(output, /chat_stream_failed/i);
    assert.match(output, /temporary issue while completing that/i);
    assert.equal(/Based on your saved notes/i.test(output), false);
  });

  it("injects item-edit commit guidance when item context is active", async () => {
    const capturedCalls = [];
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-3" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "populate this template with repo notes",
        contextNoteId: "note-123",
        project: "Text Files",
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: () => [],
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: {
        getNoteById: async () => ({
          id: "note-123",
          title: "Brainstorm Template",
          content: "# Brainstorm template",
          summary: "Template note",
          project: "Text Files",
          sourceUrl: "",
          metadata: { title: "Brainstorm Template" },
        }),
      },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async (payload) => {
        capturedCalls.push(payload);
        return createStreamingStub([
          `data: ${JSON.stringify({ type: "response.created", response: { id: "resp-3" } })}\n`,
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness: () => ({
        requestId: "req-3",
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
    const instructions = String(capturedCalls[0]?.instructions || "");
    assert.match(instructions, /apply the change to this item in the same turn with update_note or update_note_markdown/i);
    assert.equal(res.ended, true);
  });

  it("blocks create_task without explicit user confirmation", async () => {
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-4" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");
    let streamCallCount = 0;
    let createTaskCalls = 0;

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "can you schedule a daily digest",
        recentMessages: [],
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      inferUserTimezoneFromMessages: () => "America/Los_Angeles",
      isExplicitTaskCreationConfirmation: () => false,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async () => {
        streamCallCount += 1;
        if (streamCallCount === 1) {
          return createFunctionCallStream({
            responseId: "resp-4a",
            callId: "call-create",
            itemId: "item-create",
            name: "create_task",
            args: { title: "Daily digest", scheduleType: "interval", intervalMinutes: 1440 },
          });
        }
        return createStreamingStub([
          `data: ${JSON.stringify({ type: "response.created", response: { id: "resp-4b" } })}\n`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Need confirmation first." })}\n`,
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async (name) => {
        if (name === "create_task") createTaskCalls += 1;
        return {};
      },
      logger: { error: () => {} },
      config: { openaiWebSearchUserTimezone: "America/Los_Angeles" },
      buildAgentNoteTitle: () => "item",
      createMemory: async () => ({}),
      askMemories: async () => ({}),
      buildProjectContext: async () => ({}),
    });

    assert.equal(handled, true);
    assert.equal(createTaskCalls, 0);
    assert.equal(res.ended, true);
  });

  it("blocks workspace mutations during automation setup turns", async () => {
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-setup-mutation" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");
    let streamCallCount = 0;
    let createFolderCalls = 0;

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "set up a daily automation for me",
        recentMessages: [],
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async () => {
        streamCallCount += 1;
        if (streamCallCount === 1) {
          return createFunctionCallStream({
            responseId: "resp-setup-mutation-1",
            callId: "call-create-folder",
            itemId: "item-create-folder",
            name: "create_folder",
            args: { name: "Verge Daily" },
          });
        }
        return createStreamingStub([
          `data: ${JSON.stringify({ type: "response.created", response: { id: "resp-setup-mutation-2" } })}\n`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "I can propose the task first." })}\n`,
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async (name) => {
        if (name === "create_folder") createFolderCalls += 1;
        return {};
      },
      logger: { error: () => {} },
      config: { openaiWebSearchUserTimezone: "America/Los_Angeles" },
      buildAgentNoteTitle: () => "item",
      createMemory: async () => ({}),
      askMemories: async () => ({}),
      buildProjectContext: async () => ({}),
    });

    assert.equal(handled, true);
    assert.equal(createFolderCalls, 0);
    assert.equal(res.ended, true);
  });

  it("blocks workspace mutations after proposing a task in the same turn", async () => {
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-proposal-mutation" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");
    let streamCallCount = 0;
    let proposeTaskCalls = 0;
    let createNoteCalls = 0;

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "please do this",
        recentMessages: [],
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async () => {
        streamCallCount += 1;
        if (streamCallCount === 1) {
          return createFunctionCallStream({
            responseId: "resp-proposal-mutation-1",
            callId: "call-propose-task",
            itemId: "item-propose-task",
            name: "propose_task",
            args: { title: "Daily digest", scheduleType: "interval", intervalMinutes: 1440 },
          });
        }
        if (streamCallCount === 2) {
          return createFunctionCallStream({
            responseId: "resp-proposal-mutation-2",
            callId: "call-create-note",
            itemId: "item-create-note",
            name: "create_note",
            args: { content: "Premature write" },
          });
        }
        return createStreamingStub([
          `data: ${JSON.stringify({ type: "response.created", response: { id: "resp-proposal-mutation-3" } })}\n`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Ready for create confirmation." })}\n`,
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async (name) => {
        if (name === "propose_task") proposeTaskCalls += 1;
        if (name === "create_note") createNoteCalls += 1;
        return {};
      },
      logger: { error: () => {} },
      config: { openaiWebSearchUserTimezone: "America/Los_Angeles" },
      buildAgentNoteTitle: () => "item",
      createMemory: async () => ({}),
      askMemories: async () => ({}),
      buildProjectContext: async () => ({}),
    });

    assert.equal(handled, true);
    assert.equal(proposeTaskCalls, 1);
    assert.equal(createNoteCalls, 0);
    assert.equal(res.ended, true);
  });

  it("blocks create_task when proposal context is missing even after explicit confirmation", async () => {
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-5-missing-proposal" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");
    let streamCallCount = 0;
    let createTaskCalls = 0;

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "Create it",
        userTimezone: "America/Chicago",
        recentMessages: [
          { role: "assistant", text: "Draft ready. Create it or cancel?" },
        ],
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      normalizeIanaTimezone: (value) => String(value || "").trim(),
      inferUserTimezoneFromMessages: () => "America/Los_Angeles",
      inferTaskNextRunAtFromMessages: () => "2026-02-24T17:00:00.000Z",
      isExplicitTaskCreationConfirmation: () => true,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async () => {
        streamCallCount += 1;
        if (streamCallCount === 1) {
          return createFunctionCallStream({
            responseId: "resp-5-missing-proposal-a",
            callId: "call-create",
            itemId: "item-create",
            name: "create_task",
            args: { title: "Daily digest", scheduleType: "interval", intervalMinutes: 1440 },
          });
        }
        return createStreamingStub([
          `data: ${JSON.stringify({ type: "response.created", response: { id: "resp-5-missing-proposal-b" } })}\n`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Need an accepted proposal first." })}\n`,
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async (name) => {
        if (name === "create_task") createTaskCalls += 1;
        return {};
      },
      logger: { error: () => {} },
      config: { openaiWebSearchUserTimezone: "America/Los_Angeles" },
      buildAgentNoteTitle: () => "item",
      createMemory: async () => ({}),
      askMemories: async () => ({}),
      buildProjectContext: async () => ({}),
    });

    assert.equal(handled, true);
    assert.equal(createTaskCalls, 0);
    assert.equal(res.ended, true);
  });

  it("allows create_task after explicit user confirmation", async () => {
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-5" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");
    let streamCallCount = 0;
    let observedCreateArgs = null;
    const acceptedProposal = {
      title: "Daily digest",
      prompt: "Daily digest",
      scheduleType: "interval",
      intervalMinutes: 1440,
      timezone: "America/Chicago",
      nextRunAt: "2026-02-24T17:00:00.000Z",
      scopeFolder: "",
      maxActionsPerRun: 4,
      maxConsecutiveFailures: 3,
      dryRun: false,
    };
    const acceptedSignature = buildTaskProposalSignature(acceptedProposal);

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "Create it",
        userTimezone: "America/Chicago",
        recentMessages: [
          { role: "assistant", text: "Draft ready. Create it, revise details, or cancel?" },
        ],
        taskSetupContext: {
          acceptedProposal: {
            ...acceptedProposal,
            proposalSignature: acceptedSignature,
          },
        },
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      normalizeIanaTimezone: (value) => String(value || "").trim(),
      inferUserTimezoneFromMessages: () => "America/Los_Angeles",
      inferTaskNextRunAtFromMessages: () => "2026-02-24T17:00:00.000Z",
      isExplicitTaskCreationConfirmation: () => true,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async () => {
        streamCallCount += 1;
        if (streamCallCount === 1) {
          return createFunctionCallStream({
            responseId: "resp-5a",
            callId: "call-create",
            itemId: "item-create",
            name: "create_task",
            args: { title: "Daily digest", scheduleType: "interval", intervalMinutes: 1440 },
          });
        }
        return createStreamingStub([
          `data: ${JSON.stringify({ type: "response.created", response: { id: "resp-5b" } })}\n`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Saved." })}\n`,
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async (name, args) => {
        if (name === "create_task") {
          observedCreateArgs = args;
          return {
            task: {
              id: "task-1",
              title: args.title,
              scheduleType: args.scheduleType,
              intervalMinutes: args.intervalMinutes,
              timezone: args.timezone || "UTC",
              approvalStatus: "pending_approval",
              status: "paused",
              state: "pending_approval",
              createdAt: "2026-02-24T00:00:00.000Z",
            },
            approvalRequired: true,
          };
        }
        return {};
      },
      logger: { error: () => {} },
      config: { openaiWebSearchUserTimezone: "America/Los_Angeles" },
      buildAgentNoteTitle: () => "item",
      createMemory: async () => ({}),
      askMemories: async () => ({}),
      buildProjectContext: async () => ({}),
    });

    assert.equal(handled, true);
    assert.ok(observedCreateArgs);
    assert.equal(observedCreateArgs.timezone, "America/Chicago");
    assert.equal(observedCreateArgs.nextRunAt, "2026-02-24T17:00:00.000Z");
    assert.equal(res.ended, true);
  });

  it("creates from accepted proposal directly on explicit confirmation", async () => {
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-confirm-direct" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");
    let streamingCalls = 0;
    let observedCreateArgs = null;
    const acceptedProposal = {
      title: "The Verge Daily — 9:00 AM",
      prompt: "Fetch The Verge and save one note per article.",
      scopeFolder: "The Verge Daily",
      scheduleType: "interval",
      intervalMinutes: 1440,
      timezone: "America/Los_Angeles",
      nextRunAt: "2026-02-26T17:00:00.000Z",
      maxActionsPerRun: 6,
      maxConsecutiveFailures: 3,
      dryRun: false,
    };
    const acceptedSignature = buildTaskProposalSignature(acceptedProposal);

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "Create it",
        userTimezone: "America/Los_Angeles",
        recentMessages: [
          { role: "assistant", text: "Draft ready. Create it, revise details, or cancel?" },
        ],
        taskSetupContext: {
          acceptedProposal: {
            ...acceptedProposal,
            proposalSignature: acceptedSignature,
          },
        },
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      normalizeIanaTimezone: (value) => String(value || "").trim(),
      inferUserTimezoneFromMessages: () => "America/Los_Angeles",
      inferTaskNextRunAtFromMessages: () => "",
      isExplicitTaskCreationConfirmation: () => true,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async () => {
        streamingCalls += 1;
        return createStreamingStub([]);
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async (name, args) => {
        if (name === "create_task") {
          observedCreateArgs = args;
          return {
            task: {
              id: "task-42",
              title: args.title,
              scopeFolder: args.scopeFolder,
              scheduleType: args.scheduleType,
              intervalMinutes: args.intervalMinutes,
              timezone: args.timezone,
              nextRunAt: args.nextRunAt,
              approvalStatus: "pending_approval",
              status: "paused",
              state: "pending_approval",
            },
            approvalRequired: true,
          };
        }
        return {};
      },
      logger: { error: () => {} },
      config: { openaiWebSearchUserTimezone: "America/Los_Angeles" },
      buildAgentNoteTitle: () => "item",
      createMemory: async () => ({}),
      askMemories: async () => ({}),
      buildProjectContext: async () => ({}),
    });

    assert.equal(handled, true);
    assert.equal(streamingCalls, 0);
    assert.ok(observedCreateArgs);
    assert.equal(observedCreateArgs.confirmed, true);
    assert.equal(observedCreateArgs.scopeFolder, "The Verge Daily");
    assert.equal(res.ended, true);
    const output = res.chunks.join("\n");
    assert.match(output, /event:\s*tool_call/i);
    assert.match(output, /event:\s*tool_result/i);
    assert.match(output, /Created automation/i);
  });

  it("does not apply configured timezone fallback to task creation when user timezone is unknown", async () => {
    const req = {
      method: "POST",
      headers: { accept: "text/event-stream", "x-request-id": "req-task-timezone-fallback" },
    };
    const res = createSseResponseRecorder();
    const url = new URL("http://localhost/api/chat");
    let streamCallCount = 0;
    let observedCreateArgs = null;
    const acceptedProposal = {
      title: "Daily digest",
      prompt: "Daily digest",
      scheduleType: "interval",
      intervalMinutes: 1440,
      nextRunAt: "2026-02-24T17:00:00.000Z",
      scopeFolder: "",
      maxActionsPerRun: 4,
      maxConsecutiveFailures: 3,
      dryRun: false,
    };
    const acceptedSignature = buildTaskProposalSignature(acceptedProposal);

    const handled = await handleChatRoutes(req, res, url, {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: () => {},
      readJsonBody: async () => ({
        question: "Create it",
        recentMessages: [
          { role: "assistant", text: "Draft ready. Create it or cancel?" },
        ],
        taskSetupContext: {
          acceptedProposal: {
            ...acceptedProposal,
            proposalSignature: acceptedSignature,
          },
        },
      }),
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: (raw) => raw,
      normalizeIanaTimezone: (value) => String(value || "").trim(),
      inferUserTimezoneFromMessages: () => "",
      inferTaskNextRunAtFromMessages: () => "2026-02-24T17:00:00.000Z",
      isExplicitTaskCreationConfirmation: () => true,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: async () => [],
      noteRepo: { getNoteById: async () => null },
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: async () => {
        streamCallCount += 1;
        if (streamCallCount === 1) {
          return createFunctionCallStream({
            responseId: "resp-task-timezone-fallback-a",
            callId: "call-create",
            itemId: "item-create",
            name: "create_task",
            args: { title: "Daily digest", scheduleType: "interval", intervalMinutes: 1440 },
          });
        }
        return createStreamingStub([
          `data: ${JSON.stringify({ type: "response.created", response: { id: "resp-task-timezone-fallback-b" } })}\n`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Saved." })}\n`,
          `data: ${JSON.stringify({ type: "response.completed", response: { output: [] } })}\n`,
          "data: [DONE]\n",
        ]);
      },
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "You are Stash.",
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async (name, args) => {
        if (name === "create_task") {
          observedCreateArgs = args;
          return {
            task: {
              id: "task-1",
              title: args.title,
              scheduleType: args.scheduleType,
              intervalMinutes: args.intervalMinutes,
              timezone: args.timezone || "",
              approvalStatus: "pending_approval",
              status: "paused",
              state: "pending_approval",
              createdAt: "2026-02-24T00:00:00.000Z",
            },
            approvalRequired: true,
          };
        }
        return {};
      },
      logger: { error: () => {} },
      config: { openaiWebSearchUserTimezone: "America/New_York" },
      buildAgentNoteTitle: () => "item",
      createMemory: async () => ({}),
      askMemories: async () => ({}),
      buildProjectContext: async () => ({}),
    });

    assert.equal(handled, true);
    assert.ok(observedCreateArgs);
    assert.ok(!Object.prototype.hasOwnProperty.call(observedCreateArgs, "timezone") || !observedCreateArgs.timezone);
    assert.equal(observedCreateArgs.nextRunAt, "2026-02-24T17:00:00.000Z");
    assert.equal(res.ended, true);
  });
});
