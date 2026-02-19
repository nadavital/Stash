import crypto from "node:crypto";
import { config } from "../config.js";
import { getPostgresPool } from "./pool.js";
import { ensurePostgresReady } from "./runtime.js";

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
  if (!normalized) {
    throw new Error("Missing workspace id");
  }
  return normalized;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description || "",
    color: row.color || "green",
    symbol: row.symbol || "DOC",
    parentId: row.parent_id || null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

class PostgresFolderRepository {
  constructor(pool = getPostgresPool()) {
    this.pool = pool;
  }

  async _query(sql, params = []) {
    await ensurePostgresReady();
    return this.pool.query(sql, params);
  }

  async createFolder({
    name,
    description = "",
    color = "green",
    symbol = "DOC",
    parentId = null,
    workspaceId = config.defaultWorkspaceId,
  }) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) throw new Error("Missing folder name");
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const id = `folder-${crypto.randomUUID()}`;
    const timestamp = nowIso();
    const normalizedParentId = parentId ? String(parentId).trim() : null;
    await this._query(
      `
        INSERT INTO folders (id, workspace_id, name, description, color, symbol, parent_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)
      `,
      [
        id,
        normalizedWorkspaceId,
        normalizedName,
        String(description || ""),
        String(color || "green"),
        String(symbol || "DOC"),
        normalizedParentId,
        timestamp,
        timestamp,
      ]
    );
    const created = await this._query(`SELECT * FROM folders WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      id,
      normalizedWorkspaceId,
    ]);
    return mapRow(created.rows[0]);
  }

  async getFolder(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    const result = await this._query(`SELECT * FROM folders WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      normalizedId,
      normalizeWorkspaceId(workspaceId),
    ]);
    return mapRow(result.rows[0]);
  }

  async getFolderByName(name, workspaceId = config.defaultWorkspaceId) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return null;
    const result = await this._query(`SELECT * FROM folders WHERE name = $1 AND workspace_id = $2 LIMIT 1`, [
      normalizedName,
      normalizeWorkspaceId(workspaceId),
    ]);
    return mapRow(result.rows[0]);
  }

  async getFolderByNameInsensitive(name, workspaceId = config.defaultWorkspaceId) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return null;
    const result = await this._query(
      `SELECT * FROM folders WHERE workspace_id = $1 AND LOWER(name) = LOWER($2) ORDER BY created_at ASC LIMIT 1`,
      [normalizeWorkspaceId(workspaceId), normalizedName]
    );
    return mapRow(result.rows[0]);
  }

  async listFolders(parentId = null, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    if (parentId === undefined || parentId === null) {
      const result = await this._query(
        `
          SELECT * FROM folders
          WHERE workspace_id = $1 AND parent_id IS NULL
          ORDER BY name ASC
        `,
        [normalizedWorkspaceId]
      );
      return result.rows.map(mapRow);
    }
    const normalizedParentId = String(parentId).trim();
    const result = await this._query(
      `
        SELECT * FROM folders
        WHERE workspace_id = $1 AND parent_id = $2
        ORDER BY name ASC
      `,
      [normalizedWorkspaceId, normalizedParentId]
    );
    return result.rows.map(mapRow);
  }

  async listAllFolders(workspaceId = config.defaultWorkspaceId) {
    const result = await this._query(`SELECT * FROM folders WHERE workspace_id = $1 ORDER BY name ASC`, [
      normalizeWorkspaceId(workspaceId),
    ]);
    return result.rows.map(mapRow);
  }

  async updateFolder(id, patch = {}, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing folder id");

    const existing = await this.getFolder(normalizedId, normalizedWorkspaceId);
    if (!existing) throw new Error(`Folder not found: ${normalizedId}`);

    const name = patch.name !== undefined ? String(patch.name || "").trim() || existing.name : existing.name;
    const description = patch.description !== undefined ? String(patch.description || "") : existing.description;
    const color = patch.color !== undefined ? String(patch.color || "green") : existing.color;
    const symbol = patch.symbol !== undefined ? String(patch.symbol || "DOC") : existing.symbol;
    const parentId = patch.parentId !== undefined ? (patch.parentId ? String(patch.parentId).trim() : null) : existing.parentId;

    await this._query(
      `
        UPDATE folders
        SET name = $1, description = $2, color = $3, symbol = $4, parent_id = $5, updated_at = $6::timestamptz
        WHERE id = $7 AND workspace_id = $8
      `,
      [name, description, color, symbol, parentId, nowIso(), normalizedId, normalizedWorkspaceId]
    );
    return this.getFolder(normalizedId, normalizedWorkspaceId);
  }

  async deleteFolder(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing folder id");

    const existing = await this.getFolder(normalizedId, normalizedWorkspaceId);
    if (!existing) throw new Error(`Folder not found: ${normalizedId}`);

    await this._query(`DELETE FROM folders WHERE id = $1 AND workspace_id = $2`, [
      normalizedId,
      normalizedWorkspaceId,
    ]);
    return { deleted: true, id: normalizedId };
  }
}

export function createPostgresFolderRepo(pool = undefined) {
  return new PostgresFolderRepository(pool);
}
