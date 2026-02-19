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
});
