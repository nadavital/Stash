import { config } from "../config.js";
import { getPostgresPool } from "./pool.js";
import { ensurePostgresReady } from "./runtime.js";

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

function normalizeUserId(userId) {
  const normalized = String(userId || "").trim();
  if (!normalized) {
    throw new Error("Missing user id");
  }
  return normalized;
}

function toIso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
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
    fileSize: row.file_size === null || row.file_size === undefined ? null : Number(row.file_size),
    rawContent: row.raw_content,
    markdownContent: row.markdown_content,
    summary: row.summary,
    tags: safeJsonParse(row.tags_json, []),
    project: row.project,
    status: row.status || "ready",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    embedding: safeJsonParse(row.embedding_json, null),
    metadata: safeJsonParse(row.metadata_json, {}),
    revision: Number(row.revision || 1),
  };
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

class PostgresNoteRepository {
  constructor(pool = getPostgresPool()) {
    this.pool = pool;
  }

  async _query(sql, params = []) {
    await ensurePostgresReady();
    return this.pool.query(sql, params);
  }

  async createNote(note) {
    const workspaceId = normalizeWorkspaceId(note.workspaceId);
    await this._query(
      `
        INSERT INTO notes (
          id, workspace_id, owner_user_id, created_by_user_id, content, source_type, source_url, image_path,
          file_name, file_mime, file_size, raw_content, markdown_content, summary, tags_json, project,
          created_at, updated_at, embedding_json, metadata_json, status, revision
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15::jsonb, $16,
          $17::timestamptz, $18::timestamptz, $19::jsonb, $20::jsonb, $21, $22
        )
      `,
      [
        note.id,
        workspaceId,
        note.ownerUserId || null,
        note.createdByUserId || null,
        note.content,
        note.sourceType,
        note.sourceUrl || null,
        note.imagePath || null,
        note.fileName || null,
        note.fileMime || null,
        note.fileSize === undefined ? null : note.fileSize,
        note.rawContent || null,
        note.markdownContent || null,
        note.summary || "",
        JSON.stringify(note.tags || []),
        note.project || null,
        note.createdAt || nowIso(),
        note.updatedAt || nowIso(),
        note.embedding ? JSON.stringify(note.embedding) : null,
        JSON.stringify(note.metadata || {}),
        note.status || "ready",
        Number.isFinite(Number(note.revision)) ? Math.max(1, Math.floor(Number(note.revision))) : 1,
      ]
    );
    return this.getNoteById(note.id, workspaceId);
  }

  async updateStatus(id, status, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    await this._query(
      `UPDATE notes SET status = $1, updated_at = $2::timestamptz WHERE id = $3 AND workspace_id = $4`,
      [String(status || "ready"), nowIso(), String(id || "").trim(), normalizedWorkspaceId]
    );
    return this.getNoteById(id, normalizedWorkspaceId);
  }

