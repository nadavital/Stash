import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class FolderRepository {
  constructor(dbPath = config.dbPath) {
    this.db = new DatabaseSync(dbPath, { timeout: 5000 });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL DEFAULT '${String(config.defaultWorkspaceId).replace(/'/g, "''")}',
        name TEXT NOT NULL,
        description TEXT,
        color TEXT DEFAULT 'green',
        symbol TEXT DEFAULT 'DOC',
        parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_folders_name ON folders(name)
    `);

    const columns = this.db.prepare("PRAGMA table_info(folders)").all();
    const names = new Set(columns.map((col) => col.name));
    if (!names.has("workspace_id")) {
      this.db.exec(
        `ALTER TABLE folders ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${String(config.defaultWorkspaceId).replace(/'/g, "''")}'`
      );
    }
    this.db.exec(
      `UPDATE folders SET workspace_id = '${String(config.defaultWorkspaceId).replace(/'/g, "''")}' WHERE workspace_id IS NULL OR trim(workspace_id) = ''`
    );
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_folders_workspace ON folders(workspace_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_folders_workspace_name ON folders(workspace_id, name)
    `);

    this.insertStmt = this.db.prepare(`
      INSERT INTO folders (id, workspace_id, name, description, color, symbol, parent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getByIdStmt = this.db.prepare(`SELECT * FROM folders WHERE id = ? AND workspace_id = ?`);
    this.getByNameStmt = this.db.prepare(`SELECT * FROM folders WHERE name = ? AND workspace_id = ? LIMIT 1`);
    this.getByNameInsensitiveStmt = this.db.prepare(
      `SELECT * FROM folders WHERE workspace_id = ? AND name = ? COLLATE NOCASE ORDER BY datetime(created_at) ASC LIMIT 1`
    );

    this.listByParentStmt = this.db.prepare(`
      SELECT * FROM folders
      WHERE workspace_id = ? AND ((? IS NULL AND parent_id IS NULL) OR parent_id = ?)
      ORDER BY name ASC
    `);

    this.listAllStmt = this.db.prepare(`
      SELECT * FROM folders WHERE workspace_id = ? ORDER BY name ASC
    `);

    this.updateStmt = this.db.prepare(`
      UPDATE folders SET name=?, description=?, color=?, symbol=?, parent_id=?, updated_at=?
      WHERE id=? AND workspace_id=?
    `);

    this.deleteStmt = this.db.prepare(`DELETE FROM folders WHERE id = ? AND workspace_id = ?`);
  }

  createFolder({ name, description = "", color = "green", symbol = "DOC", parentId = null, workspaceId = config.defaultWorkspaceId }) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) throw new Error("Missing folder name");
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

    const id = `folder-${crypto.randomUUID()}`;
    const now = nowIso();
    const normalizedParent = parentId ? String(parentId).trim() : null;

    this.insertStmt.run(
      id,
      normalizedWorkspaceId,
      normalizedName,
      description || "",
      color || "green",
      symbol || "DOC",
      normalizedParent,
      now,
      now
    );

    return mapRow(this.getByIdStmt.get(id, normalizedWorkspaceId));
  }

  getFolder(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    return mapRow(this.getByIdStmt.get(normalizedId, normalizeWorkspaceId(workspaceId)));
  }

  getFolderByName(name, workspaceId = config.defaultWorkspaceId) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return null;
    return mapRow(this.getByNameStmt.get(normalizedName, normalizeWorkspaceId(workspaceId)));
  }

  getFolderByNameInsensitive(name, workspaceId = config.defaultWorkspaceId) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return null;
    return mapRow(this.getByNameInsensitiveStmt.get(normalizeWorkspaceId(workspaceId), normalizedName));
  }

  listFolders(parentId = null, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    if (parentId === undefined || parentId === null) {
      return this.listByParentStmt.all(normalizedWorkspaceId, null, null).map(mapRow);
    }
    const normalizedParent = String(parentId).trim();
    return this.listByParentStmt.all(normalizedWorkspaceId, normalizedParent, normalizedParent).map(mapRow);
  }

  listAllFolders(workspaceId = config.defaultWorkspaceId) {
    return this.listAllStmt.all(normalizeWorkspaceId(workspaceId)).map(mapRow);
  }

  updateFolder(id, patch = {}, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing folder id");

    const existing = this.getByIdStmt.get(normalizedId, normalizedWorkspaceId);
    if (!existing) throw new Error(`Folder not found: ${normalizedId}`);

    const name = patch.name !== undefined ? String(patch.name || "").trim() || existing.name : existing.name;
    const description = patch.description !== undefined ? String(patch.description || "") : existing.description;
    const color = patch.color !== undefined ? String(patch.color || "green") : existing.color;
    const symbol = patch.symbol !== undefined ? String(patch.symbol || "DOC") : existing.symbol;
    const parentId = patch.parentId !== undefined ? (patch.parentId ? String(patch.parentId).trim() : null) : existing.parent_id;

    this.updateStmt.run(name, description, color, symbol, parentId, nowIso(), normalizedId, normalizedWorkspaceId);
    return mapRow(this.getByIdStmt.get(normalizedId, normalizedWorkspaceId));
  }

  deleteFolder(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing folder id");

    const existing = this.getByIdStmt.get(normalizedId, normalizedWorkspaceId);
    if (!existing) throw new Error(`Folder not found: ${normalizedId}`);

    this.deleteStmt.run(normalizedId, normalizedWorkspaceId);
    return { deleted: true, id: normalizedId };
  }
}

export const folderRepo = new FolderRepository();
