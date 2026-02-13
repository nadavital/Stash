import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

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
    createdAt: row.created_at,
  };
}

class TaskRepository {
  constructor(dbPath = config.tasksDbPath) {
    this.db = new DatabaseSync(dbPath, { timeout: 5000 });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL DEFAULT '${String(config.defaultWorkspaceId).replace(/'/g, "''")}',
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    const columns = this.db.prepare("PRAGMA table_info(tasks)").all();
    const names = new Set(columns.map((col) => col.name));
    if (!names.has("workspace_id")) {
      this.db.exec(
        `ALTER TABLE tasks ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${String(config.defaultWorkspaceId).replace(/'/g, "''")}'`
      );
    }
    this.db.exec(
      `UPDATE tasks SET workspace_id = '${String(config.defaultWorkspaceId).replace(/'/g, "''")}' WHERE workspace_id IS NULL OR trim(workspace_id) = ''`
    );
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status ON tasks(workspace_id, status, created_at DESC)`);

    this.insertStmt = this.db.prepare(`
      INSERT INTO tasks (id, workspace_id, title, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.countStmt = this.db.prepare(`
      SELECT COUNT(*) AS count FROM tasks WHERE workspace_id = ?
    `);

    this.listOpenStmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE workspace_id = ? AND status = ?
      ORDER BY created_at DESC, id DESC
    `);

    this.listByStatusStmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE workspace_id = ? AND (? IS NULL OR status = ?)
      ORDER BY created_at DESC, id DESC
    `);

    this.getByIdStmt = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ? AND workspace_id = ?
    `);

    this.updateStatusStmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?
      WHERE id = ? AND workspace_id = ?
    `);

    this.updateTitleStmt = this.db.prepare(`
      UPDATE tasks
      SET title = ?
      WHERE id = ? AND workspace_id = ?
    `);

    this.deleteStmt = this.db.prepare(`
      DELETE FROM tasks WHERE id = ? AND workspace_id = ?
    `);

    this.seedSampleIfEmpty();
  }

  seedSampleIfEmpty() {
    const count = Number(this.countStmt.get(config.defaultWorkspaceId)?.count || 0);
    if (count > 0) return;

    const seeded = [
      {
        id: "task-001",
        title: "Ingest PDFs from Downloads",
        status: TASK_STATUS_OPEN,
        createdAt: nowIso(),
      },
      {
        id: "task-002",
        title: "Validate markdown extraction quality",
        status: TASK_STATUS_OPEN,
        createdAt: nowIso(),
      },
      {
        id: "task-003",
        title: "Close old migration checklist",
        status: "closed",
        createdAt: nowIso(),
      },
    ];

    for (const row of seeded) {
      this.insertStmt.run(row.id, config.defaultWorkspaceId, row.title, row.status, row.createdAt);
    }
  }

  listOpenTasks(workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    return this.listOpenStmt.all(normalizedWorkspaceId, TASK_STATUS_OPEN).map(mapTaskRow);
  }

  listTasks(status = TASK_STATUS_OPEN, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalized = status && String(status).trim() ? String(status).trim().toLowerCase() : null;
    return this.listByStatusStmt.all(normalizedWorkspaceId, normalized, normalized).map(mapTaskRow);
  }

  createTask({ title, status = TASK_STATUS_OPEN, workspaceId = config.defaultWorkspaceId }) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedTitle = String(title || "").trim();
    if (!normalizedTitle) {
      throw new Error("Missing task title");
    }
    const normalizedStatus = String(status || TASK_STATUS_OPEN).trim().toLowerCase() || TASK_STATUS_OPEN;
    const id = `task-${crypto.randomUUID()}`;
    const createdAt = nowIso();
    this.insertStmt.run(id, normalizedWorkspaceId, normalizedTitle, normalizedStatus, createdAt);
    return mapTaskRow(this.getByIdStmt.get(id, normalizedWorkspaceId));
  }

  updateTask(id, { title, status } = {}, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    const existing = this.getByIdStmt.get(normalizedId, normalizedWorkspaceId);
    if (!existing) {
      throw new Error(`Task not found: ${normalizedId}`);
    }

    if (title !== undefined) {
      const normalizedTitle = String(title || "").trim();
      if (!normalizedTitle) {
        throw new Error("Task title cannot be empty");
      }
      this.updateTitleStmt.run(normalizedTitle, normalizedId, normalizedWorkspaceId);
    }

    if (status !== undefined) {
      const normalizedStatus = String(status || "").trim().toLowerCase();
      if (!normalizedStatus) {
        throw new Error("Task status cannot be empty");
      }
      this.updateStatusStmt.run(normalizedStatus, normalizedId, normalizedWorkspaceId);
    }

    return mapTaskRow(this.getByIdStmt.get(normalizedId, normalizedWorkspaceId));
  }

  deleteTask(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    const existing = this.getByIdStmt.get(normalizedId, normalizedWorkspaceId);
    if (!existing) {
      throw new Error(`Task not found: ${normalizedId}`);
    }

    this.deleteStmt.run(normalizedId, normalizedWorkspaceId);
    return { deleted: true, id: normalizedId };
  }

  completeTask(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing task id");
    }

    const existing = this.getByIdStmt.get(normalizedId, normalizedWorkspaceId);
    if (!existing) {
      throw new Error(`Task not found: ${normalizedId}`);
    }

    this.updateStatusStmt.run(TASK_STATUS_CLOSED, normalizedId, normalizedWorkspaceId);
    return mapTaskRow(this.getByIdStmt.get(normalizedId, normalizedWorkspaceId));
  }
}

export const taskRepo = new TaskRepository();
