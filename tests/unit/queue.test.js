import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DurableJobQueue, JobQueue } from "../../src/queue.js";

describe("JobQueue", () => {
  it("runs enqueued jobs", async () => {
    const queue = new JobQueue({ concurrency: 1 });
    let ran = false;

    queue.enqueue({
      id: "test-1",
      fn: async () => { ran = true; return "done"; },
    });

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(ran, true);
  });

  it("emits job:start and job:complete events", async () => {
    const queue = new JobQueue({ concurrency: 1 });
    const events = [];

    queue.subscribe((event) => events.push(event));
    queue.enqueue({
      id: "test-2",
      fn: async () => "result",
    });

    await new Promise((r) => setTimeout(r, 50));
    assert.ok(events.some((e) => e.type === "job:start" && e.id === "test-2"));
    assert.ok(events.some((e) => e.type === "job:complete" && e.id === "test-2"));
  });

  it("emits job:error on failure", async () => {
    const queue = new JobQueue({ concurrency: 1 });
    const events = [];

    queue.subscribe((event) => events.push(event));
    queue.enqueue({
      id: "test-3",
      fn: async () => { throw new Error("boom"); },
    });

    await new Promise((r) => setTimeout(r, 50));
    assert.ok(events.some((e) => e.type === "job:error" && e.id === "test-3"));
  });

  it("respects concurrency limit", async () => {
    const queue = new JobQueue({ concurrency: 2 });
    let maxConcurrent = 0;
    let current = 0;

    const makeJob = (id) => ({
      id,
      fn: async () => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        await new Promise((r) => setTimeout(r, 30));
        current--;
      },
    });

    queue.enqueue(makeJob("a"));
    queue.enqueue(makeJob("b"));
    queue.enqueue(makeJob("c"));

    await new Promise((r) => setTimeout(r, 150));
    assert.ok(maxConcurrent <= 2, `Max concurrent was ${maxConcurrent}`);
  });

  it("reports pending and active counts", () => {
    const queue = new JobQueue({ concurrency: 1 });
    assert.equal(queue.pending, 0);
    assert.equal(queue.active, 0);
  });

  it("unsubscribe stops events", async () => {
    const queue = new JobQueue({ concurrency: 1 });
    const events = [];
    const unsub = queue.subscribe((e) => events.push(e));
    unsub();

    queue.enqueue({ id: "x", fn: async () => {} });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(events.length, 0);
  });
});

function createFakeDurableRepo() {
  const jobs = new Map();
  const order = [];

  function clone(job) {
    if (!job) return null;
    return {
      ...job,
      payload: job.payload && typeof job.payload === "object" ? { ...job.payload } : {},
    };
  }

  function now() {
    return new Date().toISOString();
  }

  return {
    jobs,
    async enqueueJob({
      id,
      type,
      workspaceId,
      visibilityUserId = null,
      payload = {},
      maxAttempts = 5,
      availableAt = "",
    } = {}) {
      const job = {
        id: String(id || `job-${jobs.size + 1}`),
        type: String(type || "enrich_note"),
        workspaceId: String(workspaceId || ""),
        visibilityUserId: String(visibilityUserId || "").trim() || null,
        payload: payload && typeof payload === "object" ? payload : {},
        status: "queued",
        attemptCount: 0,
        maxAttempts: Number(maxAttempts) || 5,
        availableAt: String(availableAt || "").trim() || now(),
      };
      jobs.set(job.id, job);
      order.push(job.id);
      return clone(job);
    },
    async claimNextJob({ workerId } = {}) {
      const currentMs = Date.now();
      for (const id of order) {
        const job = jobs.get(id);
        if (!job) continue;
        if (!["queued", "retry"].includes(job.status)) continue;
        if (Date.parse(job.availableAt) > currentMs) continue;
        job.status = "running";
        job.attemptCount += 1;
        job.lockedAt = now();
        job.lockedBy = String(workerId || "");
        return clone(job);
      }
      return null;
    },
    async completeJob(id) {
      const job = jobs.get(String(id || ""));
      if (!job) return null;
      job.status = "completed";
      job.lockedAt = "";
      job.lockedBy = "";
      return clone(job);
    },
    async failJob(id, errorMessage = "") {
      const job = jobs.get(String(id || ""));
      if (!job) return null;
      job.lastError = String(errorMessage || "");
      job.lockedAt = "";
      job.lockedBy = "";
      if (job.attemptCount >= job.maxAttempts) {
        job.status = "failed";
      } else {
        job.status = "retry";
        job.availableAt = now();
      }
      return clone(job);
    },
    async requeueStaleRunningJobs() {
      return 0;
    },
    async getQueueCounts() {
      const currentMs = Date.now();
      let pending = 0;
      let running = 0;
      let failed = 0;
      for (const job of jobs.values()) {
        if (job.status === "running") running += 1;
        if (job.status === "failed") failed += 1;
        if (["queued", "retry"].includes(job.status) && Date.parse(job.availableAt) <= currentMs) {
          pending += 1;
        }
      }
      return { pending, running, failed };
    },
  };
}

async function waitFor(predicate, { timeoutMs = 1000, intervalMs = 10 } = {}) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

describe("DurableJobQueue", () => {
  it("processes jobs through registered handlers", async () => {
    const repo = createFakeDurableRepo();
    const queue = new DurableJobQueue({ concurrency: 1, repo });
    const events = [];
    queue.subscribe((event) => events.push(event));
    queue.registerHandler("enrich_note", async (payload) => ({ ok: true, noteId: payload.noteId }));

    try {
      await queue.start();
      await queue.enqueue({
        id: "durable-1",
        type: "enrich_note",
        workspaceId: "workspace-1",
        visibilityUserId: "user-1",
        payload: { noteId: "note-1" },
      });

      await waitFor(() => events.some((event) => event.type === "job:complete" && event.id === "note-1"));
      const stored = repo.jobs.get("durable-1");
      assert.equal(stored?.status, "completed");
      assert.ok(events.some((event) => event.type === "job:complete" && event.jobId === "durable-1"));
    } finally {
      queue.stop();
    }
  });

  it("retries failures and marks jobs failed after max attempts", async () => {
    const repo = createFakeDurableRepo();
    const queue = new DurableJobQueue({ concurrency: 1, repo });
    const events = [];
    let attempts = 0;
    queue.subscribe((event) => events.push(event));
    queue.registerHandler("enrich_note", async () => {
      attempts += 1;
      throw new Error("boom");
    });

    try {
      await queue.start();
      await queue.enqueue({
        id: "durable-2",
        type: "enrich_note",
        workspaceId: "workspace-1",
        payload: { noteId: "note-2" },
        maxAttempts: 2,
      });

      await waitFor(() => repo.jobs.get("durable-2")?.status === "failed");
      assert.equal(attempts, 2);

      const errors = events.filter((event) => event.type === "job:error" && event.id === "note-2");
      assert.ok(errors.length >= 2);
      assert.equal(errors[0]?.willRetry, true);
      assert.equal(errors[errors.length - 1]?.willRetry, false);
    } finally {
      queue.stop();
    }
  });
});
