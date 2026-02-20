import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeBaseRevision(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("baseRevision must be a positive integer");
  }
  return Math.floor(parsed);
}

function createRevisionConflictError({
  id,
  baseRevision,
  currentNote = null,
}) {
  const error = new Error("Revision conflict: item changed since your last read");
  error.status = 409;
  error.code = "REVISION_CONFLICT";
  error.conflict = {
    id: String(id || "").trim(),
    baseRevision: normalizeBaseRevision(baseRevision),
    currentRevision: Number(currentNote?.revision || 0) || null,
    currentNote,
  };
  return error;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id || null,
    createdByUserId: row.created_by_user_id || null,
    content: row.content,
    sourceType: row.source_type,
    sourceUrl: row.source_url,
    imagePath: row.image_path,
    fileName: row.file_name,
    fileMime: row.file_mime,
    fileSize: row.file_size,
    rawContent: row.raw_content,
    markdownContent: row.markdown_content,
    summary: row.summary,
    tags: safeJsonParse(row.tags_json, []),
    project: row.project,
    status: row.status || "ready",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    embedding: safeJsonParse(row.embedding_json, null),
    metadata: safeJsonParse(row.metadata_json, {}),
    revision: Number(row.revision || 1),
  };
}

function normalizeWorkspaceId(workspaceId = config.defaultWorkspaceId) {
  const normalized = String(workspaceId || config.defaultWorkspaceId || "").trim();
  if (!normalized) {
    throw new Error("Missing workspace id");
  }
  return normalized;
}

