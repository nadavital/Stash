import crypto from "node:crypto";
import { config } from "../config.js";
import { getPostgresPool } from "./pool.js";
import { ensurePostgresReady } from "./runtime.js";

const APPROVAL_PENDING = "pending_approval";
const APPROVAL_APPROVED = "approved";

const TASK_STATE_PENDING = "pending_approval";
const TASK_STATE_ACTIVE = "active";
const TASK_STATE_PAUSED = "paused";

const SCHEDULE_MANUAL = "manual";
const SCHEDULE_INTERVAL = "interval";

const SCOPE_WORKSPACE = "workspace";
const SCOPE_FOLDER = "folder";

const RUN_STATUS_RUNNING = "running";
const RUN_STATUS_SUCCEEDED = "succeeded";
const RUN_STATUS_FAILED = "failed";
const PAUSED_REASON_MANUAL = "manual_pause";
const PAUSED_REASON_AUTO_FAILURES = "auto_paused_after_failures";

function nowIso() {
  return new Date().toISOString();
}

function normalizeWorkspaceId(workspaceId = config.defaultWorkspaceId) {
  const normalized = String(workspaceId || config.defaultWorkspaceId || "").trim();
  if (!normalized) {
    throw new Error("Missing workspace id");
  }
  return normalized;
}

function mapIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeRunStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === RUN_STATUS_RUNNING) return RUN_STATUS_RUNNING;
  if (normalized === RUN_STATUS_SUCCEEDED || normalized === "success" || normalized === "completed") {
    return RUN_STATUS_SUCCEEDED;
  }
  if (normalized === RUN_STATUS_FAILED || normalized === "error") return RUN_STATUS_FAILED;
  return RUN_STATUS_FAILED;
}

function normalizeTaskFilterStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "all" || normalized === "any") return null;
  if (["pending_approval", "pending", "approval"].includes(normalized)) return TASK_STATE_PENDING;
  if (["active", "open", "running"].includes(normalized)) return TASK_STATE_ACTIVE;
  if (["paused", "inactive", "closed", "done", "completed"].includes(normalized)) return TASK_STATE_PAUSED;
  throw new Error("Invalid task status. Use pending_approval, active, paused, or all.");
}

function normalizeScheduleType(value = "", { intervalMinutes = null } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === SCHEDULE_INTERVAL) return SCHEDULE_INTERVAL;
  if (normalized === SCHEDULE_MANUAL) return SCHEDULE_MANUAL;
  return Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? SCHEDULE_INTERVAL : SCHEDULE_MANUAL;
}

function normalizeScopeType(value = "", { scopeFolder = "" } = {}) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === SCOPE_FOLDER) return SCOPE_FOLDER;
  if (normalized === SCOPE_WORKSPACE) return SCOPE_WORKSPACE;
  return String(scopeFolder || "").trim() ? SCOPE_FOLDER : SCOPE_WORKSPACE;
}

function normalizeIntervalMinutes(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("intervalMinutes must be a positive integer");
  }
  return Math.max(5, Math.min(7 * 24 * 60, Math.floor(parsed)));
}

function normalizeMaxActionsPerRun(value, fallback = 4) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("maxActionsPerRun must be a positive integer");
  }
  return Math.max(1, Math.min(25, Math.floor(parsed)));
}

function normalizeMaxConsecutiveFailures(value, fallback = 3) {
  if (value === undefined || value === null || value === "") {
    return Math.max(1, Math.min(20, Math.floor(Number(fallback) || 3)));
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("maxConsecutiveFailures must be a positive integer");
  }
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function normalizeMutationCount(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    const safeFallback = Number(fallback);
    if (!Number.isFinite(safeFallback) || safeFallback < 0) return 0;
    return Math.max(0, Math.min(100000, Math.floor(safeFallback)));
  }
  return Math.max(0, Math.min(100000, Math.floor(parsed)));
}

function extractRunMutationCount(output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) return 0;
  if (Array.isArray(output.mutations)) {
    return normalizeMutationCount(output.mutations.length, 0);
  }
  if (Object.prototype.hasOwnProperty.call(output, "mutationCount")) {
    return normalizeMutationCount(output.mutationCount, 0);
  }
  if (Object.prototype.hasOwnProperty.call(output, "mutationActions")) {
    return normalizeMutationCount(output.mutationActions, 0);
  }
  return 0;
}

