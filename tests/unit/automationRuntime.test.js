import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAutomationRuntime } from "../../src/tasks/automationRuntime.js";
import { createAgentToolHarness } from "../../src/chat/toolRuntime/createToolHarness.js";

function createStreamResponse(events = []) {
  return {
    body: (async function* stream() {
      for (const event of events) {
        yield `data: ${JSON.stringify(event)}\n`;
      }
      yield "data: [DONE]\n";
    })(),
  };
}

function baseTask(overrides = {}) {
  return {
    id: "task-1",
    workspaceId: "ws-1",
    createdByUserId: "u-1",
    approvalStatus: "approved",
    status: "active",
    enabled: true,
    name: "Refresh folder",
    prompt: "Create one note",
    scopeFolder: "Research",
    maxActionsPerRun: 4,
    ...overrides,
  };
}

describe("createAutomationRuntime", () => {
  it("captures workspace mutation commits in run output", async () => {
    const completedCalls = [];
    let callIndex = 0;

    const runtime = createAutomationRuntime({
      config: {
        automationPollIntervalMs: 30000,
        automationPollBatchSize: 4,
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      hasOpenAI: () => true,
      CHAT_TOOLS: [
        {
          type: "function",
          name: "create_note",
          parameters: { type: "object", properties: {} },
        },
      ],
      CHAT_SYSTEM_PROMPT: "You are helpful.",
      createStreamingResponse: async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return createStreamResponse([
            { type: "response.created", response: { id: "resp-1" } },
            {
              type: "response.output_item.added",
              item: {
                type: "function_call",
                id: "item-1",
                call_id: "call-1",
                name: "create_note",
              },
            },
            {
              type: "response.function_call_arguments.delta",
              item_id: "item-1",
              call_id: "call-1",
              delta: "{\"title\":\"Hello\",\"content\":\"world\"}",
            },
            {
              type: "response.output_item.done",
              item: {
                type: "function_call",
                id: "item-1",
                call_id: "call-1",
                name: "create_note",
                arguments: "{\"title\":\"Hello\",\"content\":\"world\"}",
              },
            },
            { type: "response.completed", response: { output: [] } },
          ]);
        }

        return createStreamResponse([
          { type: "response.created", response: { id: "resp-2" } },
          { type: "response.output_text.delta", delta: "Done" },
          { type: "response.completed", response: { output: [] } },
        ]);
      },
      extractOutputUrlCitations: () => [],
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async () => ({
        noteId: "note-1",
      }),
      taskRepo: {
        getTask: async () => baseTask(),
        createTaskRun: async () => ({ id: "run-1" }),
        completeTaskRun: async (_runId, payload) => {
          completedCalls.push(payload);
          return { id: "run-1", status: payload.status, output: payload.output, trace: payload.trace };
        },
        claimDueTasks: async () => [],
      },
    });

    await runtime.runTaskNow({
      taskId: "task-1",
      workspaceId: "ws-1",
      triggeredByUserId: "u-1",
      trigger: "manual",
    });

    assert.equal(completedCalls.length, 1);
    assert.equal(completedCalls[0].status, "succeeded");
    assert.match(completedCalls[0].summary, /created 1 note/i);
    assert.equal(completedCalls[0].output.mutationCount, 1);
    assert.equal(completedCalls[0].output.mutationActions, 1);
    assert.equal(Array.isArray(completedCalls[0].output.mutations), true);
    assert.equal(completedCalls[0].output.mutations.length, 1);
    assert.equal(completedCalls[0].output.mutations[0].mutationType, "note.create");
    assert.equal(completedCalls[0].output.mutations[0].entityType, "note");
    assert.equal(completedCalls[0].output.mutations[0].result?.noteId, "note-1");
  });

  it("skips scheduled runs when task is not active", async () => {
    let createdRuns = 0;
    const runtime = createAutomationRuntime({
      config: {
        automationPollIntervalMs: 30000,
        automationPollBatchSize: 4,
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      hasOpenAI: () => true,
      CHAT_TOOLS: [],
      CHAT_SYSTEM_PROMPT: "You are helpful.",
      createStreamingResponse: async () => createStreamResponse([]),
      extractOutputUrlCitations: () => [],
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async () => ({}),
      taskRepo: {
        getTask: async () => baseTask({ status: "paused", enabled: false }),
        createTaskRun: async () => {
          createdRuns += 1;
          return { id: "run-1" };
        },
        completeTaskRun: async () => ({ id: "run-1", status: "succeeded" }),
        claimDueTasks: async () => [],
      },
    });

    const result = await runtime.runTaskNow({
      taskId: "task-1",
      workspaceId: "ws-1",
      trigger: "schedule",
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "task_not_active");
    assert.equal(createdRuns, 0);
  });

  it("fails runs that require external sources when no external tools are configured", async () => {
    const completedCalls = [];
    const runtime = createAutomationRuntime({
      config: {
        automationPollIntervalMs: 30000,
        automationPollBatchSize: 4,
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      hasOpenAI: () => true,
      CHAT_TOOLS: [
        {
          type: "function",
          name: "search_notes",
          parameters: { type: "object", properties: {} },
        },
      ],
      CHAT_SYSTEM_PROMPT: "You are helpful.",
      createStreamingResponse: async () => createStreamResponse([]),
      extractOutputUrlCitations: () => [],
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async () => ({}),
      taskRepo: {
        getTask: async () => baseTask({
          name: "Daily The Verge Digest",
          prompt: "Every day gather latest The Verge headlines from last 24h and save digest.",
        }),
        createTaskRun: async () => ({ id: "run-1" }),
        completeTaskRun: async (_runId, payload) => {
          completedCalls.push(payload);
          return { id: "run-1", status: payload.status };
        },
        claimDueTasks: async () => [],
      },
    });

    await assert.rejects(
      () => runtime.runTaskNow({
        taskId: "task-1",
        workspaceId: "ws-1",
      }),
      /external source retrieval/i,
    );

    assert.equal(completedCalls.length, 1);
    assert.equal(completedCalls[0].status, "failed");
  });

  it("allows external-source runs when web search tooling is configured", async () => {
    const completedCalls = [];
    const runtime = createAutomationRuntime({
      config: {
        automationPollIntervalMs: 30000,
        automationPollBatchSize: 4,
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      hasOpenAI: () => true,
      CHAT_TOOLS: [],
      CHAT_SYSTEM_PROMPT: "You are helpful.",
      buildChatWebSearchTool: () => ({ type: "web_search", search_context_size: "medium" }),
      createStreamingResponse: async () => createStreamResponse([
        { type: "response.created", response: { id: "resp-1" } },
        { type: "response.output_text.delta", delta: "Collected latest items and saved digest." },
        { type: "response.completed", response: { output: [] } },
      ]),
      extractOutputUrlCitations: () => [],
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async () => ({}),
      taskRepo: {
        getTask: async () => baseTask({
          name: "Daily The Verge Digest",
          prompt: "Every day gather latest The Verge headlines from last 24h and save digest.",
        }),
        createTaskRun: async () => ({ id: "run-1" }),
        completeTaskRun: async (_runId, payload) => {
          completedCalls.push(payload);
          return { id: "run-1", status: payload.status, summary: payload.summary };
        },
        claimDueTasks: async () => [],
      },
    });

    const result = await runtime.runTaskNow({
      taskId: "task-1",
      workspaceId: "ws-1",
    });

    assert.equal(completedCalls.length, 1);
    assert.equal(completedCalls[0].status, "succeeded");
    assert.equal(result.status, "succeeded");
  });

  it("allows external-source runs using fetch_rss tooling and records the call trace", async () => {
    const completedCalls = [];
    const toolCalls = [];
    let callIndex = 0;

    const runtime = createAutomationRuntime({
      config: {
        automationPollIntervalMs: 30000,
        automationPollBatchSize: 4,
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      hasOpenAI: () => true,
      CHAT_TOOLS: [
        {
          type: "function",
          name: "fetch_rss",
          parameters: { type: "object", properties: {} },
        },
        {
          type: "function",
          name: "create_notes_bulk",
          parameters: { type: "object", properties: {} },
        },
      ],
      CHAT_SYSTEM_PROMPT: "You are helpful.",
      createStreamingResponse: async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return createStreamResponse([
            { type: "response.created", response: { id: "resp-1" } },
            {
              type: "response.output_item.added",
              item: {
                type: "function_call",
                id: "item-1",
                call_id: "call-1",
                name: "fetch_rss",
              },
            },
            {
              type: "response.function_call_arguments.delta",
              item_id: "item-1",
              call_id: "call-1",
              delta: "{\"url\":\"https://www.theverge.com/rss/index.xml\",\"limit\":5}",
            },
            {
              type: "response.output_item.done",
              item: {
                type: "function_call",
                id: "item-1",
                call_id: "call-1",
                name: "fetch_rss",
                arguments: "{\"url\":\"https://www.theverge.com/rss/index.xml\",\"limit\":5}",
              },
            },
            { type: "response.completed", response: { output: [] } },
          ]);
        }
        if (callIndex === 2) {
          return createStreamResponse([
            { type: "response.created", response: { id: "resp-2" } },
            {
              type: "response.output_item.added",
              item: {
                type: "function_call",
                id: "item-2",
                call_id: "call-2",
                name: "create_notes_bulk",
              },
            },
            {
              type: "response.function_call_arguments.delta",
              item_id: "item-2",
              call_id: "call-2",
              delta: "{\"project\":\"The Verge Daily\",\"items\":[{\"title\":\"Story one\",\"content\":\"Story one\",\"sourceType\":\"link\",\"sourceUrl\":\"https://www.theverge.com/story-1\"}]}",
            },
            {
              type: "response.output_item.done",
              item: {
                type: "function_call",
                id: "item-2",
                call_id: "call-2",
                name: "create_notes_bulk",
                arguments: "{\"project\":\"The Verge Daily\",\"items\":[{\"title\":\"Story one\",\"content\":\"Story one\",\"sourceType\":\"link\",\"sourceUrl\":\"https://www.theverge.com/story-1\"}]}",
              },
            },
            { type: "response.completed", response: { output: [] } },
          ]);
        }

        return createStreamResponse([
          { type: "response.created", response: { id: "resp-3" } },
          { type: "response.output_text.delta", delta: "Saved one note." },
          { type: "response.completed", response: { output: [] } },
        ]);
      },
      extractOutputUrlCitations: () => [],
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async (name) => {
        toolCalls.push(name);
        if (name === "fetch_rss") {
          return {
            feedUrl: "https://www.theverge.com/rss/index.xml",
            count: 1,
            items: [
              {
                title: "Story one",
                url: "https://www.theverge.com/story-1",
                publishedAt: "2026-02-24T18:00:00.000Z",
                author: "Reporter",
                summary: "Summary",
              },
            ],
          };
        }
        if (name === "create_notes_bulk") {
          return {
            created: 1,
            failed: 0,
            items: [
              {
                index: 0,
                noteId: "note-1",
                title: "Story one",
                status: "created",
              },
            ],
          };
        }
        return {};
      },
      taskRepo: {
        getTask: async () => baseTask({
          name: "Daily The Verge Digest",
          prompt: "Every day gather latest The Verge headlines from last 24h and save digest.",
          taskSpec: {
            source: { mode: "web", domains: ["theverge.com"], lookbackHours: 24 },
            output: { mode: "per_item_notes", includeDigestIndex: false },
            dedupe: { enabled: true, strategy: "by_url", scope: "folder" },
            destination: { folder: "The Verge Daily" },
          },
          scopeFolder: "The Verge Daily",
        }),
        createTaskRun: async () => ({ id: "run-1" }),
        completeTaskRun: async (_runId, payload) => {
          completedCalls.push(payload);
          return { id: "run-1", status: payload.status, trace: payload.trace };
        },
        claimDueTasks: async () => [],
      },
    });

    const result = await runtime.runTaskNow({
      taskId: "task-1",
      workspaceId: "ws-1",
    });

    assert.equal(result.status, "succeeded");
    assert.equal(completedCalls.length, 1);
    assert.ok(toolCalls.includes("fetch_rss"));
    assert.ok(toolCalls.includes("create_notes_bulk"));
    assert.ok(completedCalls[0].trace?.traces?.some((entry) => entry?.name === "fetch_rss"));
  });

  it("enforces external-source tooling when taskSpec source mode is web", async () => {
    const runtime = createAutomationRuntime({
      config: {
        automationPollIntervalMs: 30000,
        automationPollBatchSize: 4,
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      hasOpenAI: () => true,
      CHAT_TOOLS: [
        {
          type: "function",
          name: "search_notes",
          parameters: { type: "object", properties: {} },
        },
      ],
      CHAT_SYSTEM_PROMPT: "You are helpful.",
      createStreamingResponse: async () => createStreamResponse([]),
      extractOutputUrlCitations: () => [],
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async () => ({}),
      taskRepo: {
        getTask: async () => baseTask({
          name: "Digest",
          prompt: "Save a summary note.",
          taskSpec: {
            source: { mode: "web" },
            output: { mode: "single_note" },
          },
        }),
        createTaskRun: async () => ({ id: "run-1" }),
        completeTaskRun: async (_runId, payload) => ({ id: "run-1", status: payload.status }),
        claimDueTasks: async () => [],
      },
    });

    await assert.rejects(
      () => runtime.runTaskNow({
        taskId: "task-1",
        workspaceId: "ws-1",
      }),
      /external source retrieval/i,
    );
  });

  it("allows workspace-only runs when taskSpec source mode is workspace", async () => {
    const completedCalls = [];
    const runtime = createAutomationRuntime({
      config: {
        automationPollIntervalMs: 30000,
        automationPollBatchSize: 4,
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      hasOpenAI: () => true,
      CHAT_TOOLS: [
        {
          type: "function",
          name: "search_notes",
          parameters: { type: "object", properties: {} },
        },
      ],
      CHAT_SYSTEM_PROMPT: "You are helpful.",
      createStreamingResponse: async () => createStreamResponse([
        { type: "response.created", response: { id: "resp-1" } },
        { type: "response.output_text.delta", delta: "Workspace-only run complete." },
        { type: "response.completed", response: { output: [] } },
      ]),
      extractOutputUrlCitations: () => [],
      createAgentToolHarness,
      resolveAgentToolArgs: (_name, args) => args,
      executeChatToolCall: async () => ({}),
      taskRepo: {
        getTask: async () => baseTask({
          name: "Daily The Verge Digest",
          prompt: "Every day gather latest The Verge headlines from last 24h and save digest.",
          taskSpec: {
            source: { mode: "workspace" },
            output: { mode: "single_note" },
          },
        }),
        createTaskRun: async () => ({ id: "run-1" }),
        completeTaskRun: async (_runId, payload) => {
          completedCalls.push(payload);
          return { id: "run-1", status: payload.status };
        },
        claimDueTasks: async () => [],
      },
    });

    const result = await runtime.runTaskNow({
      taskId: "task-1",
      workspaceId: "ws-1",
    });

    assert.equal(result.status, "succeeded");
    assert.equal(completedCalls.length, 1);
  });
});