  async updateEnrichment({
    id,
    summary,
    tags,
    project,
    embedding,
    metadata,
    rawContent,
    markdownContent,
    updatedAt,
    workspaceId = config.defaultWorkspaceId,
  }) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const hasRawContent = rawContent !== undefined;
    const hasMarkdownContent = markdownContent !== undefined;
    await this._query(
      `
        UPDATE notes
        SET
          summary = $1,
          tags_json = $2::jsonb,
          project = $3,
          embedding_json = $4::jsonb,
          metadata_json = $5::jsonb,
          raw_content = CASE WHEN $6::boolean THEN $7::text ELSE raw_content END,
          markdown_content = CASE WHEN $8::boolean THEN $9::text ELSE markdown_content END,
          updated_at = $10::timestamptz
        WHERE id = $11 AND workspace_id = $12
      `,
      [
        summary || "",
        JSON.stringify(tags || []),
        project || null,
        embedding ? JSON.stringify(embedding) : null,
        JSON.stringify(metadata || {}),
        hasRawContent,
        hasRawContent
          ? (rawContent === null ? null : String(rawContent))
          : null,
        hasMarkdownContent,
        hasMarkdownContent
          ? (markdownContent === null ? null : String(markdownContent))
          : null,
        updatedAt || nowIso(),
        String(id || "").trim(),
        normalizedWorkspaceId,
      ]
    );
    return this.getNoteById(id, normalizedWorkspaceId);
  }

  async getNoteById(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    const result = await this._query(`SELECT * FROM notes WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
      normalizedId,
      normalizedWorkspaceId,
    ]);
    return mapRow(result.rows[0]);
  }

  async listRecent(limit = 20, offset = 0, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const boundedLimit = clampInt(limit, 1, 200, 20);
    const boundedOffset = clampInt(offset, 0, 100000, 0);
    const result = await this._query(
      `
        SELECT * FROM notes
        WHERE workspace_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3
      `,
      [normalizedWorkspaceId, boundedLimit, boundedOffset]
    );
    return result.rows.map(mapRow);
  }

  async listRecentForUser(limit = 20, offset = 0, workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const boundedLimit = clampInt(limit, 1, 200, 20);
    const boundedOffset = clampInt(offset, 0, 100000, 0);
    const result = await this._query(
      `
        SELECT * FROM notes
        WHERE workspace_id = $1 AND owner_user_id = $2
        ORDER BY created_at DESC, id DESC
        LIMIT $3 OFFSET $4
      `,
      [normalizedWorkspaceId, normalizedUserId, boundedLimit, boundedOffset]
    );
    return result.rows.map(mapRow);
  }

  async listByProject(project = null, limit = 200, offset = 0, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedProject = project && String(project).trim() ? String(project).trim() : null;
    const boundedLimit = clampInt(limit, 1, 500, 200);
    const boundedOffset = clampInt(offset, 0, 100000, 0);
    const result = await this._query(
      `
        SELECT * FROM notes
        WHERE workspace_id = $1 AND ($2::text IS NULL OR LOWER(COALESCE(project, '')) = LOWER($2))
        ORDER BY created_at DESC, id DESC
        LIMIT $3 OFFSET $4
      `,
      [normalizedWorkspaceId, normalizedProject, boundedLimit, boundedOffset]
    );
    return result.rows.map(mapRow);
  }

  async listByProjectForUser(project = null, limit = 200, offset = 0, workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const normalizedProject = project && String(project).trim() ? String(project).trim() : null;
    const boundedLimit = clampInt(limit, 1, 500, 200);
    const boundedOffset = clampInt(offset, 0, 100000, 0);
    const result = await this._query(
      `
        SELECT * FROM notes
        WHERE workspace_id = $1
          AND owner_user_id = $2
          AND ($3::text IS NULL OR LOWER(COALESCE(project, '')) = LOWER($3))
        ORDER BY created_at DESC, id DESC
        LIMIT $4 OFFSET $5
      `,
      [normalizedWorkspaceId, normalizedUserId, normalizedProject, boundedLimit, boundedOffset]
    );
    return result.rows.map(mapRow);
  }

  async countNotes(project = null, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedProject = project && String(project).trim() ? String(project).trim() : null;
    const result = await this._query(
      `
        SELECT COUNT(*)::int AS cnt
        FROM notes
        WHERE workspace_id = $1 AND ($2::text IS NULL OR LOWER(COALESCE(project, '')) = LOWER($2))
      `,
      [normalizedWorkspaceId, normalizedProject]
    );
    return Number(result.rows[0]?.cnt || 0);
  }

  async listByExactProject(project, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedProject = String(project || "").trim();
    if (!normalizedProject) return [];
    const result = await this._query(
      `
        SELECT * FROM notes
        WHERE workspace_id = $1 AND LOWER(COALESCE(project, '')) = LOWER($2)
        ORDER BY created_at DESC, id DESC
      `,
      [normalizedWorkspaceId, normalizedProject]
    );
    return result.rows.map(mapRow);
  }

  async searchNotes(query, { project = null, limit = 50, workspaceId = config.defaultWorkspaceId } = {}) {
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      return this.listByProject(project, limit, 0, workspaceId);
    }
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedProject = project && String(project).trim() ? String(project).trim() : null;
    const boundedLimit = clampInt(limit, 1, 200, 50);
    const like = `%${normalizedQuery}%`;
    const result = await this._query(
      `
        SELECT * FROM notes
        WHERE workspace_id = $1
          AND ($2::text IS NULL OR LOWER(COALESCE(project, '')) = LOWER($2))
          AND (
            content ILIKE $3 OR
            COALESCE(summary, '') ILIKE $3 OR
            COALESCE(tags_json::text, '[]') ILIKE $3 OR
            COALESCE(source_url, '') ILIKE $3 OR
            COALESCE(raw_content, '') ILIKE $3 OR
            COALESCE(markdown_content, '') ILIKE $3 OR
            COALESCE(file_name, '') ILIKE $3
          )
        ORDER BY created_at DESC, id DESC
        LIMIT $4
      `,
      [normalizedWorkspaceId, normalizedProject, like, boundedLimit]
    );
    return result.rows.map(mapRow);
  }

  async listProjects(workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const result = await this._query(
      `
        SELECT DISTINCT project
        FROM notes
        WHERE workspace_id = $1 AND project IS NOT NULL AND project <> ''
        ORDER BY project ASC
      `,
      [normalizedWorkspaceId]
    );
    return result.rows.map((row) => row.project).filter(Boolean);
  }

  async listProjectsForUser(workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const result = await this._query(
      `
        SELECT DISTINCT project
        FROM notes
        WHERE workspace_id = $1
          AND owner_user_id = $2
          AND project IS NOT NULL
          AND project <> ''
        ORDER BY project ASC
      `,
      [normalizedWorkspaceId, normalizedUserId]
    );
    return result.rows.map((row) => row.project).filter(Boolean);
  }

  async deleteNote(id, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return 0;
    const result = await this._query(`DELETE FROM notes WHERE id = $1 AND workspace_id = $2`, [
      normalizedId,
      normalizedWorkspaceId,
    ]);
    return Number(result.rowCount || 0);
  }

  async updateNote({
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
    const normalizedId = String(id || "").trim();
    const expectedRevision = normalizeBaseRevision(baseRevision);
    const result = await this._query(
      `
        UPDATE notes
        SET
          content = $1,
          summary = $2,
          tags_json = $3::jsonb,
          project = $4,
          metadata_json = COALESCE($5::jsonb, metadata_json),
          updated_at = $6::timestamptz,
          revision = revision + 1
        WHERE id = $7 AND workspace_id = $8 AND ($9::int IS NULL OR revision = $9)
        RETURNING *
      `,
      [
        String(content || ""),
        String(summary || ""),
        JSON.stringify(tags || []),
        project || null,
        metadata === undefined ? null : JSON.stringify(metadata || {}),
        nowIso(),
        normalizedId,
        normalizedWorkspaceId,
        expectedRevision,
      ]
    );
    if (result.rows.length === 0) {
      if (expectedRevision !== null) {
        const currentNote = await this.getNoteById(normalizedId, normalizedWorkspaceId);
        if (currentNote) {
          throw createRevisionConflictError({
            id: normalizedId,
            baseRevision: expectedRevision,
            currentNote,
          });
        }
      }
      return null;
    }
    return mapRow(result.rows[0]);
  }

  async updateAttachment({
    id,
    content,
    sourceType,
    sourceUrl,
    imagePath,
    fileName,
    fileMime,
    fileSize,
    rawContent,
    markdownContent,
    metadata,
    updatedAt,
    workspaceId = config.defaultWorkspaceId,
    baseRevision = null,
  }) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedId = String(id || "").trim();
    const expectedRevision = normalizeBaseRevision(baseRevision);
    const result = await this._query(
      `
        UPDATE notes
        SET
          content = $1,
          source_type = $2,
          source_url = $3,
          image_path = $4,
          file_name = $5,
          file_mime = $6,
          file_size = $7,
          raw_content = $8,
          markdown_content = $9,
          metadata_json = $10::jsonb,
          updated_at = $11::timestamptz,
          revision = revision + 1
        WHERE id = $12 AND workspace_id = $13 AND ($14::int IS NULL OR revision = $14)
        RETURNING *
      `,
      [
        String(content || ""),
        String(sourceType || "text"),
        sourceUrl || null,
        imagePath || null,
        fileName || null,
        fileMime || null,
        fileSize === undefined || fileSize === null ? null : Number(fileSize),
        rawContent === undefined ? null : rawContent,
        markdownContent === undefined ? null : markdownContent,
        JSON.stringify(metadata || {}),
        updatedAt || nowIso(),
        normalizedId,
        normalizedWorkspaceId,
        expectedRevision,
      ]
    );
    if (result.rows.length === 0) {
      if (expectedRevision !== null) {
        const currentNote = await this.getNoteById(normalizedId, normalizedWorkspaceId);
        if (currentNote) {
          throw createRevisionConflictError({
            id: normalizedId,
            baseRevision: expectedRevision,
            currentNote,
          });
        }
      }
      return null;
    }
    return mapRow(result.rows[0]);
  }

  async updateExtractedContent({
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
    const normalizedId = String(id || "").trim();
    const expectedRevision = normalizeBaseRevision(baseRevision);
    const hasRawContent = rawContent !== undefined;
    const hasMarkdownContent = markdownContent !== undefined;
    const result = await this._query(
      `
        UPDATE notes
        SET
          content = $1,
          summary = $2,
          tags_json = $3::jsonb,
          project = $4,
          metadata_json = $5::jsonb,
          raw_content = CASE WHEN $6::boolean THEN $7::text ELSE raw_content END,
          markdown_content = CASE WHEN $8::boolean THEN $9::text ELSE markdown_content END,
          updated_at = $10::timestamptz,
          revision = revision + 1
        WHERE id = $11 AND workspace_id = $12 AND ($13::int IS NULL OR revision = $13)
        RETURNING *
      `,
      [
        String(content || ""),
        String(summary || ""),
        JSON.stringify(tags || []),
        project || null,
        JSON.stringify(metadata || {}),
        hasRawContent,
        hasRawContent ? (rawContent === null ? null : String(rawContent)) : null,
        hasMarkdownContent,
        hasMarkdownContent ? (markdownContent === null ? null : String(markdownContent)) : null,
        updatedAt || nowIso(),
        normalizedId,
        normalizedWorkspaceId,
        expectedRevision,
      ]
    );
    if (result.rows.length === 0) {
      if (expectedRevision !== null) {
        const currentNote = await this.getNoteById(normalizedId, normalizedWorkspaceId);
        if (currentNote) {
          throw createRevisionConflictError({
            id: normalizedId,
            baseRevision: expectedRevision,
            currentNote,
          });
        }
      }
      return null;
    }
    return mapRow(result.rows[0]);
  }

  async listTags(workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const result = await this._query(
      `
        SELECT LOWER(tag) AS tag, COUNT(*)::int AS count
        FROM (
          SELECT jsonb_array_elements_text(tags_json) AS tag
          FROM notes
          WHERE workspace_id = $1
        ) tags
        WHERE tag IS NOT NULL AND tag <> ''
        GROUP BY LOWER(tag)
        ORDER BY COUNT(*) DESC, LOWER(tag) ASC
      `,
      [normalizedWorkspaceId]
    );
    return result.rows.map((row) => ({ tag: row.tag, count: Number(row.count || 0) }));
  }

  async listTagsForUser(workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const result = await this._query(
      `
        SELECT LOWER(tag) AS tag, COUNT(*)::int AS count
        FROM (
          SELECT jsonb_array_elements_text(tags_json) AS tag
          FROM notes
          WHERE workspace_id = $1 AND owner_user_id = $2
        ) tags
        WHERE tag IS NOT NULL AND tag <> ''
        GROUP BY LOWER(tag)
        ORDER BY COUNT(*) DESC, LOWER(tag) ASC
      `,
      [normalizedWorkspaceId, normalizedUserId]
    );
    return result.rows.map((row) => ({ tag: row.tag, count: Number(row.count || 0) }));
  }

  async renameTag(oldTag, newTag, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedOld = String(oldTag || "").trim().toLowerCase();
    const normalizedNew = String(newTag || "").trim();
    if (!normalizedOld || !normalizedNew) return 0;

    const like = `%${normalizedOld}%`;
    const candidates = await this._query(
      `SELECT id, tags_json FROM notes WHERE workspace_id = $1 AND tags_json::text ILIKE $2`,
      [normalizedWorkspaceId, like]
    );

    let updated = 0;
    for (const row of candidates.rows) {
      const tags = safeJsonParse(row.tags_json, []);
      const idx = tags.findIndex((tag) => String(tag || "").trim().toLowerCase() === normalizedOld);
      if (idx === -1) continue;
      tags[idx] = normalizedNew;
      await this._query(
        `UPDATE notes SET tags_json = $1::jsonb, updated_at = $2::timestamptz WHERE id = $3 AND workspace_id = $4`,
        [JSON.stringify(tags), nowIso(), row.id, normalizedWorkspaceId]
      );
      updated += 1;
    }
    return updated;
  }

  async removeTag(tag, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedTag = String(tag || "").trim().toLowerCase();
    if (!normalizedTag) return 0;

    const like = `%${normalizedTag}%`;
    const candidates = await this._query(
      `SELECT id, tags_json FROM notes WHERE workspace_id = $1 AND tags_json::text ILIKE $2`,
      [normalizedWorkspaceId, like]
    );

    let updated = 0;
    for (const row of candidates.rows) {
      const tags = safeJsonParse(row.tags_json, []);
      const filtered = tags.filter((value) => String(value || "").trim().toLowerCase() !== normalizedTag);
      if (filtered.length === tags.length) continue;
      await this._query(
        `UPDATE notes SET tags_json = $1::jsonb, updated_at = $2::timestamptz WHERE id = $3 AND workspace_id = $4`,
        [JSON.stringify(filtered), nowIso(), row.id, normalizedWorkspaceId]
      );
      updated += 1;
    }
    return updated;
  }

  async getStats(workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const [totalResult, byProjectResult, bySourceResult, activityResult] = await Promise.all([
      this._query(`SELECT COUNT(*)::int AS cnt FROM notes WHERE workspace_id = $1`, [normalizedWorkspaceId]),
      this._query(
        `
          SELECT COALESCE(project, '(none)') AS project, COUNT(*)::int AS cnt
          FROM notes
          WHERE workspace_id = $1
          GROUP BY COALESCE(project, '(none)')
          ORDER BY COUNT(*) DESC
        `,
        [normalizedWorkspaceId]
      ),
      this._query(
        `
          SELECT source_type, COUNT(*)::int AS cnt
          FROM notes
          WHERE workspace_id = $1
          GROUP BY source_type
          ORDER BY COUNT(*) DESC
        `,
        [normalizedWorkspaceId]
      ),
      this._query(
        `
          SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS cnt
          FROM notes
          WHERE workspace_id = $1 AND created_at >= $2::timestamptz
          GROUP BY TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          ORDER BY day ASC
        `,
        [normalizedWorkspaceId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()]
      ),
    ]);

    return {
      totalNotes: Number(totalResult.rows[0]?.cnt || 0),
      byProject: byProjectResult.rows.map((row) => ({ project: row.project || "(none)", count: Number(row.cnt || 0) })),
      bySourceType: bySourceResult.rows.map((row) => ({ sourceType: row.source_type, count: Number(row.cnt || 0) })),
      recentActivity: activityResult.rows.map((row) => ({ day: row.day, count: Number(row.cnt || 0) })),
    };
  }

  async getStatsForUser(workspaceId = config.defaultWorkspaceId, userId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedUserId = normalizeUserId(userId);
    const [totalResult, byProjectResult, bySourceResult, activityResult] = await Promise.all([
      this._query(`SELECT COUNT(*)::int AS cnt FROM notes WHERE workspace_id = $1 AND owner_user_id = $2`, [
        normalizedWorkspaceId,
        normalizedUserId,
      ]),
      this._query(
        `
          SELECT COALESCE(project, '(none)') AS project, COUNT(*)::int AS cnt
          FROM notes
          WHERE workspace_id = $1 AND owner_user_id = $2
          GROUP BY COALESCE(project, '(none)')
          ORDER BY COUNT(*) DESC
        `,
        [normalizedWorkspaceId, normalizedUserId]
      ),
      this._query(
        `
          SELECT source_type, COUNT(*)::int AS cnt
          FROM notes
          WHERE workspace_id = $1 AND owner_user_id = $2
          GROUP BY source_type
          ORDER BY COUNT(*) DESC
        `,
        [normalizedWorkspaceId, normalizedUserId]
      ),
      this._query(
        `
          SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS cnt
          FROM notes
          WHERE workspace_id = $1 AND owner_user_id = $2 AND created_at >= $3::timestamptz
          GROUP BY TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
          ORDER BY day ASC
        `,
        [normalizedWorkspaceId, normalizedUserId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()]
      ),
    ]);

    return {
      totalNotes: Number(totalResult.rows[0]?.cnt || 0),
      byProject: byProjectResult.rows.map((row) => ({ project: row.project || "(none)", count: Number(row.cnt || 0) })),
      bySourceType: bySourceResult.rows.map((row) => ({ sourceType: row.source_type, count: Number(row.cnt || 0) })),
      recentActivity: activityResult.rows.map((row) => ({ day: row.day, count: Number(row.cnt || 0) })),
    };
  }

  async batchDelete(ids, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedIds = Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
    if (!normalizedIds.length) return 0;
    const result = await this._query(`DELETE FROM notes WHERE workspace_id = $1 AND id = ANY($2::text[])`, [
      normalizedWorkspaceId,
      normalizedIds,
    ]);
    return Number(result.rowCount || 0);
  }

  async batchMove(ids, project, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedIds = Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
    if (!normalizedIds.length) return 0;
    const normalizedProject = String(project || "").trim();
    const result = await this._query(
      `
        UPDATE notes
        SET project = $1, updated_at = $2::timestamptz
        WHERE workspace_id = $3 AND id = ANY($4::text[])
      `,
      [normalizedProject || null, nowIso(), normalizedWorkspaceId, normalizedIds]
    );
    return Number(result.rowCount || 0);
  }

  async exportNotes({ project = null, format = "json", workspaceId = config.defaultWorkspaceId } = {}) {
    const notes = project
      ? await this.listByExactProject(project, workspaceId)
      : await this.listRecent(10000, 0, workspaceId);

    if (String(format || "").toLowerCase() === "markdown") {
      return notes
        .map((note) => {
          const title = note.summary || note.content?.slice(0, 80) || "(untitled)";
          const tags = (note.tags || []).map((tag) => `\`${tag}\``).join(" ");
          const body = note.markdownContent || note.rawContent || note.content || "";
          return `## ${title}\n\n${tags ? `Tags: ${tags}\n\n` : ""}${body}\n\n---\n`;
        })
        .join("\n");
    }

    return JSON.stringify(notes, null, 2);
  }

  async deleteByProject(project, workspaceId = config.defaultWorkspaceId) {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedProject = String(project || "").trim();
    if (!normalizedProject) return 0;
    const result = await this._query(
      `DELETE FROM notes WHERE workspace_id = $1 AND LOWER(COALESCE(project, '')) = LOWER($2)`,
      [normalizedWorkspaceId, normalizedProject]
    );
    return Number(result.rowCount || 0);
  }
}

export function createPostgresNoteRepo(pool = undefined) {
  return new PostgresNoteRepository(pool);
}
