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

  it("sanitizes create_note content/title before persisting", async () => {
    const calls = [];
    const execute = createChatToolExecutor({
      createMemory: async (payload) => {
        calls.push(payload);
        return {
          id: "n1",
          sourceType: payload.sourceType,
          content: payload.content,
          metadata: { title: payload.title || "" },
        };
      },
    });

    await execute("create_note", {
      title: "Brainstorm citeturn1search2",
      content: "https://example.com [N1]",
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, "Brainstorm");
    assert.equal(calls[0].content, "https://example.com");
  });

  it("rejects malformed JSON content for json file creation", async () => {
    const execute = createChatToolExecutor({
      createMemory: async () => ({ id: "n1", sourceType: "file", content: "" }),
    });

    await assert.rejects(
      () => execute("create_note", {
        title: "Config",
        fileName: "config.json",
        content: "{ invalid-json }",
      }, { userId: "u1", workspaceId: "w1" }),
      /content must be valid JSON/i,
    );
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

  it("auto-rebases stale baseRevision for update_note using latest revision", async () => {
    const calls = [];
    const execute = createChatToolExecutor({
      getMemoryRawContent: async () => ({ revision: 5 }),
      updateMemory: async (payload) => {
        calls.push(payload);
        return {
          id: "n1",
          metadata: { title: "Updated title" },
          content: String(payload.content || ""),
          summary: "",
          tags: [],
          project: "Text Files",
          status: "ready",
          revision: 6,
        };
      },
    });

    const result = await execute("update_note", {
      id: "n1",
      content: "Updated body",
      baseRevision: 1,
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].baseRevision, 5);
    assert.equal(result.noteId, "n1");
    assert.equal(result.patch.revision, 6);
  });

  it("retries update_note once on revision conflict with newer revision", async () => {
    const calls = [];
    const execute = createChatToolExecutor({
      getMemoryRawContent: async () => ({ revision: 5 }),
      updateMemory: async (payload) => {
        calls.push(payload);
        if (Number(payload.baseRevision) === 5) {
          const error = new Error("Revision conflict: item changed since your last read");
          error.code = "REVISION_CONFLICT";
          error.conflict = { currentRevision: 6 };
          throw error;
        }
        return {
          id: "n1",
          metadata: { title: "Updated title" },
          content: String(payload.content || ""),
          summary: "",
          tags: [],
          project: "Text Files",
          status: "ready",
          revision: 7,
        };
      },
    });

    const result = await execute("update_note", {
      id: "n1",
      content: "Updated body",
      baseRevision: 1,
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].baseRevision, 5);
    assert.equal(calls[1].baseRevision, 6);
    assert.equal(result.patch.revision, 7);
  });

  it("strips internal citation artifacts before saving note content", async () => {
    const calls = [];
    const execute = createChatToolExecutor({
      getMemoryRawContent: async () => ({ revision: 2 }),
      updateMemory: async (payload) => {
        calls.push(payload);
        return {
          id: "n1",
          metadata: { title: String(payload.title || "") },
          content: String(payload.content || ""),
          summary: String(payload.summary || ""),
          tags: [],
          project: "Text Files",
          status: "ready",
          revision: 3,
        };
      },
    });

    const result = await execute("update_note", {
      id: "n1",
      title: "Brainstorm citeturn1search2",
      content: "One idea citeturn2news1\nTwo idea [N1]",
      summary: "Summary (N2) citeturn2search3",
      baseRevision: 1,
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, "Brainstorm");
    assert.equal(calls[0].content.includes("cite"), false);
    assert.equal(calls[0].content.includes("[N1]"), false);
    assert.equal(calls[0].summary.includes("cite"), false);
    assert.equal(result.patch.revision, 3);
  });
});
