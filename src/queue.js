/**
 * In-process async job queue with configurable concurrency.
 * Used for background enrichment of notes after initial save.
 */

export class JobQueue {
  constructor({ concurrency = 2 } = {}) {
    this.concurrency = concurrency;
    this.queue = [];
    this.running = 0;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  unsubscribe(listener) {
    this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors should not break the queue
      }
    }
  }

  enqueue(job) {
    this.queue.push(job);
    this._drain();
  }

  _drain() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      this.running += 1;
      this._run(job);
    }
  }

  async _run(job) {
    const { id, fn, workspaceId = null, visibilityUserId = null } = job;
    this.emit({
      type: "job:start",
      id,
      workspaceId,
      visibilityUserId,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await fn();
      this.emit({
        type: "job:complete",
        id,
        workspaceId,
        visibilityUserId,
        result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.emit({
        type: "job:error",
        id,
        workspaceId,
        visibilityUserId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    } finally {
      this.running -= 1;
      // Use setImmediate to yield before draining next — enrichment is I/O-bound
      setImmediate(() => this._drain());
    }
  }

  get pending() {
    return this.queue.length;
  }

  get active() {
    return this.running;
  }
}

export const enrichmentQueue = new JobQueue({ concurrency: 2 });
