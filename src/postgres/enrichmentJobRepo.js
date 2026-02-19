import crypto from "node:crypto";
import { getPostgresPool } from "./pool.js";
import { ensurePostgresReady } from "./runtime.js";

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeWorkspaceId(value) {
  return String(value || "").trim();
}

function normalizeStatus(value, fallback = "queued") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["queued", "running", "retry", "completed", "failed"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    workspaceId: row.workspace_id,
    visibilityUserId: row.visibility_user_id || null,
    payload: row.payload_json && typeof row.payload_json === "object" ? row.payload_json : {},
    status: normalizeStatus(row.status),
    attemptCount: clampInt(row.attempt_count, 0, 1000, 0),
    maxAttempts: clampInt(row.max_attempts, 1, 1000, 5),
    availableAt: row.available_at ? new Date(row.available_at).toISOString() : nowIso(),
    lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : "",
    lockedBy: row.locked_by || "",
    lastError: row.last_error || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : nowIso(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : nowIso(),
  };
}

class PostgresEnrichmentJobRepo {
  constructor(pool = getPostgresPool()) {
    this.pool = pool;
  }

  async _query(sql, params = []) {
    await ensurePostgresReady();
    return this.pool.query(sql, params);
  }

  async enqueueJob({
    id = "",
    type = "enrich_note",
    workspaceId = "",
    visibilityUserId = null,
    payload = {},
    maxAttempts = 5,
    availableAt = "",
  } = {}) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) {
      throw new Error("Missing workspace id for enrichment job");
    }

    const normalizedType = String(type || "").trim();
    if (!normalizedType) {
      throw new Error("Missing job type");
    }

    const normalizedId = String(id || "").trim() || crypto.randomUUID();
    const normalizedAvailableAt = String(availableAt || "").trim() || nowIso();
    const boundedMaxAttempts = clampInt(maxAttempts, 1, 20, 5);

    const result = await this._query(
      `
        INSERT INTO enrichment_jobs (
          id, type, workspace_id, visibility_user_id, payload_json,
          status, attempt_count, max_attempts, available_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb,
          'queued', 0, $6, $7::timestamptz, NOW(), NOW()
        )
        RETURNING *
      `,
      [
        normalizedId,
        normalizedType,
        normalizedWorkspaceId,
        String(visibilityUserId || "").trim() || null,
        JSON.stringify(payload || {}),
        boundedMaxAttempts,
        normalizedAvailableAt,
      ]
    );

    return mapRow(result.rows[0]);
  }

  async claimNextJob({ workerId = "" } = {}) {
    const normalizedWorkerId =
      String(workerId || "").trim() || `worker-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
    const result = await this._query(
      `
        WITH next_job AS (
          SELECT id
          FROM enrichment_jobs
          WHERE status IN ('queued', 'retry')
            AND available_at <= NOW()
          ORDER BY available_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE enrichment_jobs AS jobs
        SET
          status = 'running',
          attempt_count = jobs.attempt_count + 1,
          locked_at = NOW(),
          locked_by = $1,
          updated_at = NOW()
        FROM next_job
        WHERE jobs.id = next_job.id
        RETURNING jobs.*
      `,
      [normalizedWorkerId]
    );
    return mapRow(result.rows[0]);
  }

  async completeJob(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    const result = await this._query(
      `
        UPDATE enrichment_jobs
        SET
          status = 'completed',
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [normalizedId]
    );
    return mapRow(result.rows[0]);
  }

  async failJob(
    id,
    errorMessage = "Unknown error",
    { baseDelayMs = 2000, maxDelayMs = 60000 } = {}
  ) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;

    const existingResult = await this._query(
      `SELECT * FROM enrichment_jobs WHERE id = $1 LIMIT 1`,
      [normalizedId]
    );
    const current = mapRow(existingResult.rows[0]);
    if (!current) return null;

    const lastError = String(errorMessage || "Unknown error").slice(0, 4000);
    const reachedMax = current.attemptCount >= current.maxAttempts;
    const safeBaseDelay = clampInt(baseDelayMs, 100, 300000, 2000);
    const safeMaxDelay = clampInt(maxDelayMs, 1000, 3600000, 60000);
    const retryDelay = Math.min(
      safeMaxDelay,
      safeBaseDelay * 2 ** Math.max(0, current.attemptCount - 1)
    );
    const nextAvailableAt = new Date(Date.now() + retryDelay).toISOString();

    const result = await this._query(
      `
        UPDATE enrichment_jobs
        SET
          status = $2,
          available_at = CASE WHEN $2 = 'retry' THEN $3::timestamptz ELSE available_at END,
          locked_at = NULL,
          locked_by = NULL,
          last_error = $4,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [normalizedId, reachedMax ? "failed" : "retry", nextAvailableAt, lastError]
    );
    return mapRow(result.rows[0]);
  }

  async requeueStaleRunningJobs({ staleAfterMs = 10 * 60 * 1000 } = {}) {
    const boundedStaleAfter = clampInt(staleAfterMs, 5000, 24 * 60 * 60 * 1000, 10 * 60 * 1000);
    const cutoffIso = new Date(Date.now() - boundedStaleAfter).toISOString();
    const result = await this._query(
      `
        UPDATE enrichment_jobs
        SET
          status = 'retry',
          available_at = NOW(),
          locked_at = NULL,
          locked_by = NULL,
          last_error = CASE
            WHEN COALESCE(last_error, '') = '' THEN 'Recovered after worker restart'
            ELSE left(last_error || '; recovered after worker restart', 4000)
          END,
          updated_at = NOW()
        WHERE status = 'running'
          AND (locked_at IS NULL OR locked_at < $1::timestamptz)
      `,
      [cutoffIso]
    );
    return Number(result.rowCount || 0);
  }

  async getQueueCounts({ workspaceId = "" } = {}) {
    let sql = `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('queued', 'retry') AND available_at <= NOW())::int AS pending,
        COUNT(*) FILTER (WHERE status = 'running')::int AS running,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
        COUNT(*) FILTER (WHERE status = 'retry')::int AS retry,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE status IN ('queued', 'retry') AND available_at > NOW())::int AS delayed,
        COUNT(*)::int AS total
      FROM enrichment_jobs
    `;
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const params = [];
    if (normalizedWorkspaceId) {
      sql += " WHERE workspace_id = $1";
      params.push(normalizedWorkspaceId);
    }
    const result = await this._query(sql, params);
    const row = result.rows[0] || {};
    return {
      pending: clampInt(row.pending, 0, 1000000000, 0),
      running: clampInt(row.running, 0, 1000000000, 0),
      failed: clampInt(row.failed, 0, 1000000000, 0),
      queued: clampInt(row.queued, 0, 1000000000, 0),
      retry: clampInt(row.retry, 0, 1000000000, 0),
      completed: clampInt(row.completed, 0, 1000000000, 0),
      delayed: clampInt(row.delayed, 0, 1000000000, 0),
      total: clampInt(row.total, 0, 1000000000, 0),
    };
  }

  async hasInFlightJobForNote({ workspaceId = "", noteId = "" } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedNoteId = String(noteId || "").trim();
    if (!normalizedWorkspaceId || !normalizedNoteId) return false;

    const result = await this._query(
      `
        SELECT COUNT(*)::int AS count
        FROM enrichment_jobs
        WHERE workspace_id = $1
          AND payload_json->>'noteId' = $2
          AND status IN ('queued', 'retry', 'running')
      `,
      [normalizedWorkspaceId, normalizedNoteId]
    );
    const count = clampInt(result.rows?.[0]?.count, 0, 1000000000, 0);
    return count > 0;
  }

  async retryFailedJobForNote({ workspaceId = "", noteId = "", visibilityUserId = null } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedNoteId = String(noteId || "").trim();
    if (!normalizedWorkspaceId || !normalizedNoteId) return null;

    const result = await this._query(
      `
        WITH candidate AS (
          SELECT id
          FROM enrichment_jobs
          WHERE workspace_id = $1
            AND payload_json->>'noteId' = $2
            AND status = 'failed'
          ORDER BY updated_at DESC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE enrichment_jobs AS jobs
        SET
          status = 'retry',
          available_at = NOW(),
          locked_at = NULL,
          locked_by = NULL,
          last_error = '',
          visibility_user_id = COALESCE($3, jobs.visibility_user_id),
          updated_at = NOW()
        FROM candidate
        WHERE jobs.id = candidate.id
        RETURNING jobs.*
      `,
      [normalizedWorkspaceId, normalizedNoteId, String(visibilityUserId || "").trim() || null]
    );
    return mapRow(result.rows[0]);
  }

  async listFailedJobs({ workspaceId = "", limit = 25 } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const boundedLimit = clampInt(limit, 1, 200, 25);
    if (!normalizedWorkspaceId) return [];

    const result = await this._query(
      `
        SELECT *
        FROM enrichment_jobs
        WHERE workspace_id = $1
          AND status = 'failed'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT $2
      `,
      [normalizedWorkspaceId, boundedLimit]
    );
    return result.rows.map(mapRow);
  }
}

export function createPostgresEnrichmentJobRepo(pool = undefined) {
  return new PostgresEnrichmentJobRepo(pool);
}
