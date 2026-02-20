import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPostgresNoteRepo } from "../../src/postgres/noteRepo.js";

describe("createPostgresNoteRepo", () => {
  it("returns a note repository with async contract methods", () => {
    const fakePool = { query: async () => ({ rows: [] }) };
    const repo = createPostgresNoteRepo(fakePool);
    assert.equal(typeof repo.createNote, "function");
    assert.equal(typeof repo.updateStatus, "function");
    assert.equal(typeof repo.getNoteById, "function");
    assert.equal(typeof repo.listByProject, "function");
    assert.equal(typeof repo.listTags, "function");
    assert.equal(typeof repo.updateAttachment, "function");
    assert.equal(typeof repo.updateExtractedContent, "function");
    assert.equal(repo.createNote.constructor.name, "AsyncFunction");
  });

  it("updateEnrichment writes extracted raw/markdown content when provided", async () => {
    const fakePool = { query: async () => ({ rows: [] }) };
    const repo = createPostgresNoteRepo(fakePool);
    let captured = null;

    repo._query = async (sql, params = []) => {
      captured = { sql, params };
      return { rows: [] };
    };
    repo.getNoteById = async () => ({ id: "note-1" });

    await repo.updateEnrichment({
      id: "note-1",
      summary: "s",
      tags: ["tag"],
      project: "proj",
      embedding: null,
      metadata: { ok: true },
      rawContent: "raw extracted text",
      markdownContent: "## markdown extracted text",
      workspaceId: "ws_123",
    });

    assert.ok(captured, "expected SQL query to be captured");
    assert.match(captured.sql, /raw_content\s*=\s*CASE WHEN/i);
    assert.match(captured.sql, /markdown_content\s*=\s*CASE WHEN/i);
    assert.equal(captured.params[5], true);
    assert.equal(captured.params[6], "raw extracted text");
    assert.equal(captured.params[7], true);
    assert.equal(captured.params[8], "## markdown extracted text");
  });

  it("updateAttachment writes attachment fields", async () => {
    const fakePool = { query: async () => ({ rows: [] }) };
    const repo = createPostgresNoteRepo(fakePool);
    let captured = null;

    repo._query = async (sql, params = []) => {
      captured = { sql, params };
      return { rows: [] };
    };
    repo.getNoteById = async () => ({ id: "note-attachment" });

    await repo.updateAttachment({
      id: "note-attachment",
      content: "Updated with attachment",
      sourceType: "file",
      sourceUrl: null,
      imagePath: null,
      fileName: "report.txt",
      fileMime: "text/plain",
      fileSize: 42,
      rawContent: "hello",
      markdownContent: "hello",
      metadata: { attachmentUpdatedBy: "user-1" },
      workspaceId: "ws_123",
    });

    assert.ok(captured, "expected SQL query to be captured");
    assert.match(captured.sql, /source_type\s*=\s*\$2/i);
    assert.match(captured.sql, /file_name\s*=\s*\$5/i);
    assert.match(captured.sql, /file_mime\s*=\s*\$6/i);
    assert.match(captured.sql, /metadata_json\s*=\s*\$10::jsonb/i);
    assert.equal(captured.params[4], "report.txt");
    assert.equal(captured.params[5], "text/plain");
    assert.equal(captured.params[6], 42);
  });

  it("updateNote applies optimistic revision guard when baseRevision is provided", async () => {
    const fakePool = { query: async () => ({ rows: [] }) };
    const repo = createPostgresNoteRepo(fakePool);
    let captured = null;

    repo._query = async (sql, params = []) => {
      captured = { sql, params };
      return {
        rows: [{ id: "note-1", workspace_id: "ws_123", content: "next", summary: "", tags_json: "[]", project: "", metadata_json: "{}", revision: 2 }],
      };
    };

    const updated = await repo.updateNote({
      id: "note-1",
      content: "next",
      summary: "",
      tags: [],
      project: "",
      metadata: {},
      workspaceId: "ws_123",
      baseRevision: 1,
    });

    assert.ok(captured, "expected SQL query to be captured");
    assert.match(captured.sql, /revision\s*=\s*revision\s*\+\s*1/i);
    assert.match(captured.sql, /\(\$9::int IS NULL OR revision = \$9\)/i);
    assert.equal(captured.params[8], 1);
    assert.equal(updated.revision, 2);
  });

  it("uses case-insensitive project matching for scoped queries", async () => {
    const fakePool = { query: async () => ({ rows: [] }) };
    const repo = createPostgresNoteRepo(fakePool);
    const capturedSql = [];

    repo._query = async (sql, params = []) => {
      capturedSql.push({ sql, params });
      if (/COUNT\(\*\)::int AS cnt/i.test(sql)) {
        return { rows: [{ cnt: 0 }] };
      }
      return { rows: [] };
    };

    await repo.listByProject("My Folder", 20, 0, "ws_123");
    await repo.searchNotes("hello", { project: "My Folder", workspaceId: "ws_123", limit: 20 });
    await repo.deleteByProject("My Folder", "ws_123");

    assert.ok(capturedSql.some((entry) => /LOWER\(COALESCE\(project, ''\)\)\s*=\s*LOWER\(\$2\)/i.test(entry.sql)));
  });
});
