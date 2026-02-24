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
    assert.equal(completedCalls[0].output.mutationCount, 1);
    assert.equal(completedCalls[0].output.mutationActions, 1);
    assert.equal(Array.isArray(completedCalls[0].output.mutations), true);
    assert.equal(completedCalls[0].output.mutations.length, 1);
    assert.equal(completedCalls[0].output.mutations[0].mutationType, "note.create");
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
});