function normalizeTimezone(value, fallback = "UTC") {
  const normalized = String(value || fallback).trim();
  return normalized || fallback;
}

function addMinutesIso(baseIso, minutes) {
  const parsed = new Date(baseIso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  parsed.setUTCMinutes(parsed.getUTCMinutes() + minutes);
  return parsed.toISOString();
}

function mapTaskState({ approvalStatus, status, enabled }) {
  if (approvalStatus === APPROVAL_PENDING) return TASK_STATE_PENDING;
  if (status === TASK_STATE_ACTIVE && enabled) return TASK_STATE_ACTIVE;
  return TASK_STATE_PAUSED;
}

function mapTaskRow(row) {
  if (!row) return null;

  const approvalStatus = String(row.approval_status || APPROVAL_PENDING);
  const status = String(row.status || TASK_STATE_PAUSED);
  const enabled = row.enabled === true;
  const name = String(row.name || "");

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    approvedByUserId: row.approved_by_user_id || "",
    title: name,
    name,
    prompt: String(row.prompt || ""),
    project: String(row.scope_folder || ""),
    scopeType: String(row.scope_type || SCOPE_WORKSPACE),
    scopeFolder: String(row.scope_folder || ""),
    scheduleType: String(row.schedule_type || SCHEDULE_MANUAL),
    intervalMinutes: row.interval_minutes === null || row.interval_minutes === undefined
      ? null
      : Number(row.interval_minutes),
    timezone: String(row.timezone || "UTC"),
    approvalStatus,
    enabled,
    status,
    state: mapTaskState({ approvalStatus, status, enabled }),
    maxActionsPerRun: Number(row.max_actions_per_run || 4),
    dryRun: row.dry_run === true,
    nextRunAt: mapIso(row.next_run_at),
    lastRunAt: mapIso(row.last_run_at),
    lastRunStatus: String(row.last_run_status || ""),
    lastError: String(row.last_error || ""),
    lastRunSummary: String(row.last_run_summary || ""),
    lastRunMutationCount: Number(row.last_run_mutation_count || 0),
    consecutiveFailures: Number(row.consecutive_failures || 0),
    maxConsecutiveFailures: Number(row.max_consecutive_failures || 3),
    pausedReason: String(row.paused_reason || ""),
    approvedAt: mapIso(row.approved_at),
    createdAt: mapIso(row.created_at),
    updatedAt: mapIso(row.updated_at),
  };
}

function mapTaskRunRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.automation_id,
    workspaceId: row.workspace_id,
    startedAt: mapIso(row.started_at),
    finishedAt: mapIso(row.finished_at),
    status: String(row.status || ""),
    summary: String(row.summary || ""),
    error: String(row.error || ""),
    trace: row.trace_json && typeof row.trace_json === "object" ? row.trace_json : null,
    output: row.output_json && typeof row.output_json === "object" ? row.output_json : null,
  };
}

class PostgresTaskRepository {
  constructor(pool = getPostgresPool()) {
    this.pool = pool;
  }

  async _query(sql, params = []) {
    await ensurePostgresReady();
    return this.pool.query(sql, params);
  }

