import crypto from "node:crypto";
import { config } from "../config.js";
import { getPostgresPool } from "./pool.js";
import { ensurePostgresReady } from "./runtime.js";

const TASK_STATUS_OPEN = "open";
const TASK_STATUS_CLOSED = "closed";

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

function mapTaskRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
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

  async listOpenTasks(workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const result = await this._query(
      `
        SELECT * FROM tasks
        WHERE workspace_id = $1 AND status = $2
        ORDER BY created_at DESC, id DESC
      `,
      [normalizedWorkspaceId, TASK_STATUS_OPEN]
    );
    return result.rows.map(mapTaskRow);
  }

  async listTasks(status = TASK_STATUS_OPEN, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedStatus = status && String(status).trim() ? String(status).trim().toLowerCase() : null;
    const result = await this._query(
      `
        SELECT * FROM tasks
        WHERE workspace_id = $1 AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC, id DESC
      `,
      [normalizedWorkspaceId, normalizedStatus]
    );
    return result.rows.map(mapTaskRow);
  }

  async createTask({ title, status = TASK_STATUS_OPEN, workspaceId = config.defaultWorkspaceId }) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) {
      throw new Error("Missing task title");
    }
    const normalizedStatus = String(status || TASK_STATUS_OPEN).trim().toLowerCase() || TASK_STATUS_OPEN;
    const id = `task-${crypto.randomUUID()}`;
    const createdAt = nowIso();
    await this._query(
      `
        INSERT INTO tasks (id, workspace_id, title, status, created_at)
        VALUES ($1, $2, $3, $4, $5::timestamptz)
      `,
      [id, normalizedWorkspaceId, normalizedTitle, normalizedStatus, createdAt]
    );
    const result = await this._query(`SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      id,
      normalizedWorkspaceId,
    ]);
    return mapTaskRow(result.rows[0]);
  }

  async updateTask(id, { title, status } = {}, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    const existingResult = await this._query(`SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      normalizedId,
      normalizedWorkspaceId,
    ]);
    const existing = existingResult.rows[0];
    if (!existing) {
      throw new Error(`Task not found: ${normalizedId}`);
    }

    const nextTitle = title !== undefined ? String(title || "").trim() : existing.title;
    if (!nextTitle) {
      throw new Error("Task title cannot be empty");
    }
    const nextStatus = status !== undefined ? String(status || "").trim().toLowerCase() : existing.status;
    if (!nextStatus) {
      throw new Error("Task status cannot be empty");
    }

    await this._query(`UPDATE tasks SET title = $1, status = $2 WHERE id = $3 AND workspace_id = $4`, [
      nextTitle,
      nextStatus,
      normalizedId,
      normalizedWorkspaceId,
    ]);
    const updated = await this._query(`SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      normalizedId,
      normalizedWorkspaceId,
    ]);
    return mapTaskRow(updated.rows[0]);
  }

  async deleteTask(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }
    const existing = await this._query(`SELECT id FROM tasks WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      normalizedId,
      normalizedWorkspaceId,
    ]);
    if (!existing.rows[0]) {
      throw new Error(`Task not found: ${normalizedId}`);
    }
    await this._query(`DELETE FROM tasks WHERE id = $1 AND workspace_id = $2`, [normalizedId, normalizedWorkspaceId]);
    return { deleted: true, id: normalizedId };
  }

  async completeTask(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }
    const existing = await this._query(`SELECT id FROM tasks WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      normalizedId,
      normalizedWorkspaceId,
    ]);
    if (!existing.rows[0]) {
      throw new Error(`Task not found: ${normalizedId}`);
    }
    await this._query(`UPDATE tasks SET status = $1 WHERE id = $2 AND workspace_id = $3`, [
      TASK_STATUS_CLOSED,
      normalizedId,
      normalizedWorkspaceId,
    ]);
    const updated = await this._query(`SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      normalizedId,
      normalizedWorkspaceId,
    ]);
    return mapTaskRow(updated.rows[0]);
  }
}

export function createPostgresTaskRepo(pool = undefined) {
  return new PostgresTaskRepository(pool);
}
