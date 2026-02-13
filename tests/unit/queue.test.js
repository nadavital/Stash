import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JobQueue } from "../../src/queue.js";

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