  async _getTaskById(id, workspaceId) {
    const result = await this._query(
      `SELECT * FROM automations WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [id, workspaceId],
    );
    return mapTaskRow(result.rows[0]);
  }

  _computeNextRunAt({ scheduleType, intervalMinutes, enabled }) {
    if (!enabled || scheduleType !== SCHEDULE_INTERVAL || !Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      return null;
    }
    return addMinutesIso(nowIso(), intervalMinutes);
  }

  async listOpenTasks(workspaceId = config.defaultWorkspaceId) {
    return this.listTasks(TASK_STATE_ACTIVE, workspaceId);
  }

  async listTasks(status = null, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedStatus = normalizeTaskFilterStatus(status);

    if (!normalizedStatus) {
      const result = await this._query(
        `
          SELECT * FROM automations
          WHERE workspace_id = $1
          ORDER BY created_at DESC, id DESC
        `,
        [normalizedWorkspaceId],
      );
      return result.rows.map(mapTaskRow);
    }

    if (normalizedStatus === TASK_STATE_PENDING) {
      const result = await this._query(
        `
          SELECT * FROM automations
          WHERE workspace_id = $1
            AND approval_status = $2
          ORDER BY created_at DESC, id DESC
        `,
        [normalizedWorkspaceId, APPROVAL_PENDING],
      );
      return result.rows.map(mapTaskRow);
    }

    if (normalizedStatus === TASK_STATE_ACTIVE) {
      const result = await this._query(
        `
          SELECT * FROM automations
          WHERE workspace_id = $1
            AND approval_status = $2
            AND status = $3
            AND enabled = TRUE
          ORDER BY created_at DESC, id DESC
        `,
        [normalizedWorkspaceId, APPROVAL_APPROVED, TASK_STATE_ACTIVE],
      );
      return result.rows.map(mapTaskRow);
    }

    const result = await this._query(
      `
        SELECT * FROM automations
        WHERE workspace_id = $1
          AND approval_status = $2
          AND (status = $3 OR enabled = FALSE)
        ORDER BY created_at DESC, id DESC
      `,
      [normalizedWorkspaceId, APPROVAL_APPROVED, TASK_STATE_PAUSED],
    );
    return result.rows.map(mapTaskRow);
  }

  async getTask(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }
    const task = await this._getTaskById(normalizedId, normalizedWorkspaceId);
    if (!task) {
      throw new Error(`Task not found: ${normalizedId}`);
    }
    return task;
  }

  async createTask({
    title,
    name,
    prompt,
    project,
    scopeType,
    scopeFolder,
    scheduleType,
    intervalMinutes,
    timezone,
    maxActionsPerRun,
    maxConsecutiveFailures,
    dryRun,
    status,
    approvalStatus,
    enabled,
    workspaceId = config.defaultWorkspaceId,
    createdByUserId = "",
    approvedByUserId = "",
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

    const normalizedName = String(name || title || "").trim();
    if (!normalizedName) {
      throw new Error("Missing task title");
    }

    const normalizedPrompt = String(prompt || normalizedName).trim();
    if (!normalizedPrompt) {
      throw new Error("Missing task prompt");
    }

    const normalizedScopeFolder = String(scopeFolder || project || "").trim();
    const normalizedScopeType = normalizeScopeType(scopeType, { scopeFolder: normalizedScopeFolder });

    const normalizedIntervalMinutes = normalizeIntervalMinutes(intervalMinutes, null);
    const normalizedScheduleType = normalizeScheduleType(scheduleType, { intervalMinutes: normalizedIntervalMinutes });
    const resolvedIntervalMinutes = normalizedScheduleType === SCHEDULE_INTERVAL
      ? normalizeIntervalMinutes(normalizedIntervalMinutes, 60)
      : null;

    const normalizedApprovalStatus = String(approvalStatus || APPROVAL_PENDING).trim().toLowerCase() === APPROVAL_APPROVED
      ? APPROVAL_APPROVED
      : APPROVAL_PENDING;

    const requestedStatus = String(status || "").trim().toLowerCase();
    const normalizedStatus = requestedStatus === TASK_STATE_ACTIVE ? TASK_STATE_ACTIVE : TASK_STATE_PAUSED;

    const resolvedEnabled = normalizedApprovalStatus === APPROVAL_APPROVED && (enabled === true || normalizedStatus === TASK_STATE_ACTIVE);
    const resolvedStatus = resolvedEnabled ? TASK_STATE_ACTIVE : TASK_STATE_PAUSED;

    const normalizedCreatedBy = String(createdByUserId || "").trim() || "system";
    const normalizedApprovedBy = normalizedApprovalStatus === APPROVAL_APPROVED
      ? String(approvedByUserId || createdByUserId || "").trim() || null
      : null;

    const nextRunAt = this._computeNextRunAt({
      scheduleType: normalizedScheduleType,
      intervalMinutes: resolvedIntervalMinutes,
      enabled: resolvedEnabled,
    });
    const resolvedMaxConsecutiveFailures = normalizeMaxConsecutiveFailures(
      maxConsecutiveFailures,
      config.automationMaxConsecutiveFailuresDefault,
    );

    const now = nowIso();
    const id = `task-${crypto.randomUUID()}`;

    await this._query(
      `
        INSERT INTO automations (
          id,
          workspace_id,
          created_by_user_id,
          approved_by_user_id,
          name,
          prompt,
          scope_type,
          scope_folder,
          schedule_type,
          interval_minutes,
          timezone,
          approval_status,
          enabled,
          status,
          max_actions_per_run,
          max_consecutive_failures,
          dry_run,
          next_run_at,
          approved_at,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18::timestamptz,
          $19::timestamptz,
          $20::timestamptz,
          $21::timestamptz
        )
      `,
      [
        id,
        normalizedWorkspaceId,
        normalizedCreatedBy,
        normalizedApprovedBy,
        normalizedName,
        normalizedPrompt,
        normalizedScopeType,
        normalizedScopeFolder || null,
        normalizedScheduleType,
        resolvedIntervalMinutes,
        normalizeTimezone(timezone),
        normalizedApprovalStatus,
        resolvedEnabled,
        resolvedStatus,
        normalizeMaxActionsPerRun(maxActionsPerRun, 4),
        resolvedMaxConsecutiveFailures,
        dryRun === true,
        nextRunAt,
        normalizedApprovalStatus === APPROVAL_APPROVED ? now : null,
        now,
        now,
      ],
    );

    return this.getTask(id, normalizedWorkspaceId);
  }

  async updateTask(id, patch = {}, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    const existing = await this.getTask(normalizedId, normalizedWorkspaceId);

    const hasTitle = Object.prototype.hasOwnProperty.call(patch, "title") || Object.prototype.hasOwnProperty.call(patch, "name");
    const hasPrompt = Object.prototype.hasOwnProperty.call(patch, "prompt");
    const hasScopeFolder =
      Object.prototype.hasOwnProperty.call(patch, "scopeFolder") ||
      Object.prototype.hasOwnProperty.call(patch, "project") ||
      Object.prototype.hasOwnProperty.call(patch, "scope_folder");

    const nextName = hasTitle
      ? String(patch.name ?? patch.title ?? "").trim()
      : existing.name;
    if (!nextName) {
      throw new Error("Task title cannot be empty");
    }

    const nextPrompt = hasPrompt
      ? String(patch.prompt || "").trim()
      : existing.prompt;
    if (!nextPrompt) {
      throw new Error("Task prompt cannot be empty");
    }

    const nextScopeFolder = hasScopeFolder
      ? String(patch.scopeFolder ?? patch.scope_folder ?? patch.project ?? "").trim()
      : existing.scopeFolder;
    const nextScopeType = normalizeScopeType(
      Object.prototype.hasOwnProperty.call(patch, "scopeType") ? patch.scopeType : existing.scopeType,
      { scopeFolder: nextScopeFolder },
    );

    const nextIntervalMinutes = Object.prototype.hasOwnProperty.call(patch, "intervalMinutes")
      ? normalizeIntervalMinutes(patch.intervalMinutes, null)
      : existing.intervalMinutes;
    const nextScheduleType = normalizeScheduleType(
      Object.prototype.hasOwnProperty.call(patch, "scheduleType") ? patch.scheduleType : existing.scheduleType,
      { intervalMinutes: nextIntervalMinutes },
    );
    const resolvedIntervalMinutes = nextScheduleType === SCHEDULE_INTERVAL
      ? normalizeIntervalMinutes(nextIntervalMinutes, 60)
      : null;

    let nextStatus = existing.status;
    if (Object.prototype.hasOwnProperty.call(patch, "status")) {
      const normalizedStatusPatch = normalizeTaskFilterStatus(patch.status);
      if (!normalizedStatusPatch || normalizedStatusPatch === TASK_STATE_PENDING) {
        throw new Error("Invalid task status update. Use active or paused.");
      }
      nextStatus = normalizedStatusPatch;
    }

    let nextApprovalStatus = existing.approvalStatus;
    if (Object.prototype.hasOwnProperty.call(patch, "approvalStatus")) {
      nextApprovalStatus = String(patch.approvalStatus || "").trim().toLowerCase() === APPROVAL_APPROVED
        ? APPROVAL_APPROVED
        : APPROVAL_PENDING;
    }

    let nextEnabled = existing.enabled;
    if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
      nextEnabled = patch.enabled === true;
    }

    if (nextStatus === TASK_STATE_ACTIVE) {
      nextEnabled = true;
    }
    if (nextStatus === TASK_STATE_PAUSED) {
      nextEnabled = false;
    }

    if (nextApprovalStatus !== APPROVAL_APPROVED && (nextEnabled || nextStatus === TASK_STATE_ACTIVE)) {
      throw new Error("Task must be approved before it can be activated");
    }

    const nextMaxActionsPerRun = Object.prototype.hasOwnProperty.call(patch, "maxActionsPerRun")
      ? normalizeMaxActionsPerRun(patch.maxActionsPerRun, existing.maxActionsPerRun)
      : existing.maxActionsPerRun;
    const nextMaxConsecutiveFailures = Object.prototype.hasOwnProperty.call(patch, "maxConsecutiveFailures")
      ? normalizeMaxConsecutiveFailures(patch.maxConsecutiveFailures, existing.maxConsecutiveFailures)
      : existing.maxConsecutiveFailures;
    const nextDryRun = Object.prototype.hasOwnProperty.call(patch, "dryRun") ? patch.dryRun === true : existing.dryRun;
    const nextTimezone = Object.prototype.hasOwnProperty.call(patch, "timezone")
      ? normalizeTimezone(patch.timezone, existing.timezone)
      : existing.timezone;

    const nextRunAt = this._computeNextRunAt({
      scheduleType: nextScheduleType,
      intervalMinutes: resolvedIntervalMinutes,
      enabled: nextEnabled,
    });

    const approvedByUserId = existing.approvedByUserId || null;
    const approvedAt = existing.approvedAt || null;

    await this._query(
      `
        UPDATE automations
        SET
          name = $1,
          prompt = $2,
          scope_type = $3,
          scope_folder = $4,
          schedule_type = $5,
          interval_minutes = $6,
          timezone = $7,
          approval_status = $8,
          enabled = $9,
          status = $10,
          max_actions_per_run = $11,
          max_consecutive_failures = $12,
          dry_run = $13,
          next_run_at = $14::timestamptz,
          approved_by_user_id = $15,
          approved_at = $16::timestamptz,
          updated_at = $17::timestamptz
        WHERE id = $18 AND workspace_id = $19
      `,
      [
        nextName,
        nextPrompt,
        nextScopeType,
        nextScopeFolder || null,
        nextScheduleType,
        resolvedIntervalMinutes,
        nextTimezone,
        nextApprovalStatus,
        nextEnabled,
        nextStatus,
        nextMaxActionsPerRun,
        nextMaxConsecutiveFailures,
        nextDryRun,
        nextRunAt,
        approvedByUserId,
        approvedAt,
        nowIso(),
        normalizedId,
        normalizedWorkspaceId,
      ],
    );

    return this.getTask(normalizedId, normalizedWorkspaceId);
  }

  async deleteTask(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    const existing = await this._query(
      `SELECT id FROM automations WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [normalizedId, normalizedWorkspaceId],
    );
    if (!existing.rows[0]) {
      throw new Error(`Task not found: ${normalizedId}`);
    }

    await this._query(`DELETE FROM automations WHERE id = $1 AND workspace_id = $2`, [normalizedId, normalizedWorkspaceId]);
    return { deleted: true, id: normalizedId };
  }

