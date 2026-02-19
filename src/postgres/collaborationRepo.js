import crypto from "node:crypto";
import { config } from "../config.js";
import { getPostgresPool } from "./pool.js";
import { ensurePostgresReady } from "./runtime.js";

const FOLDER_ROLES = new Set(["viewer", "editor", "manager"]);

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function normalizeWorkspaceId(workspaceId = config.defaultWorkspaceId) {
  const normalized = String(workspaceId || config.defaultWorkspaceId || "").trim();
  if (!normalized) throw new Error("Missing workspace id");
  return normalized;
}

function normalizeFolderId(folderId) {
  const normalized = String(folderId || "").trim();
  if (!normalized) throw new Error("Missing folder id");
  return normalized;
}

function normalizeUserId(userId) {
  const normalized = String(userId || "").trim();
  if (!normalized) throw new Error("Missing user id");
  return normalized;
}

function normalizeFolderRole(role = "viewer") {
  const normalized = String(role || "").trim().toLowerCase();
  return FOLDER_ROLES.has(normalized) ? normalized : "viewer";
}

function mapFolderMemberRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    folderId: row.folder_id,
    userId: row.user_id,
    role: normalizeFolderRole(row.role || "viewer"),
    createdByUserId: row.created_by_user_id || null,
    userEmail: row.user_email || "",
    userName: row.user_name || "",
    createdByName: row.created_by_name || "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapActivityRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorUserId: row.actor_user_id || null,
    actorName: row.actor_name || "",
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id || "",
    folderId: row.folder_id || "",
    folderName: row.folder_name || "",
    noteId: row.note_id || "",
    visibilityUserId: row.visibility_user_id || null,
    details: row.details_json || {},
    createdAt: toIso(row.created_at),
  };
}

class PostgresCollaborationRepository {
  constructor(pool = getPostgresPool()) {
    this.pool = pool;
  }

  async _query(sql, params = []) {
    await ensurePostgresReady();
    return this.pool.query(sql, params);
  }

