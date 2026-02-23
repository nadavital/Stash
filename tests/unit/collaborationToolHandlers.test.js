import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCollaborationToolHandlers } from "../../src/chat/toolHandlers/collaborationToolHandlers.js";

describe("createCollaborationToolHandlers", () => {
  it("filters workspace members by query", async () => {
    const handlers = createCollaborationToolHandlers({
      authRepo: {
        listWorkspaceMembers: async () => [
          { userId: "u1", email: "alice@example.com", name: "Alice", role: "member" },
          { userId: "u2", email: "bob@example.com", name: "Bob", role: "member" },
        ],
      },
      createWorkspaceFolder: async () => ({}),
      listFolderCollaborators: async () => ({}),
      setFolderCollaboratorRole: async () => ({}),
      removeFolderCollaborator: async () => ({}),
      listWorkspaceActivity: async () => ({ items: [] }),
      resolveWorkspaceMemberForAgent: async () => ({}),
      resolveFolderNameForAgent: async () => "",
    });

    const result = await handlers.list_workspace_members(
      { query: "alice", limit: 10 },
      { workspaceId: "w1" },
    );

    assert.equal(result.members.length, 1);
    assert.equal(result.members[0].email, "alice@example.com");
  });

  it("normalizes collaborator role to viewer when unsupported", async () => {
    const handlers = createCollaborationToolHandlers({
      authRepo: { listWorkspaceMembers: async () => [] },
      createWorkspaceFolder: async () => ({}),
      listFolderCollaborators: async () => ({}),
      setFolderCollaboratorRole: async ({ folderId, userId, role }) => ({
        folderId,
        userId,
        userEmail: "user@example.com",
        userName: "User",
        role,
      }),
      removeFolderCollaborator: async () => ({}),
      listWorkspaceActivity: async () => ({ items: [] }),
      resolveWorkspaceMemberForAgent: async () => ({ userId: "u2" }),
      resolveFolderNameForAgent: async () => "Product",
    });

    const result = await handlers.set_folder_collaborator(
      { folderId: "f1", email: "user@example.com", role: "owner" },
      { workspaceId: "w1" },
    );

    assert.equal(result.folderName, "Product");
    assert.equal(result.role, "viewer");
  });

  it("returns normalized remove collaborator payload", async () => {
    const handlers = createCollaborationToolHandlers({
      authRepo: { listWorkspaceMembers: async () => [] },
      createWorkspaceFolder: async () => ({}),
      listFolderCollaborators: async () => ({}),
      setFolderCollaboratorRole: async () => ({}),
      removeFolderCollaborator: async () => ({ removed: 1 }),
      listWorkspaceActivity: async () => ({ items: [] }),
      resolveWorkspaceMemberForAgent: async () => ({ userId: "u2" }),
      resolveFolderNameForAgent: async () => "Product",
    });

    const result = await handlers.remove_folder_collaborator(
      { folderId: "f1", email: "user@example.com" },
      { workspaceId: "w1" },
    );

    assert.equal(result.folderId, "f1");
    assert.equal(result.folderName, "Product");
    assert.equal(result.userId, "u2");
    assert.equal(result.removed, 1);
  });
});
