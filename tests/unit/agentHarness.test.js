import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentToolHarness } from "../../src/agentHarness.js";

describe("createAgentToolHarness", () => {
  it("executes a tool call and caches by idempotency key", async () => {
    let executions = 0;
    const harness = createAgentToolHarness({
      executeTool: async (name, args) => {
        executions += 1;
        return { name, args, executions };
      },
    });

    const first = await harness.runToolCall({
      name: "search_notes",
      rawArgs: JSON.stringify({ query: "roadmap", project: "planning" }),
      callId: "call-1",
      round: 0,
    });
    const second = await harness.runToolCall({
      name: "search_notes",
      rawArgs: JSON.stringify({ project: "planning", query: "roadmap" }),
      callId: "call-2",
      round: 0,
    });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(executions, 1);
    assert.equal(second.trace?.cacheHit, true);
    assert.equal(first.result?.args?.query, "roadmap");
  });

  it("returns validation errors for invalid args", async () => {
    const harness = createAgentToolHarness({
      executeTool: async () => ({ ok: true }),
    });

    const result = await harness.runToolCall({
      name: "create_note",
      rawArgs: JSON.stringify({ content: "" }),
      callId: "call-1",
      round: 0,
    });

    assert.equal(result.ok, false);
    assert.equal(result.trace?.status, "validation_error");
    assert.match(String(result.error || ""), /requires content or an attachment/i);
  });

  it("normalizes create_note title when provided", async () => {
    const harness = createAgentToolHarness({
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "create_note",
      rawArgs: JSON.stringify({
        title: "  Test Context Note  ",
        content: "## Body\n\nSome details",
      }),
      callId: "call-title",
      round: 0,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.title, "Test Context Note");
  });

  it("normalizes create_notes_bulk payloads", async () => {
    const harness = createAgentToolHarness({
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "create_notes_bulk",
      rawArgs: JSON.stringify({
        project: " Product ",
        stopOnError: true,
        items: [
          {
            content: "  https://example.com/roadmap  ",
            sourceType: "url",
            title: "  Roadmap link ",
          },
        ],
      }),
      callId: "call-bulk",
      round: 1,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.project, "Product");
    assert.equal(result.result?.args?.stopOnError, true);
    assert.equal(result.result?.args?.items?.[0]?.content, "https://example.com/roadmap");
    assert.equal(result.result?.args?.items?.[0]?.sourceType, "link");
    assert.equal(result.result?.args?.items?.[0]?.title, "Roadmap link");
  });

  it("normalizes search scope and working set ids", async () => {
    const harness = createAgentToolHarness({
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "search_notes",
      rawArgs: JSON.stringify({
        query: "planning",
        scope: "ITEM",
        workingSetIds: ["abc", "  ", "abc", "def"],
      }),
      callId: "call-3",
      round: 1,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.scope, "item");
    assert.deepEqual(result.result?.args?.workingSetIds, ["abc", "def"]);
  });

  it("normalizes folder collaborator args and role", async () => {
    const harness = createAgentToolHarness({
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "set_folder_collaborator",
      rawArgs: JSON.stringify({
        folderId: " Product ",
        email: " User@Example.com ",
        role: "OWNER",
      }),
      callId: "call-4",
      round: 1,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.folderId, "Product");
    assert.equal(result.result?.args?.email, "user@example.com");
    assert.equal(result.result?.args?.role, "viewer");
  });

  it("validates collaborator identifier for remove_folder_collaborator", async () => {
    const harness = createAgentToolHarness({
      executeTool: async () => ({ ok: true }),
    });

    const result = await harness.runToolCall({
      name: "remove_folder_collaborator",
      rawArgs: JSON.stringify({ folderId: "abc" }),
      callId: "call-5",
      round: 1,
    });

    assert.equal(result.ok, false);
    assert.equal(result.trace?.status, "validation_error");
    assert.match(String(result.error || ""), /requires userId or email/i);
  });

  it("accepts update_note_attachment with id and optional attachment args", async () => {
    const harness = createAgentToolHarness({
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "update_note_attachment",
      rawArgs: JSON.stringify({
        id: "note-123",
        fileName: "spec.md",
        fileMimeType: "text/markdown",
        fileDataUrl: "data:text/markdown;base64,IyBIZWxsbyBXb3JsZA==",
      }),
      callId: "call-6",
      round: 1,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.id, "note-123");
    assert.equal(result.result?.args?.fileName, "spec.md");
    assert.equal(result.result?.args?.fileMimeType, "text/markdown");
    assert.equal(result.result?.args?.requeueEnrichment, true);
  });

  it("accepts update_note title updates", async () => {
    const harness = createAgentToolHarness({
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "update_note",
      rawArgs: JSON.stringify({
        id: "note-42",
        title: "Quarterly planning brief",
      }),
      callId: "call-7",
      round: 1,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.id, "note-42");
    assert.equal(result.result?.args?.title, "Quarterly planning brief");
  });

  it("applies resolveArgs before validation so context can provide missing ids", async () => {
    const harness = createAgentToolHarness({
      resolveArgs: (name, args) => {
        if (name === "update_note" && !args.id) {
          return { ...args, id: "note-context" };
        }
        return args;
      },
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "update_note",
      rawArgs: JSON.stringify({ title: "Retitle from context" }),
      callId: "call-8",
      round: 1,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.id, "note-context");
    assert.equal(result.result?.args?.title, "Retitle from context");
  });

  it("normalizes ask_user_question payload", async () => {
    const harness = createAgentToolHarness({
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "ask_user_question",
      rawArgs: JSON.stringify({
        question: "  Which neighborhood should I prioritize? ",
        options: ["Mission", "  ", "North Beach", "Mission", "Sunset", "Something else (type it)"],
        answerMode: "choices_plus_freeform",
        context: "  Need your preference to tailor the plan. ",
      }),
      callId: "call-9",
      round: 2,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.question, "Which neighborhood should I prioritize?");
    assert.deepEqual(result.result?.args?.options, ["Mission", "North Beach", "Sunset"]);
    assert.equal(result.result?.args?.answerMode, "choices_plus_freeform");
    assert.equal(result.result?.args?.context, "Need your preference to tailor the plan");
  });

  it("forces ask_user_question into one concise question", async () => {
    const harness = createAgentToolHarness({
      executeTool: async (_name, args) => ({ args }),
    });

    const result = await harness.runToolCall({
      name: "ask_user_question",
      rawArgs: JSON.stringify({
        question: "Before I continue: 1) budget? 2) neighborhood? 3) indoor/outdoor?",
        options: ["Cheap", "Mid-range", "Premium", "Surprise me", "No preference"],
        answerMode: "choices_plus_freeform",
        context: "I need these details so I can narrow suggestions. We can refine later if needed.",
      }),
      callId: "call-10",
      round: 2,
    });

    assert.equal(result.ok, true);
    assert.equal(result.result?.args?.question, "Before I continue: 1) budget?");
    assert.deepEqual(result.result?.args?.options, ["Cheap", "Mid-range", "Premium", "Surprise me"]);
    assert.equal(result.result?.args?.answerMode, "choices_plus_freeform");
    assert.equal(result.result?.args?.context, "I need these details so I can narrow suggestions");
  });

  it("evicts oldest idempotency entries when cache limit is exceeded", async () => {
    let executions = 0;
    const harness = createAgentToolHarness({
      idempotencyCacheMaxEntries: 2,
      executeTool: async (_name, args) => {
        executions += 1;
        return { query: args.query, executions };
      },
    });

    await harness.runToolCall({
      name: "search_notes",
      rawArgs: JSON.stringify({ query: "alpha" }),
      callId: "evict-1",
      round: 0,
    });
    await harness.runToolCall({
      name: "search_notes",
      rawArgs: JSON.stringify({ query: "beta" }),
      callId: "evict-2",
      round: 0,
    });
    await harness.runToolCall({
      name: "search_notes",
      rawArgs: JSON.stringify({ query: "gamma" }),
      callId: "evict-3",
      round: 0,
    });
    const replay = await harness.runToolCall({
      name: "search_notes",
      rawArgs: JSON.stringify({ query: "alpha" }),
      callId: "evict-4",
      round: 0,
    });

    assert.equal(executions, 4);
    assert.equal(replay.ok, true);
    assert.equal(replay.trace?.cacheHit, false);
    assert.equal(replay.result?.query, "alpha");
  });
});
