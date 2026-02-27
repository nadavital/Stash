import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleBatchNoteRoutes } from "../../src/routes/batchNoteRoutes.js";

function createBaseContext(overrides = {}) {
  const sent = [];
  return {
    sent,
    context: {
      actor: { userId: "u1", workspaceId: "w1" },
      sendJson: (_res, statusCode, body) => sent.push({ statusCode, body }),
      resolveErrorStatus: () => 400,
      readJsonBody: async () => ({}),
      validateBatchPayload: () => ({ valid: true, errors: [] }),
      validateBatchCreatePayload: () => ({ valid: true, errors: [] }),
      batchCreateMemories: async () => ({ created: 0, failed: 0, items: [] }),
      batchDeleteMemories: async () => ({ deleted: 0 }),
      batchMoveMemories: async () => ({ moved: 0 }),
      ...overrides,
    },
  };
}

describe("handleBatchNoteRoutes", () => {
  it("validates batch create payloads", async () => {
    const { sent, context } = createBaseContext({
      validateBatchCreatePayload: () => ({ valid: false, errors: ["items must be an array"] }),
      readJsonBody: async () => ({}),
    });
    const handled = await handleBatchNoteRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/notes/batch-create"),
      context,
    );

    assert.equal(handled, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].statusCode, 400);
    assert.match(String(sent[0].body?.error || ""), /items must be an array/i);
  });

  it("returns 201 for successful batch create", async () => {
    const { sent, context } = createBaseContext({
      readJsonBody: async () => ({
        project: "Inbox",
        items: [{ content: "a" }, { content: "b" }],
      }),
      batchCreateMemories: async () => ({
        created: 2,
        failed: 0,
        items: [
          { index: 0, note: { id: "n1" } },
          { index: 1, note: { id: "n2" } },
        ],
      }),
    });
    const handled = await handleBatchNoteRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/notes/batch-create"),
      context,
    );

    assert.equal(handled, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].statusCode, 201);
    assert.equal(sent[0].body?.created, 2);
  });

  it("returns 207 when batch create has partial failures", async () => {
    const { sent, context } = createBaseContext({
      readJsonBody: async () => ({
        items: [{ content: "ok" }, { content: "" }],
      }),
      batchCreateMemories: async () => ({
        created: 1,
        failed: 1,
        items: [
          { index: 0, note: { id: "n1" } },
          { index: 1, error: "Missing content" },
        ],
      }),
    });
    const handled = await handleBatchNoteRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/notes/batch-create"),
      context,
    );

    assert.equal(handled, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].statusCode, 207);
    assert.equal(sent[0].body?.failed, 1);
  });
});
