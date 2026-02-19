import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPostgresCollaborationRepo } from "../../src/postgres/collaborationRepo.js";

describe("createPostgresCollaborationRepo", () => {
  it("returns a collaboration repository with async contract methods", () => {
    const fakePool = { query: async () => ({ rows: [] }) };
    const repo = createPostgresCollaborationRepo(fakePool);
    assert.equal(typeof repo.listFolderMembers, "function");
    assert.equal(typeof repo.upsertFolderMember, "function");
    assert.equal(typeof repo.getFolderMemberRole, "function");
    assert.equal(typeof repo.createActivityEvent, "function");
    assert.equal(typeof repo.listActivityEvents, "function");
    assert.equal(repo.listFolderMembers.constructor.name, "AsyncFunction");
  });

  it("returns empty role when user is not a collaborator", async () => {
    const fakePool = { query: async () => ({ rows: [] }) };
    const repo = createPostgresCollaborationRepo(fakePool);
    repo._query = async () => ({ rows: [] });

    const role = await repo.getFolderMemberRole({
      workspaceId: "ws_123",
      folderId: "folder_123",
      userId: "user_123",
    });

    assert.equal(role, "");
  });
});