  async approveTask(
    id,
    {
      approvedByUserId = "",
      activate = true,
    } = {},
    workspaceId = config.defaultWorkspaceId,
  ) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    const existing = await this.getTask(normalizedId, normalizedWorkspaceId);

    const nextStatus = activate ? TASK_STATE_ACTIVE : TASK_STATE_PAUSED;
    const nextEnabled = activate === true;
    const nextRunAt = this._computeNextRunAt({
      scheduleType: existing.scheduleType,
      intervalMinutes: existing.intervalMinutes,
      enabled: nextEnabled,
    });

    const now = nowIso();
    await this._query(
      `
        UPDATE automations
        SET
          approval_status = $1,
          approved_by_user_id = $2,
          approved_at = $3::timestamptz,
          status = $4,
          enabled = $5,
          next_run_at = $6::timestamptz,
          paused_reason = NULL,
          updated_at = $7::timestamptz
        WHERE id = $8 AND workspace_id = $9
      `,
      [
        APPROVAL_APPROVED,
        String(approvedByUserId || "").trim() || existing.approvedByUserId || null,
        now,
        nextStatus,
        nextEnabled,
        nextRunAt,
        now,
        normalizedId,
        normalizedWorkspaceId,
      ],
    );

    return this.getTask(normalizedId, normalizedWorkspaceId);
  }

  async pauseTask(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    await this.getTask(normalizedId, normalizedWorkspaceId);
    await this._query(
      `
        UPDATE automations
        SET
          status = $1,
          enabled = FALSE,
          next_run_at = NULL,
          paused_reason = $2,
          updated_at = $3::timestamptz
        WHERE id = $4 AND workspace_id = $5
      `,
      [TASK_STATE_PAUSED, PAUSED_REASON_MANUAL, nowIso(), normalizedId, normalizedWorkspaceId],
    );
    return this.getTask(normalizedId, normalizedWorkspaceId);
  }

  async completeTask(id, workspaceId = config.defaultWorkspaceId) {
    return this.pauseTask(id, workspaceId);
  }

  async resumeTask(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    const existing = await this.getTask(normalizedId, normalizedWorkspaceId);
    if (existing.approvalStatus !== APPROVAL_APPROVED) {
      throw new Error("Task must be approved before it can be resumed");
    }

    const nextRunAt = this._computeNextRunAt({
      scheduleType: existing.scheduleType,
      intervalMinutes: existing.intervalMinutes,
      enabled: true,
    });

    await this._query(
      `
        UPDATE automations
        SET
          status = $1,
          enabled = TRUE,
          next_run_at = $2::timestamptz,
          paused_reason = NULL,
          updated_at = $3::timestamptz
        WHERE id = $4 AND workspace_id = $5
      `,
      [TASK_STATE_ACTIVE, nextRunAt, nowIso(), normalizedId, normalizedWorkspaceId],
    );
    return this.getTask(normalizedId, normalizedWorkspaceId);
  }

  async claimDueTasks({ limit = 5, workspaceId = null } = {}) {
    const normalizedLimit = Math.max(1, Math.min(50, Math.floor(Number(limit) || 5)));
    const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : null;

    const result = await this._query(
      `
        WITH due AS (
          SELECT id
          FROM automations
          WHERE ($2::text IS NULL OR workspace_id = $2)
            AND approval_status = $3
            AND status = $4
            AND enabled = TRUE
            AND schedule_type = $5
            AND interval_minutes IS NOT NULL
            AND next_run_at IS NOT NULL
            AND next_run_at <= NOW()
          ORDER BY next_run_at ASC, created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE automations a
        SET
          next_run_at = NOW() + make_interval(mins => GREATEST(COALESCE(a.interval_minutes, 60), 5)),
          updated_at = NOW()
        FROM due
        WHERE a.id = due.id
        RETURNING a.*
      `,
      [
        normalizedLimit,
        normalizedWorkspaceId,
        APPROVAL_APPROVED,
        TASK_STATE_ACTIVE,
        SCHEDULE_INTERVAL,
      ],
    );

    return result.rows.map(mapTaskRow);
  }

  async createTaskRun({
    taskId,
    workspaceId = config.defaultWorkspaceId,
    status = RUN_STATUS_RUNNING,
    summary = "",
    error = "",
    trace = null,
    output = null,
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) {
      throw new Error("Missing task id");
    }

    const id = `run-${crypto.randomUUID()}`;
    const startedAt = nowIso();
    await this._query(
      `
        INSERT INTO automation_runs (
          id,
          automation_id,
          workspace_id,
          started_at,
          status,
          summary,
          error,
          trace_json,
          output_json
        ) VALUES ($1, $2, $3, $4::timestamptz, $5, $6, $7, $8::jsonb, $9::jsonb)
      `,
      [
        id,
        normalizedTaskId,
        normalizedWorkspaceId,
        startedAt,
        normalizeRunStatus(status),
        String(summary || ""),
        String(error || ""),
        trace && typeof trace === "object" ? JSON.stringify(trace) : null,
        output && typeof output === "object" ? JSON.stringify(output) : null,
      ],
    );

    const result = await this._query(`SELECT * FROM automation_runs WHERE id = $1 LIMIT 1`, [id]);
    return mapTaskRunRow(result.rows[0]);
  }

  async completeTaskRun(
    runId,
    {
      status = RUN_STATUS_SUCCEEDED,
      summary = "",
      error = "",
      trace = null,
      output = null,
    } = {},
  ) {
    const normalizedRunId = String(runId || "").trim();
    if (!normalizedRunId) {
      throw new Error("Missing run id");
    }

    const existingResult = await this._query(
      `SELECT * FROM automation_runs WHERE id = $1 LIMIT 1`,
      [normalizedRunId],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new Error(`Run not found: ${normalizedRunId}`);
    }

    const normalizedStatus = normalizeRunStatus(status);
    const normalizedSummary = String(summary || "");
    const normalizedError = String(error || "");
    const normalizedTrace = trace && typeof trace === "object" ? JSON.stringify(trace) : null;
    const normalizedOutput = output && typeof output === "object" ? JSON.stringify(output) : null;
    const runMutationCount = extractRunMutationCount(output);
    const finishedAt = nowIso();
    await this._query(
      `
        UPDATE automation_runs
        SET
          finished_at = $1::timestamptz,
          status = $2,
          summary = $3,
          error = $4,
          trace_json = $5::jsonb,
          output_json = $6::jsonb
        WHERE id = $7
      `,
      [
        finishedAt,
        normalizedStatus,
        normalizedSummary,
        normalizedError,
        normalizedTrace,
        normalizedOutput,
        normalizedRunId,
      ],
    );

    const automationResult = await this._query(
      `
        SELECT
          id,
          workspace_id,
          status,
          enabled,
          next_run_at,
          paused_reason,
          consecutive_failures,
          max_consecutive_failures
        FROM automations
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1
      `,
      [existing.automation_id, existing.workspace_id],
    );
    const automation = automationResult.rows[0] || null;

    const currentConsecutiveFailures = Number(automation?.consecutive_failures || 0);
    const nextConsecutiveFailures = normalizedStatus === RUN_STATUS_FAILED
      ? currentConsecutiveFailures + 1
      : 0;
    const maxConsecutiveFailures = normalizeMaxConsecutiveFailures(
      automation?.max_consecutive_failures,
      config.automationMaxConsecutiveFailuresDefault,
    );
    const shouldAutoPause = Boolean(
      automation &&
      normalizedStatus === RUN_STATUS_FAILED &&
      nextConsecutiveFailures >= maxConsecutiveFailures &&
      String(automation.status || "").trim().toLowerCase() === TASK_STATE_ACTIVE &&
      automation.enabled === true,
    );
    const nextStatus = shouldAutoPause
      ? TASK_STATE_PAUSED
      : String(automation?.status || TASK_STATE_PAUSED);
    const nextEnabled = shouldAutoPause ? false : automation?.enabled === true;
    const nextPausedReason = shouldAutoPause
      ? PAUSED_REASON_AUTO_FAILURES
      : automation?.paused_reason || null;
    const nextRunAt = shouldAutoPause ? null : mapIso(automation?.next_run_at);

    await this._query(
      `
        UPDATE automations
        SET
          last_run_at = $1::timestamptz,
          last_run_status = $2,
          last_error = $3,
          last_run_summary = $4,
          last_run_mutation_count = $5,
          consecutive_failures = $6,
          status = $7,
          enabled = $8,
          paused_reason = $9,
          next_run_at = $10::timestamptz,
          updated_at = $11::timestamptz
        WHERE id = $12 AND workspace_id = $13
      `,
      [
        finishedAt,
        normalizedStatus,
        normalizedStatus === RUN_STATUS_FAILED ? normalizedError : "",
        normalizedSummary,
        runMutationCount,
        nextConsecutiveFailures,
        nextStatus,
        nextEnabled,
        nextPausedReason,
        nextRunAt,
        finishedAt,
        existing.automation_id,
        existing.workspace_id,
      ],
    );

    const updatedResult = await this._query(`SELECT * FROM automation_runs WHERE id = $1 LIMIT 1`, [normalizedRunId]);
    return mapTaskRunRow(updatedResult.rows[0]);
  }

  async listTaskRuns(taskId, workspaceId = config.defaultWorkspaceId, { limit = 20 } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedTaskId = String(taskId || "").trim();
    if (!normalizedTaskId) {
      throw new Error("Missing task id");
    }

    const normalizedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
    const result = await this._query(
      `
        SELECT * FROM automation_runs
        WHERE automation_id = $1 AND workspace_id = $2
        ORDER BY started_at DESC
        LIMIT $3
      `,
      [normalizedTaskId, normalizedWorkspaceId, normalizedLimit],
    );
    return result.rows.map(mapTaskRunRow);
  }
}

export function createPostgresTaskRepo(pool = undefined) {
  return new PostgresTaskRepository(pool);
}
