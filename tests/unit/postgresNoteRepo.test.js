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
    assert.equal(repo.createNote.constructor.name, "AsyncFunction");
  });
});
