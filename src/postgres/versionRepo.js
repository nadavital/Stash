import crypto from "node:crypto";
import { config } from "../config.js";
import { getPostgresPool } from "./pool.js";
import { ensurePostgresReady } from "./runtime.js";

function normalizeWorkspaceId(workspaceId = config.defaultWorkspaceId) {
  const normalized = String(workspaceId || config.defaultWorkspaceId || "").trim();
  if (!normalized) throw new Error("Missing workspace id");
  return normalized;
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value;
}

function toIso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function mapVersionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    noteId: row.note_id,
    workspaceId: row.workspace_id,
    versionNumber: Number(row.version_number),
    content: row.content,
    summary: row.summary,
    tags: safeJsonParse(row.tags_json, []),
    project: row.project,
    metadata: safeJsonParse(row.metadata_json, {}),
    actorUserId: row.actor_user_id || null,
    changeSummary: row.change_summary || "",
    createdAt: toIso(row.created_at),
  };
}

class PostgresVersionRepository {
  constructor(pool = getPostgresPool()) {
    this.pool = pool;
  }

  async _query(sql, params = []) {
    await ensurePostgresReady();
    return this.pool.query(sql, params);
  }

  async createSnapshot({ noteId, workspaceId, content, summary, tags, project, metadata, actorUserId, changeSummary }) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedNoteId = String(noteId || "").trim();
    if (!normalizedNoteId) throw new Error("Missing note id");

    // Get next version number
    const countResult = await this._query(
      `SELECT COALESCE(MAX(version_number), 0)::int AS max_v FROM note_versions WHERE note_id = $1 AND workspace_id = $2`,
      [normalizedNoteId, normalizedWorkspaceId]
    );
    const nextVersion = (countResult.rows[0]?.max_v || 0) + 1;
    const id = crypto.randomUUID();

    await this._query(
      `INSERT INTO note_versions (id, note_id, workspace_id, version_number, content, summary, tags_json, project, metadata_json, actor_user_id, change_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11)`,
      [
        id,
        normalizedNoteId,
        normalizedWorkspaceId,
        nextVersion,
        content || "",
        summary || "",
        JSON.stringify(tags || []),
        project || null,
        JSON.stringify(metadata || {}),
        actorUserId || null,
        changeSummary || "",
      ]
    );

    return { id, versionNumber: nextVersion };
  }

  async listVersions(noteId, workspaceId, { limit = 50 } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedNoteId = String(noteId || "").trim();
    if (!normalizedNoteId) return [];
    const result = await this._query(
      `SELECT * FROM note_versions WHERE note_id = $1 AND workspace_id = $2 ORDER BY version_number DESC LIMIT $3`,
      [normalizedNoteId, normalizedWorkspaceId, Math.min(Math.max(limit, 1), 200)]
    );
    return result.rows.map(mapVersionRow);
  }

  async getVersion(noteId, versionNumber, workspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedNoteId = String(noteId || "").trim();
    if (!normalizedNoteId) return null;
    const result = await this._query(
      `SELECT * FROM note_versions WHERE note_id = $1 AND workspace_id = $2 AND version_number = $3 LIMIT 1`,
      [normalizedNoteId, normalizedWorkspaceId, Number(versionNumber)]
    );
    return mapVersionRow(result.rows[0]);
  }
}

export function createPostgresVersionRepo(pool = undefined) {
  return new PostgresVersionRepository(pool);
}
