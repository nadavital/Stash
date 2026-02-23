import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChatToolExecutor } from "../../src/chat/chatToolExecutor.js";

describe("createChatToolExecutor", () => {
  it("normalizes ask_user_question output", async () => {
    const execute = createChatToolExecutor({});
    const result = await execute("ask_user_question", {
      question: "  Which neighborhood should I prioritize?  ",
      options: ["Mission", " ", "North Beach", "Mission", "Sunset", "Something else (type it)"],
      context: " Need your preference to tailor the plan. ",
      answerMode: "choices_plus_freeform",
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(result.question, "Which neighborhood should I prioritize?");
    assert.deepEqual(result.options, ["Mission", "North Beach", "Mission", "Sunset"]);
    assert.equal(result.answerMode, "choices_plus_freeform");
    assert.equal(result.context, "Need your preference to tailor the plan");
  });

  it("maps URL-only content to link source type in create_note", async () => {
    const execute = createChatToolExecutor({
      createMemory: async (payload) => ({
        id: "n1",
        sourceType: payload.sourceType,
        content: payload.content,
      }),
    });

    const result = await execute("create_note", {
      content: "https://example.com",
      title: "Example",
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(result.noteId, "n1");
    assert.equal(result.sourceType, "link");
  });

  it("normalizes collaborator role for set_folder_collaborator", async () => {
    const execute = createChatToolExecutor({
      authRepo: {
        listWorkspaceMembers: async () => [
          { userId: "u2", email: "user@example.com", name: "User" },
        ],
      },
      folderRepo: {
        getFolder: async () => ({ id: "f1", name: "Product" }),
        getFolderByName: async () => null,
      },
      setFolderCollaboratorRole: async ({ folderId, userId, role }) => ({
        folderId,
        userId,
        userEmail: "user@example.com",
        userName: "User",
        role,
      }),
    });

    const result = await execute("set_folder_collaborator", {
      folderId: "f1",
      email: "USER@example.com",
      role: "owner",
    }, { userId: "admin", workspaceId: "w1" });

    assert.equal(result.folderName, "Product");
    assert.equal(result.role, "viewer");
    assert.equal(result.userId, "u2");
  });

  it("throws on unknown tool name", async () => {
    const execute = createChatToolExecutor({});
    await assert.rejects(
      () => execute("unknown_tool", {}, { userId: "u1", workspaceId: "w1" }),
      /Unknown tool: unknown_tool/,
    );
  });
});
