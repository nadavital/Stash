import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleTaskRoutes } from "../../src/routes/taskRoutes.js";

function createTaskFixture(overrides = {}) {
  return {
    id: "task-1",
    title: "Weekly ingest",
    prompt: "Populate /Research folder with fresh links",
    state: "pending_approval",
    approvalStatus: "pending_approval",
    status: "paused",
    enabled: false,
    scheduleType: "interval",
    intervalMinutes: 60,
    createdAt: "2026-02-23T00:00:00.000Z",
    ...overrides,
  };
}

function createContext(overrides = {}) {
  const sent = [];
  return {
    sent,
    context: {
      actor: { userId: "u1", workspaceId: "w1", role: "owner" },
      sendJson: (_res, statusCode, body) => sent.push({ statusCode, body }),
      readJsonBody: async () => ({}),
      isWorkspaceManager: (actor) => ["owner", "admin"].includes(String(actor?.role || "").toLowerCase()),
      taskRepo: {
        listTasks: async () => [createTaskFixture()],
        createTask: async ({ title }) => createTaskFixture({ title }),
        getTask: async () => createTaskFixture(),
        updateTask: async (_id, patch) => createTaskFixture({ ...patch }),
        approveTask: async () => createTaskFixture({
          state: "active",
          approvalStatus: "approved",
          status: "active",
          enabled: true,
        }),
        pauseTask: async () => createTaskFixture({ state: "paused", status: "paused", enabled: false }),
        resumeTask: async () => createTaskFixture({
          state: "active",
          approvalStatus: "approved",
          status: "active",
          enabled: true,
        }),
        deleteTask: async (id) => ({ deleted: true, id }),
        listTaskRuns: async () => [{ id: "run-1", taskId: "task-1", status: "succeeded" }],
      },
      runTaskNow: async () => ({ id: "run-1", taskId: "task-1", status: "succeeded" }),
      ...overrides,
    },
  };
}

describe("handleTaskRoutes", () => {
  it("lists tasks", async () => {
    const { sent, context } = createContext();
    const handled = await handleTaskRoutes(
      { method: "GET" },
      {},
      new URL("http://localhost/api/tasks?status=active"),
      context,
    );
    assert.equal(handled, true);
    assert.equal(sent[0].statusCode, 200);
    assert.equal(sent[0].body.count, 1);
    assert.equal(sent[0].body.items[0].state, "pending_approval");
  });

  it("creates tasks", async () => {
    const { sent, context } = createContext({
      readJsonBody: async () => ({ title: "Ship" }),
    });
    const handled = await handleTaskRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/tasks"),
      context,
    );
    assert.equal(handled, true);
    assert.equal(sent[0].statusCode, 201);
    assert.equal(sent[0].body.task.id, "task-1");
  });

  it("approves tasks through approve endpoint", async () => {
    const { sent, context } = createContext({
      readJsonBody: async () => ({ activate: true }),
    });
    const handled = await handleTaskRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/tasks/task-1/approve"),
      context,
    );
    assert.equal(handled, true);
    assert.equal(sent[0].statusCode, 200);
    assert.equal(sent[0].body.task.state, "active");
  });

  it("runs tasks through run-now endpoint", async () => {
    const { sent, context } = createContext();
    const handled = await handleTaskRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/tasks/task-1/run-now"),
      context,
    );
    assert.equal(handled, true);
    assert.equal(sent[0].statusCode, 200);
    assert.equal(sent[0].body.run.id, "run-1");
  });

  it("returns 400 for missing approve id", async () => {
    const { sent, context } = createContext();
    const handled = await handleTaskRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/tasks/%20/approve"),
      context,
    );
    assert.equal(handled, true);
    assert.equal(sent[0].statusCode, 400);
  });

  it("returns 403 for approve when actor is not workspace manager", async () => {
    const { sent, context } = createContext({
      actor: { userId: "u2", workspaceId: "w1", role: "member" },
      readJsonBody: async () => ({ activate: true }),
    });
    const handled = await handleTaskRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/tasks/task-1/approve"),
      context,
    );
    assert.equal(handled, true);
    assert.equal(sent[0].statusCode, 403);
  });
});
