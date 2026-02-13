import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPostgresAuthRepo } from "../../src/postgres/authRepo.js";

describe("createPostgresAuthRepo", () => {
  it("returns an auth repository with async contract methods", () => {
    const fakePool = { query: async () => ({ rows: [] }) };
    const repo = createPostgresAuthRepo(fakePool);
    assert.equal(typeof repo.getSession, "function");
    assert.equal(typeof repo.loginAndIssueSession, "function");
    assert.equal(typeof repo.signUpAndIssueSession, "function");
    assert.equal(typeof repo.listWorkspacesForUser, "function");
    assert.equal(typeof repo.createWorkspaceInvite, "function");
    assert.equal(repo.getSession.constructor.name, "AsyncFunction");
  });
});
