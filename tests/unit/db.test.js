import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// We can't easily import NoteRepository from db.js because it auto-creates
// a singleton. Instead, import the class indirectly and test with temp DB.
// The simplest approach: dynamically import after setting up env.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-test-"));
const testDbPath = path.join(tmpDir, "test.db");

// Import NoteRepository class — db.js exports a singleton, but we need
// to construct our own with a temp path. We'll use a workaround.
let NoteRepository;

before(async () => {
  // Dynamic import to get the module
  const mod = await import("../../src/db.js");
  // The class isn't exported, so we construct via the module's noteRepo
  // constructor pattern. Let's use a different approach — read the class
  // from the module by accessing its constructor.
  NoteRepository = mod.noteRepo.constructor;
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

describe("NoteRepository", () => {
  let repo;

  before(() => {
    repo = new NoteRepository(testDbPath);
  });

  it("creates and retrieves a note", () => {
    const note = repo.createNote({
      id: "test-1",
      ownerUserId: "user-owner-1",
      createdByUserId: "user-owner-1",
      content: "Hello world",
      sourceType: "text",
      sourceUrl: null,
      imagePath: null,
      fileName: null,
      fileMime: null,
      fileSize: null,
      rawContent: null,
      markdownContent: null,
      summary: "A test note",
      tags: ["test", "hello"],
      project: "TestProject",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      embedding: null,
      metadata: {},
      status: "ready",
    });

    assert.equal(note.id, "test-1");
    assert.equal(note.content, "Hello world");
    assert.deepEqual(note.tags, ["test", "hello"]);
    assert.equal(note.ownerUserId, "user-owner-1");

    const fetched = repo.getNoteById("test-1");
    assert.equal(fetched.id, "test-1");
    assert.equal(fetched.project, "TestProject");
    assert.equal(fetched.createdByUserId, "user-owner-1");
  });

  it("lists recent notes", () => {
    const notes = repo.listRecent(10);
    assert.ok(notes.length >= 1);
  });

  it("updates a note", () => {
    const updated = repo.updateNote({
      id: "test-1",
      content: "Updated content",
      summary: "Updated summary",
      tags: ["updated"],
      project: "NewProject",
    });
    assert.equal(updated.content, "Updated content");
    assert.deepEqual(updated.tags, ["updated"]);
    assert.equal(updated.project, "NewProject");
  });

  it("lists projects", () => {
    const projects = repo.listProjects();
    assert.ok(projects.includes("NewProject"));
  });

  it("lists tags with counts", () => {
    const tags = repo.listTags();
    assert.ok(tags.some((t) => t.tag === "updated" && t.count >= 1));
  });

  it("renames a tag", () => {
    const count = repo.renameTag("updated", "renamed");
    assert.ok(count >= 1);
    const note = repo.getNoteById("test-1");
    assert.ok(note.tags.includes("renamed"));
  });

  it("removes a tag", () => {
    const count = repo.removeTag("renamed");
    assert.ok(count >= 1);
    const note = repo.getNoteById("test-1");
    assert.ok(!note.tags.includes("renamed"));
  });

  it("gets stats", () => {
    const stats = repo.getStats();
    assert.ok(stats.totalNotes >= 1);
    assert.ok(Array.isArray(stats.byProject));
    assert.ok(Array.isArray(stats.bySourceType));
    assert.ok(Array.isArray(stats.recentActivity));
  });

  it("batch creates and deletes", () => {
    repo.createNote({
      id: "batch-1",
      content: "Batch 1",
      sourceType: "text",
      sourceUrl: null,
      imagePath: null,
      fileName: null,
      fileMime: null,
      fileSize: null,
      rawContent: null,
      markdownContent: null,
      summary: "B1",
      tags: [],
      project: "Batch",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      embedding: null,
      metadata: {},
      status: "ready",
    });
    repo.createNote({
      id: "batch-2",
      content: "Batch 2",
      sourceType: "text",
      sourceUrl: null,
      imagePath: null,
      fileName: null,
      fileMime: null,
      fileSize: null,
      rawContent: null,
      markdownContent: null,
      summary: "B2",
      tags: [],
      project: "Batch",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      embedding: null,
      metadata: {},
      status: "ready",
    });

    const deleted = repo.batchDelete(["batch-1", "batch-2"]);
    assert.equal(deleted, 2);
    assert.equal(repo.getNoteById("batch-1"), null);
  });

  it("batch moves notes", () => {
    repo.createNote({
      id: "move-1",
      content: "Move me",
      sourceType: "text",
      sourceUrl: null,
      imagePath: null,
      fileName: null,
      fileMime: null,
      fileSize: null,
      rawContent: null,
      markdownContent: null,
      summary: "M1",
      tags: [],
      project: "OldProject",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      embedding: null,
      metadata: {},
      status: "ready",
    });

    const moved = repo.batchMove(["move-1"], "MovedProject");
    assert.equal(moved, 1);
    const note = repo.getNoteById("move-1");
    assert.equal(note.project, "MovedProject");
  });

  it("exports notes as JSON", () => {
    const data = repo.exportNotes({ format: "json" });
    const parsed = JSON.parse(data);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length >= 1);
  });

  it("exports notes as markdown", () => {
    const data = repo.exportNotes({ format: "markdown" });
    assert.ok(data.includes("##"));
  });

  it("deletes a note", () => {
    const count = repo.deleteNote("test-1");
    assert.equal(count, 1);
    assert.equal(repo.getNoteById("test-1"), null);
  });

  it("counts notes", () => {
    const count = repo.countNotes();
    assert.ok(count >= 0);
  });

  it("searches notes", () => {
    repo.createNote({
      id: "search-1",
      content: "quantum computing research paper",
      sourceType: "text",
      sourceUrl: null,
      imagePath: null,
      fileName: null,
      fileMime: null,
      fileSize: null,
      rawContent: null,
      markdownContent: null,
      summary: "Quantum paper",
      tags: ["quantum"],
      project: "Research",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      embedding: null,
      metadata: {},
      status: "ready",
    });

    const results = repo.searchNotes("quantum");
    assert.ok(results.length >= 1);
    assert.ok(results.some((n) => n.id === "search-1"));
  });
});
