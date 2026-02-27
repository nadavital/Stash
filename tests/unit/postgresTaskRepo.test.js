import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPostgresTaskRepo } from "../../src/postgres/taskRepo.js";

function createRunRows() {
  return {
    initial: {
      id: "run-1",
      automation_id: "task-1",
      workspace_id: "ws-1",
      started_at: "2026-02-23T00:00:00.000Z",
      finished_at: null,
      status: "running",
      summary: "",
      error: "",
      trace_json: null,
      output_json: null,
    },
    final: {
      id: "run-1",
      automation_id: "task-1",
      workspace_id: "ws-1",
      started_at: "2026-02-23T00:00:00.000Z",
      finished_at: "2026-02-23T00:01:00.000Z",
      status: "failed",
      summary: "Automation run failed",
      error: "boom",
      trace_json: {},
      output_json: {},
    },
  };
}

function createCompleteRunHarness({ automationRow }) {
  const fakePool = { query: async () => ({ rows: [] }) };
  const repo = createPostgresTaskRepo(fakePool);
  const runRows = createRunRows();
  const captured = {
    updateAutomationsParams: null,
  };
  let runSelectCount = 0;

  repo._query = async (sql, params = []) => {
    if (/SELECT \* FROM automation_runs WHERE id = \$1 LIMIT 1/i.test(sql)) {
      runSelectCount += 1;
      return { rows: [runSelectCount === 1 ? runRows.initial : runRows.final] };
    }

    if (/UPDATE automation_runs/i.test(sql)) {
      return { rows: [] };
    }

    if (/SELECT[\s\S]*max_consecutive_failures[\s\S]*FROM automations/i.test(sql)) {
      assert.equal(params[0], "task-1");
      assert.equal(params[1], "ws-1");
      return { rows: [automationRow] };
    }

    if (/UPDATE automations/i.test(sql)) {
      captured.updateAutomationsParams = params;
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in test: ${sql}`);
  };

  return { repo, captured };
}

describe("createPostgresTaskRepo completeTaskRun", () => {
  it("auto-pauses after reaching max consecutive failures", async () => {
    const { repo, captured } = createCompleteRunHarness({
      automationRow: {
        id: "task-1",
        workspace_id: "ws-1",
        status: "active",
        enabled: true,
        next_run_at: "2026-02-23T02:00:00.000Z",
        paused_reason: null,
        consecutive_failures: 2,
        max_consecutive_failures: 3,
      },
    });

    await repo.completeTaskRun("run-1", {
      status: "failed",
      summary: "Automation run failed",
      error: "boom",
      output: { mutationCount: 2 },
    });

    assert.ok(captured.updateAutomationsParams, "expected automations update query");
    assert.equal(captured.updateAutomationsParams[1], "failed");
    assert.equal(captured.updateAutomationsParams[2], "boom");
    assert.equal(captured.updateAutomationsParams[4], 2);
    assert.equal(captured.updateAutomationsParams[5], 3);
    assert.equal(captured.updateAutomationsParams[6], "paused");
    assert.equal(captured.updateAutomationsParams[7], false);
    assert.equal(captured.updateAutomationsParams[8], "auto_paused_after_failures");
    assert.equal(captured.updateAutomationsParams[9], null);
  });

  it("resets failure streak and clears error on success", async () => {
    const { repo, captured } = createCompleteRunHarness({
      automationRow: {
        id: "task-1",
        workspace_id: "ws-1",
        status: "active",
        enabled: true,
        next_run_at: "2026-02-23T02:00:00.000Z",
        paused_reason: null,
        consecutive_failures: 2,
        max_consecutive_failures: 3,
      },
    });

    await repo.completeTaskRun("run-1", {
      status: "succeeded",
      summary: "All done",
      output: {
        mutations: [{ mutationType: "note.create" }, { mutationType: "note.update" }],
      },
    });

    assert.ok(captured.updateAutomationsParams, "expected automations update query");
    assert.equal(captured.updateAutomationsParams[1], "succeeded");
    assert.equal(captured.updateAutomationsParams[2], "");
    assert.equal(captured.updateAutomationsParams[4], 2);
    assert.equal(captured.updateAutomationsParams[5], 0);
    assert.equal(captured.updateAutomationsParams[6], "active");
    assert.equal(captured.updateAutomationsParams[7], true);
    assert.equal(captured.updateAutomationsParams[8], null);
    assert.equal(captured.updateAutomationsParams[9], "2026-02-23T02:00:00.000Z");
  });
});

describe("createPostgresTaskRepo interval scheduling", () => {
  it("keeps interval anchor when requested nextRunAt is provided while disabled", () => {
    const repo = createPostgresTaskRepo({ query: async () => ({ rows: [] }) });
    const nextRunAt = repo._computeNextRunAt({
      scheduleType: "interval",
      intervalMinutes: 1440,
      enabled: false,
      requestedNextRunAt: "2026-02-24T09:00:00.000Z",
    });

    assert.ok(nextRunAt, "expected aligned nextRunAt");
    assert.ok(new Date(nextRunAt).getTime() > Date.now(), "expected nextRunAt in the future");
  });

  it("returns null nextRunAt for manual schedules", () => {
    const repo = createPostgresTaskRepo({ query: async () => ({ rows: [] }) });
    const nextRunAt = repo._computeNextRunAt({
      scheduleType: "manual",
      intervalMinutes: null,
      enabled: true,
      requestedNextRunAt: "2026-02-24T09:00:00.000Z",
    });
    assert.equal(nextRunAt, null);
  });
});