  async listFolderMembershipsForUser({
    workspaceId = config.defaultWorkspaceId,
    userId,
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const result = await this._query(
      `
        SELECT
          fm.id,
          fm.workspace_id,
          fm.folder_id,
          fm.user_id,
          fm.role,
          fm.created_by_user_id,
          fm.created_at,
          fm.updated_at,
          u.email AS user_email,
          u.display_name AS user_name
        FROM folder_memberships fm
        JOIN users u ON u.id = fm.user_id
        WHERE fm.workspace_id = $1 AND fm.user_id = $2
        ORDER BY fm.created_at ASC
      `,
      [normalizedWorkspaceId, normalizedUserId]
    );
    return result.rows.map(mapFolderMemberRow);
  }

  async getFolderMemberRole({
    workspaceId = config.defaultWorkspaceId,
    folderId,
    userId,
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedFolderId = normalizeFolderId(folderId);
    const normalizedUserId = normalizeUserId(userId);
    const result = await this._query(
      `
        SELECT role
        FROM folder_memberships
        WHERE workspace_id = $1 AND folder_id = $2 AND user_id = $3
        LIMIT 1
      `,
      [normalizedWorkspaceId, normalizedFolderId, normalizedUserId]
    );
    const rawRole = String(result.rows[0]?.role || "").trim();
    if (!rawRole) return "";
    return normalizeFolderRole(rawRole);
  }

  async listFolderMembers({
    workspaceId = config.defaultWorkspaceId,
    folderId,
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedFolderId = normalizeFolderId(folderId);
    const result = await this._query(
      `
        SELECT
          fm.id,
          fm.workspace_id,
          fm.folder_id,
          fm.user_id,
          fm.role,
          fm.created_by_user_id,
          fm.created_at,
          fm.updated_at,
          u.email AS user_email,
          u.display_name AS user_name,
          cb.display_name AS created_by_name
        FROM folder_memberships fm
        JOIN users u ON u.id = fm.user_id
        LEFT JOIN users cb ON cb.id = fm.created_by_user_id
        WHERE fm.workspace_id = $1 AND fm.folder_id = $2
        ORDER BY
          CASE fm.role
            WHEN 'manager' THEN 1
            WHEN 'editor' THEN 2
            ELSE 3
          END ASC,
          fm.created_at ASC
      `,
      [normalizedWorkspaceId, normalizedFolderId]
    );
    return result.rows.map(mapFolderMemberRow);
  }

  async upsertFolderMember({
    workspaceId = config.defaultWorkspaceId,
    folderId,
    userId,
    role = "viewer",
    createdByUserId = null,
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedFolderId = normalizeFolderId(folderId);
    const normalizedUserId = normalizeUserId(userId);
    const normalizedRole = normalizeFolderRole(role);
    const normalizedCreatedByUserId = String(createdByUserId || "").trim() || null;
    const timestamp = nowIso();

    await this._query(
      `
        INSERT INTO folder_memberships (
          id,
          workspace_id,
          folder_id,
          user_id,
          role,
          created_by_user_id,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz
        )
        ON CONFLICT (workspace_id, folder_id, user_id)
        DO UPDATE SET
          role = EXCLUDED.role,
          created_by_user_id = EXCLUDED.created_by_user_id,
          updated_at = EXCLUDED.updated_at
      `,
      [
        `fm_${crypto.randomUUID()}`,
        normalizedWorkspaceId,
        normalizedFolderId,
        normalizedUserId,
        normalizedRole,
        normalizedCreatedByUserId,
        timestamp,
        timestamp,
      ]
    );

    const result = await this._query(
      `
        SELECT
          fm.id,
          fm.workspace_id,
          fm.folder_id,
          fm.user_id,
          fm.role,
          fm.created_by_user_id,
          fm.created_at,
          fm.updated_at,
          u.email AS user_email,
          u.display_name AS user_name
        FROM folder_memberships fm
        JOIN users u ON u.id = fm.user_id
        WHERE fm.workspace_id = $1 AND fm.folder_id = $2 AND fm.user_id = $3
        LIMIT 1
      `,
      [normalizedWorkspaceId, normalizedFolderId, normalizedUserId]
    );
    return mapFolderMemberRow(result.rows[0]);
  }

  async removeFolderMember({
    workspaceId = config.defaultWorkspaceId,
    folderId,
    userId,
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedFolderId = normalizeFolderId(folderId);
    const normalizedUserId = normalizeUserId(userId);
    const result = await this._query(
      `
        DELETE FROM folder_memberships
        WHERE workspace_id = $1 AND folder_id = $2 AND user_id = $3
      `,
      [normalizedWorkspaceId, normalizedFolderId, normalizedUserId]
    );
    return Number(result.rowCount || 0);
  }

  async createActivityEvent({
    workspaceId = config.defaultWorkspaceId,
    actorUserId = null,
    actorName = "",
    eventType,
    entityType = "workspace",
    entityId = "",
    folderId = null,
    noteId = null,
    visibilityUserId = null,
    details = {},
    createdAt = "",
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedEventType = String(eventType || "").trim();
    if (!normalizedEventType) throw new Error("Missing event type");

    const normalizedEntityType = String(entityType || "workspace").trim() || "workspace";
    const normalizedActorUserId = String(actorUserId || "").trim() || null;
    const normalizedFolderId = String(folderId || "").trim() || null;
    const normalizedNoteId = String(noteId || "").trim() || null;
    const normalizedVisibilityUserId = String(visibilityUserId || "").trim() || null;
    const normalizedEntityId = String(entityId || "").trim() || null;
    const timestamp = String(createdAt || "").trim() || nowIso();
    const id = `aev_${crypto.randomUUID()}`;

    await this._query(
      `
        INSERT INTO activity_events (
          id,
          workspace_id,
          actor_user_id,
          actor_name,
          event_type,
          entity_type,
          entity_id,
          folder_id,
          note_id,
          visibility_user_id,
          details_json,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::timestamptz
        )
      `,
      [
        id,
        normalizedWorkspaceId,
        normalizedActorUserId,
        String(actorName || "").trim() || null,
        normalizedEventType,
        normalizedEntityType,
        normalizedEntityId,
        normalizedFolderId,
        normalizedNoteId,
        normalizedVisibilityUserId,
        JSON.stringify(details || {}),
        timestamp,
      ]
    );

    const result = await this._query(
      `
        SELECT
          a.*,
          f.name AS folder_name
        FROM activity_events a
        LEFT JOIN folders f ON f.id = a.folder_id
        WHERE a.id = $1
        LIMIT 1
      `,
      [id]
    );
    return mapActivityRow(result.rows[0]);
  }

  async listActivityEvents({
    workspaceId = config.defaultWorkspaceId,
    folderId = "",
    noteId = "",
    limit = 100,
  } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedFolderId = String(folderId || "").trim();
    const normalizedNoteId = String(noteId || "").trim();
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const result = await this._query(
      `
        SELECT
          a.*,
          f.name AS folder_name
        FROM activity_events a
        LEFT JOIN folders f ON f.id = a.folder_id
        WHERE
          a.workspace_id = $1
          AND ($2::text = '' OR a.folder_id = $2)
          AND ($3::text = '' OR a.note_id = $3)
        ORDER BY a.created_at DESC
        LIMIT $4
      `,
      [normalizedWorkspaceId, normalizedFolderId, normalizedNoteId, boundedLimit]
    );
    return result.rows.map(mapActivityRow);
  }
}

export function createPostgresCollaborationRepo(pool = undefined) {
  return new PostgresCollaborationRepository(pool);
}