function normalizeUserId(userId) {
  const normalized = String(userId || "").trim();
  if (!normalized) {
    throw new Error("Missing user id");
  }
  return normalized;
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

class NoteRepository {
  constructor(dbPath = config.dbPath) {
    this.db = new DatabaseSync(dbPath, { timeout: 5000 });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this._initSchema();
    this._migrateSchema();
    this._prepareStatements();
    this.rebuildFts();
  }

  _initSchema() {
    const defaultWorkspaceLiteral = escapeSqlString(config.defaultWorkspaceId);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL DEFAULT '${defaultWorkspaceLiteral}',
        owner_user_id TEXT,
        created_by_user_id TEXT,
        content TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_url TEXT,
        image_path TEXT,
        file_name TEXT,
        file_mime TEXT,
        file_size INTEGER,
        raw_content TEXT,
        markdown_content TEXT,
        summary TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        project TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        embedding_json TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'ready',
        revision INTEGER NOT NULL DEFAULT 1
      )
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_project_created ON notes(project, created_at DESC);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_source_type ON notes(source_type);`);

    this._createFtsTable();
  }

  _createFtsTable() {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        workspace_id UNINDEXED,
        note_id,
        content,
        summary,
        tags_text,
        project,
        file_name,
        raw_content,
        markdown_content,
        tokenize='porter unicode61'
      );
    `);
  }

  _tableExists(tableName) {
    const row = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
      .get(String(tableName || "").trim());
    return Boolean(row?.name);
  }

  _migrateSchema() {
    const columns = this.db.prepare("PRAGMA table_info(notes)").all();
    const names = new Set(columns.map((col) => col.name));
    const defaultWorkspaceLiteral = escapeSqlString(config.defaultWorkspaceId);

    const migrations = [
      { name: "workspace_id", sql: `ALTER TABLE notes ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${defaultWorkspaceLiteral}'` },
      { name: "owner_user_id", sql: "ALTER TABLE notes ADD COLUMN owner_user_id TEXT" },
      { name: "created_by_user_id", sql: "ALTER TABLE notes ADD COLUMN created_by_user_id TEXT" },
      { name: "file_name", sql: "ALTER TABLE notes ADD COLUMN file_name TEXT" },
      { name: "file_mime", sql: "ALTER TABLE notes ADD COLUMN file_mime TEXT" },
      { name: "file_size", sql: "ALTER TABLE notes ADD COLUMN file_size INTEGER" },
      { name: "raw_content", sql: "ALTER TABLE notes ADD COLUMN raw_content TEXT" },
      { name: "markdown_content", sql: "ALTER TABLE notes ADD COLUMN markdown_content TEXT" },
      { name: "status", sql: "ALTER TABLE notes ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'" },
      { name: "revision", sql: "ALTER TABLE notes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1" },
    ];

    for (const migration of migrations) {
      if (!names.has(migration.name)) {
        this.db.exec(migration.sql);
      }
    }

    this.db.exec(`
      UPDATE notes
      SET workspace_id = '${defaultWorkspaceLiteral}'
      WHERE workspace_id IS NULL OR trim(workspace_id) = ''
    `);

    this.db.exec(`
      UPDATE notes
      SET revision = 1
      WHERE revision IS NULL OR revision < 1
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_workspace_created ON notes(workspace_id, created_at DESC);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_workspace_project ON notes(workspace_id, project);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_workspace_owner ON notes(workspace_id, owner_user_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);`);

    // Best-effort backfill for pre-ownership rows using metadata.actorUserId when present.
    const ownershipRows = this.db.prepare(`
      SELECT id, owner_user_id, created_by_user_id, metadata_json
      FROM notes
      WHERE
        owner_user_id IS NULL OR trim(owner_user_id) = '' OR
        created_by_user_id IS NULL OR trim(created_by_user_id) = ''
    `).all();
    const backfillOwnershipStmt = this.db.prepare(`
      UPDATE notes
      SET owner_user_id = ?, created_by_user_id = ?
      WHERE id = ?
    `);
    for (const row of ownershipRows) {
      const metadata = safeJsonParse(row.metadata_json, {});
      const metadataActorUserId = String(metadata?.actorUserId || "").trim() || null;
      const currentOwner = String(row.owner_user_id || "").trim() || null;
      const currentCreator = String(row.created_by_user_id || "").trim() || null;
      const nextOwner = currentOwner || metadataActorUserId;
      const nextCreator = currentCreator || metadataActorUserId;
      if (nextOwner !== currentOwner || nextCreator !== currentCreator) {
        backfillOwnershipStmt.run(nextOwner, nextCreator, row.id);
      }
    }

    // If owner is missing but creator exists, promote creator to owner.
    this.db.exec(`
      UPDATE notes
      SET owner_user_id = created_by_user_id
      WHERE
        (owner_user_id IS NULL OR trim(owner_user_id) = '')
        AND created_by_user_id IS NOT NULL
        AND trim(created_by_user_id) <> ''
    `);

    // If a workspace has exactly one member, assign that member as owner for legacy rows.
    if (this._tableExists("workspace_memberships")) {
      const singletonWorkspaceRows = this.db
        .prepare(`
          SELECT workspace_id, MIN(user_id) AS user_id
          FROM workspace_memberships
          GROUP BY workspace_id
          HAVING COUNT(*) = 1
        `)
        .all();

      const assignSingletonOwnerStmt = this.db.prepare(`
        UPDATE notes
        SET
          owner_user_id = ?,
          created_by_user_id = CASE
            WHEN created_by_user_id IS NULL OR trim(created_by_user_id) = '' THEN ?
            ELSE created_by_user_id
          END
        WHERE
          workspace_id = ?
          AND (owner_user_id IS NULL OR trim(owner_user_id) = '')
      `);

      for (const row of singletonWorkspaceRows) {
        const workspaceId = String(row.workspace_id || "").trim();
        const userId = String(row.user_id || "").trim();
        if (!workspaceId || !userId) continue;
        assignSingletonOwnerStmt.run(userId, userId, workspaceId);
      }
    }

    // Recreate FTS table if it does not include workspace_id.
    let shouldRebuildFtsTable = false;
    try {
      const ftsColumns = this.db.prepare("PRAGMA table_info(notes_fts)").all();
      const ftsNames = new Set(ftsColumns.map((col) => col.name));
      shouldRebuildFtsTable = !ftsNames.has("workspace_id");
    } catch {
      shouldRebuildFtsTable = true;
    }

    if (shouldRebuildFtsTable) {
      this.db.exec("DROP TABLE IF EXISTS notes_fts");
      this._createFtsTable();
    }
  }

  _prepareStatements() {
    this.insertStmt = this.db.prepare(`
      INSERT INTO notes (
        id, workspace_id, owner_user_id, created_by_user_id, content, source_type, source_url, image_path,
        file_name, file_mime, file_size, raw_content, markdown_content,
        summary, tags_json, project,
        created_at, updated_at, embedding_json, metadata_json, status, revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.updateEnrichmentStmt = this.db.prepare(`
      UPDATE notes
      SET summary = ?, tags_json = ?, project = ?, embedding_json = ?, metadata_json = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?
    `);

    this.getByIdStmt = this.db.prepare(`
      SELECT * FROM notes WHERE id = ? AND workspace_id = ?
    `);

    this.recentStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `);

    this.recentForOwnerStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ? AND owner_user_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `);

    this.listByProjectStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ? AND (? IS NULL OR lower(ifnull(project, '')) = lower(?))
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `);

    this.listByProjectForOwnerStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ? AND owner_user_id = ? AND (? IS NULL OR lower(ifnull(project, '')) = lower(?))
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `);

    this.listExactProjectStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ? AND lower(ifnull(project, '')) = lower(?)
      ORDER BY datetime(created_at) DESC
    `);

    this.searchStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE
        workspace_id = ?
        AND (? IS NULL OR lower(ifnull(project, '')) = lower(?))
        AND (
          content LIKE ? OR
          summary LIKE ? OR
          tags_json LIKE ? OR
          ifnull(source_url, '') LIKE ? OR
          ifnull(raw_content, '') LIKE ? OR
          ifnull(markdown_content, '') LIKE ? OR
          ifnull(file_name, '') LIKE ?
        )
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `);

    this.projectListStmt = this.db.prepare(`
      SELECT DISTINCT project
      FROM notes
      WHERE workspace_id = ? AND project IS NOT NULL AND project <> ''
      ORDER BY project ASC
    `);

    this.projectListForOwnerStmt = this.db.prepare(`
      SELECT DISTINCT project
      FROM notes
      WHERE workspace_id = ? AND owner_user_id = ? AND project IS NOT NULL AND project <> ''
      ORDER BY project ASC
    `);

    this.updateStatusStmt = this.db.prepare(`
      UPDATE notes SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?
    `);

    this.ftsDeleteStmt = this.db.prepare(`DELETE FROM notes_fts WHERE note_id = ? AND workspace_id = ?`);
    this.ftsInsertStmt = this.db.prepare(`
      INSERT INTO notes_fts(workspace_id, note_id, content, summary, tags_text, project, file_name, raw_content, markdown_content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.ftsSearchStmt = this.db.prepare(`
      SELECT note_id
      FROM notes_fts
      WHERE notes_fts MATCH ? AND workspace_id = ?
      ORDER BY rank LIMIT ?
    `);
    this.ftsSearchProjectStmt = this.db.prepare(`
      SELECT note_id
      FROM notes_fts
      WHERE notes_fts MATCH ? AND workspace_id = ? AND lower(ifnull(project, '')) = lower(?)
      ORDER BY rank LIMIT ?
    `);

    this.recentWithOffsetStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `);

    this.recentWithOffsetForOwnerStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ? AND owner_user_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `);

    this.listByProjectWithOffsetStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ? AND (? IS NULL OR lower(ifnull(project, '')) = lower(?))
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `);

    this.listByProjectWithOffsetForOwnerStmt = this.db.prepare(`
      SELECT * FROM notes
      WHERE workspace_id = ? AND owner_user_id = ? AND (? IS NULL OR lower(ifnull(project, '')) = lower(?))
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `);

    this.countAllStmt = this.db.prepare(`SELECT COUNT(*) as cnt FROM notes WHERE workspace_id = ?`);
    this.countByProjectStmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM notes WHERE workspace_id = ? AND (? IS NULL OR lower(ifnull(project, '')) = lower(?))
    `);
    this.countAllForOwnerStmt = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM notes WHERE workspace_id = ? AND owner_user_id = ?
    `);

    this.deleteStmt = this.db.prepare(`DELETE FROM notes WHERE id = ? AND workspace_id = ?`);
    this.deleteByProjectStmt = this.db.prepare(
      `DELETE FROM notes WHERE workspace_id = ? AND lower(ifnull(project, '')) = lower(?)`
    );

    this.updateNoteStmt = this.db.prepare(`
      UPDATE notes
      SET
        content = ?,
        summary = ?,
        tags_json = ?,
        project = ?,
        metadata_json = COALESCE(?, metadata_json),
        updated_at = ?,
        revision = revision + 1
      WHERE id = ? AND workspace_id = ? AND (? IS NULL OR revision = ?)
    `);

    this.updateExtractedContentStmt = this.db.prepare(`
      UPDATE notes
      SET
        content = ?,
        summary = ?,
        tags_json = ?,
        project = ?,
        metadata_json = ?,
        raw_content = CASE WHEN ? THEN ? ELSE raw_content END,
        markdown_content = CASE WHEN ? THEN ? ELSE markdown_content END,
        updated_at = ?,
        revision = revision + 1
      WHERE id = ? AND workspace_id = ? AND (? IS NULL OR revision = ?)
    `);

    this.tagListStmt = this.db.prepare(`
      SELECT tags_json FROM notes WHERE workspace_id = ? AND tags_json != '[]'
    `);

    this.tagListForOwnerStmt = this.db.prepare(`
      SELECT tags_json FROM notes WHERE workspace_id = ? AND owner_user_id = ? AND tags_json != '[]'
    `);

    this.statsByProjectStmt = this.db.prepare(`
      SELECT project, COUNT(*) as cnt FROM notes
      WHERE workspace_id = ?
      GROUP BY project ORDER BY cnt DESC
    `);

    this.statsByProjectForOwnerStmt = this.db.prepare(`
      SELECT project, COUNT(*) as cnt FROM notes
      WHERE workspace_id = ? AND owner_user_id = ?
      GROUP BY project ORDER BY cnt DESC
    `);

    this.statsBySourceTypeStmt = this.db.prepare(`
      SELECT source_type, COUNT(*) as cnt FROM notes
      WHERE workspace_id = ?
      GROUP BY source_type ORDER BY cnt DESC
    `);

    this.statsBySourceTypeForOwnerStmt = this.db.prepare(`
      SELECT source_type, COUNT(*) as cnt FROM notes
      WHERE workspace_id = ? AND owner_user_id = ?
      GROUP BY source_type ORDER BY cnt DESC
    `);

    this.recentActivityStmt = this.db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as cnt FROM notes
      WHERE workspace_id = ? AND created_at >= ?
      GROUP BY date(created_at) ORDER BY day ASC
    `);

    this.recentActivityForOwnerStmt = this.db.prepare(`
      SELECT date(created_at) as day, COUNT(*) as cnt FROM notes
      WHERE workspace_id = ? AND owner_user_id = ? AND created_at >= ?
      GROUP BY date(created_at) ORDER BY day ASC
    `);

    this.updateProjectStmt = this.db.prepare(`
      UPDATE notes SET project = ?, updated_at = ? WHERE id = ? AND workspace_id = ?
    `);

    this.updateTagsStmt = this.db.prepare(`
      UPDATE notes SET tags_json = ?, updated_at = ? WHERE id = ? AND workspace_id = ?
    `);

    this.searchTagCandidatesStmt = this.db.prepare(`
      SELECT id, tags_json FROM notes WHERE workspace_id = ? AND tags_json LIKE ?
    `);

    this.allIdsStmt = this.db.prepare(`SELECT id FROM notes WHERE workspace_id = ?`);
  }

  syncFts(noteId, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const note = this.getNoteById(noteId, normalizedWorkspaceId);
    if (!note) return;
    this.ftsDeleteStmt.run(noteId, normalizedWorkspaceId);
    this.ftsInsertStmt.run(
      normalizedWorkspaceId,
      noteId,
      note.content || "",
      note.summary || "",
      (note.tags || []).join(" "),
      note.project || "",
      note.fileName || "",
      note.rawContent || "",
      note.markdownContent || ""
    );
  }

  rebuildFts(workspaceId = null) {
    if (workspaceId) {
      const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
      this.db.prepare(`DELETE FROM notes_fts WHERE workspace_id = ?`).run(normalizedWorkspaceId);
      const all = this.allIdsStmt.all(normalizedWorkspaceId);
      for (const row of all) {
        this.syncFts(row.id, normalizedWorkspaceId);
      }
      return;
    }

    this.db.exec(`DELETE FROM notes_fts`);
    const all = this.db.prepare(`SELECT id, workspace_id FROM notes`).all();
    for (const row of all) {
      this.syncFts(row.id, row.workspace_id);
    }
  }

  createNote(note) {
    const workspaceId = normalizeWorkspaceId(note.workspaceId);
    this.insertStmt.run(
      note.id,
      workspaceId,
      note.ownerUserId || null,
      note.createdByUserId || null,
      note.content,
      note.sourceType,
      note.sourceUrl,
      note.imagePath,
      note.fileName,
      note.fileMime,
      note.fileSize,
      note.rawContent,
      note.markdownContent,
      note.summary,
      JSON.stringify(note.tags || []),
      note.project,
      note.createdAt,
      note.updatedAt,
      note.embedding ? JSON.stringify(note.embedding) : null,
      JSON.stringify(note.metadata || {}),
      note.status || "ready",
      Number.isFinite(Number(note.revision)) ? Math.max(1, Math.floor(Number(note.revision))) : 1
    );
    const created = this.getNoteById(note.id, workspaceId);
    this.syncFts(note.id, workspaceId);
    return created;
  }

  updateStatus(id, status, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const now = nowIso();
    this.updateStatusStmt.run(status, now, id, normalizedWorkspaceId);
    return this.getNoteById(id, normalizedWorkspaceId);
  }

  updateEnrichment({ id, summary, tags, project, embedding, metadata, updatedAt, workspaceId = config.defaultWorkspaceId }) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    this.updateEnrichmentStmt.run(
      summary,
      JSON.stringify(tags || []),
      project,
      embedding ? JSON.stringify(embedding) : null,
      JSON.stringify(metadata || {}),
      updatedAt,
      id,
      normalizedWorkspaceId
    );
    this.syncFts(id, normalizedWorkspaceId);
    return this.getNoteById(id, normalizedWorkspaceId);
  }

  getNoteById(id, workspaceId = config.defaultWorkspaceId) {
    return mapRow(this.getByIdStmt.get(id, normalizeWorkspaceId(workspaceId)));
  }

  listRecent(limit = 20, offset = 0, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const bounded = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 20;
    const boundedOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
    if (boundedOffset > 0) {
      return this.recentWithOffsetStmt.all(normalizedWorkspaceId, bounded, boundedOffset).map(mapRow);
    }
    return this.recentStmt.all(normalizedWorkspaceId, bounded).map(mapRow);
  }

  listRecentForUser(limit = 20, offset = 0, workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const bounded = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 20;
    const boundedOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
    if (boundedOffset > 0) {
      return this.recentWithOffsetForOwnerStmt
        .all(normalizedWorkspaceId, normalizedUserId, bounded, boundedOffset)
        .map(mapRow);
    }
    return this.recentForOwnerStmt.all(normalizedWorkspaceId, normalizedUserId, bounded).map(mapRow);
  }

  listByProject(project = null, limit = 200, offset = 0, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const bounded = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 200;
    const boundedOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
    const normalized = project && project.trim() ? project.trim() : null;
    if (boundedOffset > 0) {
      return this.listByProjectWithOffsetStmt
        .all(normalizedWorkspaceId, normalized, normalized, bounded, boundedOffset)
        .map(mapRow);
    }
    return this.listByProjectStmt.all(normalizedWorkspaceId, normalized, normalized, bounded).map(mapRow);
  }

  listByProjectForUser(project = null, limit = 200, offset = 0, workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const bounded = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 200;
    const boundedOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.floor(Number(offset))) : 0;
    const normalized = project && project.trim() ? project.trim() : null;
    if (boundedOffset > 0) {
      return this.listByProjectWithOffsetForOwnerStmt
        .all(normalizedWorkspaceId, normalizedUserId, normalized, normalized, bounded, boundedOffset)
        .map(mapRow);
    }
    return this.listByProjectForOwnerStmt
      .all(normalizedWorkspaceId, normalizedUserId, normalized, normalized, bounded)
      .map(mapRow);
  }

  countNotes(project = null, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalized = project && project.trim() ? project.trim() : null;
    if (normalized) {
      return this.countByProjectStmt.get(normalizedWorkspaceId, normalized, normalized).cnt;
    }
    return this.countAllStmt.get(normalizedWorkspaceId).cnt;
  }

  listByExactProject(project, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalized = String(project || "").trim();
    if (!normalized) return [];
    return this.listExactProjectStmt.all(normalizedWorkspaceId, normalized).map(mapRow);
  }

  searchNotes(query, { project = null, limit = 50, workspaceId = config.defaultWorkspaceId } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const bounded = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 50;
    const normalized = project && project.trim() ? project.trim() : null;

    const ftsQuery = String(query || "")
      .replace(/[":*()]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => `"${token}"`)
      .join(" OR ");

    if (!ftsQuery) {
      return this.listByProject(normalized, bounded, 0, normalizedWorkspaceId);
    }

    try {
      const ftsRows = normalized
        ? this.ftsSearchProjectStmt.all(ftsQuery, normalizedWorkspaceId, normalized, bounded * 2)
        : this.ftsSearchStmt.all(ftsQuery, normalizedWorkspaceId, bounded * 2);

      const noteIds = ftsRows.map((row) => row.note_id);
      if (!noteIds.length) {
        return this._searchNotesLike(query, { project: normalized, limit: bounded, workspaceId: normalizedWorkspaceId });
      }

      const notes = noteIds
        .map((id) => this.getNoteById(id, normalizedWorkspaceId))
        .filter(Boolean)
        .slice(0, bounded);
      return notes;
    } catch {
      return this._searchNotesLike(query, { project: normalized, limit: bounded, workspaceId: normalizedWorkspaceId });
    }
  }

  _searchNotesLike(query, { project = null, limit = 50, workspaceId = config.defaultWorkspaceId } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const bounded = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(200, Number(limit))) : 50;
    const like = `%${query}%`;
    return this.searchStmt
      .all(normalizedWorkspaceId, project, project, like, like, like, like, like, like, like, bounded)
      .map(mapRow);
  }

  listProjects(workspaceId = config.defaultWorkspaceId) {
    return this.projectListStmt
      .all(normalizeWorkspaceId(workspaceId))
      .map((row) => row.project)
      .filter(Boolean);
  }

  listProjectsForUser(workspaceId = config.defaultWorkspaceId, userId) {
    return this.projectListForOwnerStmt
      .all(normalizeWorkspaceId(workspaceId), normalizeUserId(userId))
      .map((row) => row.project)
      .filter(Boolean);
  }

  deleteNote(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    this.ftsDeleteStmt.run(id, normalizedWorkspaceId);
    const result = this.deleteStmt.run(id, normalizedWorkspaceId);
    return Number(result?.changes || 0);
  }

  updateNote({
    id,
    content,
    summary,
    tags,
    project,
    metadata,
    workspaceId = config.defaultWorkspaceId,
    baseRevision = null,
  }) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedBaseRevision = normalizeBaseRevision(baseRevision);
    const now = nowIso();
    const result = this.updateNoteStmt.run(
      content,
      summary || "",
      JSON.stringify(tags || []),
      project || "",
      metadata === undefined ? null : JSON.stringify(metadata || {}),
      now,
      id,
      normalizedWorkspaceId,
      normalizedBaseRevision,
      normalizedBaseRevision
    );
    if (Number(result?.changes || 0) === 0 && normalizedBaseRevision !== null) {
      const currentNote = this.getNoteById(id, normalizedWorkspaceId);
      if (currentNote) {
        throw createRevisionConflictError({
          id,
          baseRevision: normalizedBaseRevision,
          currentNote,
        });
      }
    }
    this.syncFts(id, normalizedWorkspaceId);
    return this.getNoteById(id, normalizedWorkspaceId);
  }

  updateExtractedContent({
    id,
    content,
    summary,
    tags,
    project,
    metadata,
    rawContent,
    markdownContent,
    updatedAt,
    workspaceId = config.defaultWorkspaceId,
    baseRevision = null,
  }) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedBaseRevision = normalizeBaseRevision(baseRevision);
    const hasRawContent = rawContent !== undefined;
    const hasMarkdownContent = markdownContent !== undefined;
    const result = this.updateExtractedContentStmt.run(
      content,
      summary || "",
      JSON.stringify(tags || []),
      project || "",
      JSON.stringify(metadata || {}),
      hasRawContent ? 1 : 0,
      hasRawContent ? (rawContent === null ? null : String(rawContent)) : null,
      hasMarkdownContent ? 1 : 0,
      hasMarkdownContent ? (markdownContent === null ? null : String(markdownContent)) : null,
      updatedAt || nowIso(),
      id,
      normalizedWorkspaceId,
      normalizedBaseRevision,
      normalizedBaseRevision
    );
    if (Number(result?.changes || 0) === 0 && normalizedBaseRevision !== null) {
      const currentNote = this.getNoteById(id, normalizedWorkspaceId);
      if (currentNote) {
        throw createRevisionConflictError({
          id,
          baseRevision: normalizedBaseRevision,
          currentNote,
        });
      }
    }
    this.syncFts(id, normalizedWorkspaceId);
    return this.getNoteById(id, normalizedWorkspaceId);
  }

  listTags(workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const rows = this.tagListStmt.all(normalizedWorkspaceId);
    const tagCounts = {};
    for (const row of rows) {
      const tags = safeJsonParse(row.tags_json, []);
      for (const tag of tags) {
        const normalized = String(tag || "").trim().toLowerCase();
        if (normalized) {
          tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
        }
      }
    }
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  listTagsForUser(workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const rows = this.tagListForOwnerStmt.all(normalizedWorkspaceId, normalizedUserId);
    const tagCounts = {};
    for (const row of rows) {
      const tags = safeJsonParse(row.tags_json, []);
      for (const tag of tags) {
        const normalized = String(tag || "").trim().toLowerCase();
        if (normalized) {
          tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
        }
      }
    }
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  renameTag(oldTag, newTag, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedOld = String(oldTag || "").trim().toLowerCase();
    const normalizedNew = String(newTag || "").trim();
    if (!normalizedOld || !normalizedNew) return 0;

    const now = nowIso();
    let updated = 0;

    const allNotes = this.searchTagCandidatesStmt.all(normalizedWorkspaceId, `%${normalizedOld}%`);
    for (const note of allNotes) {
      const tags = safeJsonParse(note.tags_json, []);
      const idx = tags.findIndex((t) => String(t).trim().toLowerCase() === normalizedOld);
      if (idx === -1) continue;
      tags[idx] = normalizedNew;
      this.updateTagsStmt.run(JSON.stringify(tags), now, note.id, normalizedWorkspaceId);
      this.syncFts(note.id, normalizedWorkspaceId);
      updated++;
    }
    return updated;
  }

  removeTag(tag, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalized = String(tag || "").trim().toLowerCase();
    if (!normalized) return 0;

    const allNotes = this.searchTagCandidatesStmt.all(normalizedWorkspaceId, `%${normalized}%`);
    const now = nowIso();
    let updated = 0;

    for (const note of allNotes) {
      const tags = safeJsonParse(note.tags_json, []);
      const filtered = tags.filter((t) => String(t).trim().toLowerCase() !== normalized);
      if (filtered.length === tags.length) continue;
      this.updateTagsStmt.run(JSON.stringify(filtered), now, note.id, normalizedWorkspaceId);
      this.syncFts(note.id, normalizedWorkspaceId);
      updated++;
    }
    return updated;
  }

  getStats(workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const total = this.countAllStmt.get(normalizedWorkspaceId).cnt;
    const byProject = this.statsByProjectStmt.all(normalizedWorkspaceId).map((row) => ({
      project: row.project || "(none)",
      count: row.cnt,
    }));
    const bySourceType = this.statsBySourceTypeStmt.all(normalizedWorkspaceId).map((row) => ({
      sourceType: row.source_type,
      count: row.cnt,
    }));
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentActivity = this.recentActivityStmt.all(normalizedWorkspaceId, thirtyDaysAgo).map((row) => ({
      day: row.day,
      count: row.cnt,
    }));
    return { totalNotes: total, byProject, bySourceType, recentActivity };
  }

  getStatsForUser(workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const total = this.countAllForOwnerStmt.get(normalizedWorkspaceId, normalizedUserId).cnt;
    const byProject = this.statsByProjectForOwnerStmt.all(normalizedWorkspaceId, normalizedUserId).map((row) => ({
      project: row.project || "(none)",
      count: row.cnt,
    }));
    const bySourceType = this.statsBySourceTypeForOwnerStmt
      .all(normalizedWorkspaceId, normalizedUserId)
      .map((row) => ({
        sourceType: row.source_type,
        count: row.cnt,
      }));
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentActivity = this.recentActivityForOwnerStmt
      .all(normalizedWorkspaceId, normalizedUserId, thirtyDaysAgo)
      .map((row) => ({
        day: row.day,
        count: row.cnt,
      }));
    return { totalNotes: total, byProject, bySourceType, recentActivity };
  }

  batchDelete(ids, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    let deleted = 0;
    for (const id of ids) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) continue;
      this.ftsDeleteStmt.run(normalizedId, normalizedWorkspaceId);
      const result = this.deleteStmt.run(normalizedId, normalizedWorkspaceId);
      deleted += Number(result?.changes || 0);
    }
    return deleted;
  }

  batchMove(ids, project, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedProject = String(project || "").trim();
    const now = nowIso();
    let moved = 0;
    for (const id of ids) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) continue;
      const result = this.updateProjectStmt.run(normalizedProject, now, normalizedId, normalizedWorkspaceId);
      if (Number(result?.changes || 0) > 0) {
        this.syncFts(normalizedId, normalizedWorkspaceId);
        moved++;
      }
    }
    return moved;
  }

  exportNotes({ project = null, format = "json", workspaceId = config.defaultWorkspaceId } = {}) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const notes = project
      ? this.listByExactProject(project, normalizedWorkspaceId)
      : this.listRecent(10000, 0, normalizedWorkspaceId);

    if (format === "markdown") {
      return notes
        .map((note) => {
          const title = note.summary || note.content?.slice(0, 80) || "(untitled)";
          const tags = (note.tags || []).map((t) => `\`${t}\``).join(" ");
          const body = note.markdownContent || note.rawContent || note.content || "";
          return `## ${title}\n\n${tags ? `Tags: ${tags}\n\n` : ""}${body}\n\n---\n`;
        })
        .join("\n");
    }

    return JSON.stringify(notes, null, 2);
  }

  deleteByProject(project, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalized = String(project || "").trim();
    if (!normalized) return 0;

    const notes = this.listExactProjectStmt.all(normalizedWorkspaceId, normalized);
    for (const row of notes) {
      this.ftsDeleteStmt.run(row.id, normalizedWorkspaceId);
    }
    const result = this.deleteByProjectStmt.run(normalizedWorkspaceId, normalized);
    return Number(result?.changes || 0);
  }
}

export const noteRepo = new NoteRepository();
