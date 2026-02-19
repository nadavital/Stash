import { logger } from "./logger.js";

/**
 * In-process async queue used in unit tests and as a lightweight fallback.
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

/**
 * DB-backed durable queue for enrichment jobs.
 * Jobs survive restarts and support retry/dead-letter behavior.
 */
export class DurableJobQueue {
  constructor({
    concurrency = Number(process.env.ENRICHMENT_QUEUE_CONCURRENCY || 2),
    pollIntervalMs = Number(process.env.ENRICHMENT_QUEUE_POLL_MS || 1000),
    workerId = `enrichment-worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
    repo = null,
  } = {}) {
    this.concurrency = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 2;
    this.pollIntervalMs = Number.isFinite(pollIntervalMs) ? Math.max(250, Math.floor(pollIntervalMs)) : 1000;
    this.workerId = String(workerId || "").trim() || `enrichment-worker-${process.pid}`;
    this.repo = repo || null;
    this.repoPromise = repo ? Promise.resolve(repo) : null;
    this.running = 0;
    this.pendingCount = 0;
    this.runningCount = 0;
    this.lastCounts = {
      pending: 0,
      running: 0,
      failed: 0,
      queued: 0,
      retry: 0,
      completed: 0,
      delayed: 0,
      total: 0,
    };
    this.started = false;
    this.listeners = new Set();
    this.handlers = new Map();
    this.pollTimer = null;
    this.drainInFlight = false;
    this.drainQueued = false;
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
        // listener errors should not break queue processing
      }
    }
  }

  registerHandler(type, handler) {
    const normalizedType = String(type || "").trim();
    if (!normalizedType) throw new Error("registerHandler requires a job type");
    if (typeof handler !== "function") throw new Error("registerHandler requires a function");
    this.handlers.set(normalizedType, handler);
  }

  async _getRepo() {
    if (this.repo) return this.repo;
    if (!this.repoPromise) {
      this.repoPromise = import("./storage/provider.js").then((mod) => {
        if (!mod?.enrichmentJobRepo) {
          throw new Error("enrichmentJobRepo is unavailable");
        }
        this.repo = mod.enrichmentJobRepo;
        return this.repo;
      });
    }
    return this.repoPromise;
  }

  async start() {
    if (this.started) return;
    this.started = true;

    try {
      const repo = await this._getRepo();
      await repo.requeueStaleRunningJobs().catch((error) => {
        logger.warn("enrichment_requeue_stale_failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
      await this.refreshCounts().catch(() => {});
      this._scheduleDrain();
      this.pollTimer = setInterval(() => {
        this._scheduleDrain();
        this.refreshCounts().catch(() => {});
      }, this.pollIntervalMs);
      this.pollTimer.unref?.();
    } catch (error) {
      this.started = false;
      throw error;
    }
  }

  stop() {
    this.started = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async enqueue(job = {}) {
    const normalizedType = String(job.type || "").trim();
    const workspaceId = String(job.workspaceId || "").trim();
    if (!normalizedType) throw new Error("Queue job type is required");
    if (!workspaceId) throw new Error("Queue job workspaceId is required");

    const repo = await this._getRepo();
    const persisted = await repo.enqueueJob({
      id: job.id,
      type: normalizedType,
      workspaceId,
      visibilityUserId: String(job.visibilityUserId || "").trim() || null,
      payload: job.payload || {},
      maxAttempts: Number(job.maxAttempts || 5),
      availableAt: job.availableAt || "",
    });

    await this.refreshCounts().catch(() => {});
    if (this.started) {
      this._scheduleDrain();
    }
    return persisted;
  }

  kick() {
    if (this.started) {
      this._scheduleDrain();
    }
  }

  _scheduleDrain() {
    if (!this.started) return;
    if (this.drainInFlight) {
      this.drainQueued = true;
      return;
    }

    this.drainInFlight = true;
    setImmediate(() => {
      this._drain()
        .catch((error) => {
          logger.error("enrichment_drain_failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          this.drainInFlight = false;
          if (this.drainQueued) {
            this.drainQueued = false;
            this._scheduleDrain();
          }
        });
    });
  }

  async _drain() {
    if (!this.started) return;
    const repo = await this._getRepo();

    while (this.running < this.concurrency) {
      const claimedJob = await repo.claimNextJob({ workerId: this.workerId });
      if (!claimedJob) break;
      this.running += 1;
      this._runClaimedJob(claimedJob);
    }

    await this.refreshCounts().catch(() => {});
  }

  async _runClaimedJob(job) {
    const repo = await this._getRepo();
    const eventId = String(job?.payload?.noteId || "").trim() || job.id;
    const normalizedVisibilityUserId = String(job.visibilityUserId || "").trim() || null;
    this.emit({
      type: "job:start",
      id: eventId,
      jobId: job.id,
      workspaceId: job.workspaceId,
      visibilityUserId: normalizedVisibilityUserId,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      timestamp: new Date().toISOString(),
    });

    try {
      const handler = this.handlers.get(String(job.type || "").trim());
      if (!handler) {
        throw new Error(`No queue handler registered for job type "${job.type}"`);
      }

      const result = await handler(job.payload || {}, job);
      await repo.completeJob(job.id);
      this.emit({
        type: "job:complete",
        id: eventId,
        jobId: job.id,
        workspaceId: job.workspaceId,
        visibilityUserId: normalizedVisibilityUserId,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedJob = await repo.failJob(job.id, message).catch(() => null);
      this.emit({
        type: "job:error",
        id: eventId,
        jobId: job.id,
        workspaceId: job.workspaceId,
        visibilityUserId: normalizedVisibilityUserId,
        attemptCount: failedJob?.attemptCount ?? job.attemptCount,
        maxAttempts: failedJob?.maxAttempts ?? job.maxAttempts,
        willRetry: failedJob?.status === "retry",
        nextAttemptAt: failedJob?.status === "retry" ? failedJob.availableAt : "",
        error: message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      this.running -= 1;
      this._scheduleDrain();
      this.refreshCounts().catch(() => {});
    }
  }

  async refreshCounts() {
    try {
      const repo = await this._getRepo();
      const counts = await repo.getQueueCounts();
      this.pendingCount = Number(counts.pending || 0);
      this.runningCount = Number(counts.running || 0);
      this.lastCounts = {
        pending: Number(counts.pending || 0),
        running: Number(counts.running || 0),
        failed: Number(counts.failed || 0),
        queued: Number(counts.queued || 0),
        retry: Number(counts.retry || 0),
        completed: Number(counts.completed || 0),
        delayed: Number(counts.delayed || 0),
        total: Number(counts.total || 0),
      };
      return counts;
    } catch {
      // keep prior counts when DB is unavailable
      return {
        pending: this.pendingCount,
        running: Math.max(this.running, this.runningCount),
        failed: Number(this.lastCounts.failed || 0),
        queued: Number(this.lastCounts.queued || 0),
        retry: Number(this.lastCounts.retry || 0),
        completed: Number(this.lastCounts.completed || 0),
        delayed: Number(this.lastCounts.delayed || 0),
        total: Number(this.lastCounts.total || 0),
      };
    }
  }

  get pending() {
    return this.pendingCount;
  }

  get active() {
    return Math.max(this.running, this.runningCount);
  }

  get stats() {
    return {
      pending: this.pending,
      running: this.active,
      failed: Number(this.lastCounts.failed || 0),
      queued: Number(this.lastCounts.queued || 0),
      retry: Number(this.lastCounts.retry || 0),
      completed: Number(this.lastCounts.completed || 0),
      delayed: Number(this.lastCounts.delayed || 0),
      total: Number(this.lastCounts.total || 0),
    };
  }
}

export const enrichmentQueue = new DurableJobQueue();
