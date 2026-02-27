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

  it("fetches and parses RSS feeds via fetch_rss", async () => {
    const execute = createChatToolExecutor({
      fetchExternalContent: async () => ({
        ok: true,
        status: 200,
        text: async () => `
          <rss version="2.0">
            <channel>
              <title>Example Feed</title>
              <item>
                <title>Story one</title>
                <link>https://example.com/story-1</link>
                <pubDate>Tue, 24 Feb 2026 18:00:00 GMT</pubDate>
                <description>First story summary.</description>
              </item>
              <item>
                <title>Story two</title>
                <link>https://example.com/story-2</link>
                <pubDate>Tue, 24 Feb 2026 17:30:00 GMT</pubDate>
                <description>Second story summary.</description>
              </item>
            </channel>
          </rss>
        `,
      }),
    });

    const result = await execute("fetch_rss", {
      url: "https://example.com/rss.xml",
      limit: 5,
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(result.feedUrl, "https://example.com/rss.xml");
    assert.equal(result.count, 2);
    assert.equal(result.items[0].url, "https://example.com/story-1");
    assert.equal(result.items[0].title, "Story one");
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

  it("creates multiple notes via create_notes_bulk", async () => {
    const execute = createChatToolExecutor({
      batchCreateMemories: async ({ items }) => ({
        created: items.length,
        failed: 0,
        items: items.map((item, index) => ({
          index,
          note: {
            id: `n-${index + 1}`,
            sourceType: item.sourceType || "text",
            content: item.content || "",
            metadata: { title: item.title || "" },
          },
        })),
      }),
    });

    const result = await execute("create_notes_bulk", {
      project: "Product",
      items: [
        { content: "First task" },
        { content: "https://example.com/roadmap", sourceType: "link" },
      ],
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(result.created, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].status, "created");
    assert.equal(result.items[1].sourceType, "link");
  });

  it("returns partial failures from create_notes_bulk", async () => {
    const execute = createChatToolExecutor({
      batchCreateMemories: async () => ({
        created: 1,
        failed: 1,
        items: [
          {
            index: 0,
            note: { id: "n-1", sourceType: "text", content: "ok", metadata: { title: "ok" } },
          },
          {
            index: 1,
            error: "Missing content",
          },
        ],
      }),
    });

    const result = await execute("create_notes_bulk", {
      items: [
        { content: "ok" },
        { content: "bad" },
      ],
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(result.created, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.items[1].status, "failed");
    assert.match(result.items[1].error, /missing content/i);
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

  it("creates pending-approval automations and pauses them via task tools", async () => {
    const execute = createChatToolExecutor({
      taskRepo: {
        createTask: async ({ title, prompt, workspaceId }) => ({
          id: "task-1",
          title,
          prompt,
          state: "pending_approval",
          approvalStatus: "pending_approval",
          status: "paused",
          enabled: false,
          workspaceId,
          createdAt: "2026-02-23T00:00:00.000Z",
        }),
        pauseTask: async (id, workspaceId) => ({
          id,
          title: "Finish docs",
          prompt: "Finish docs",
          state: "paused",
          approvalStatus: "approved",
          status: "paused",
          enabled: false,
          workspaceId,
          createdAt: "2026-02-23T00:00:00.000Z",
        }),
      },
    });

    const created = await execute("create_task", {
      title: "Finish docs",
      prompt: "Finish docs",
    }, { userId: "u1", workspaceId: "w1" });
    assert.equal(created.task.id, "task-1");
    assert.equal(created.task.state, "pending_approval");
    assert.equal(created.approvalRequired, true);

    const completed = await execute("complete_task", {
      id: "task-1",
    }, { userId: "u1", workspaceId: "w1" });
    assert.equal(completed.task.id, "task-1");
    assert.equal(completed.task.status, "paused");
  });

  it("returns a normalized task proposal without creating data", async () => {
    const execute = createChatToolExecutor({
      taskRepo: {
        createTask: async () => {
          throw new Error("should not create from propose_task");
        },
      },
    });

    const result = await execute("propose_task", {
      title: "Daily headlines",
      prompt: "Fetch latest stories and save a note.",
      scheduleType: "interval",
      intervalMinutes: 1440,
      timezone: "America/Los_Angeles",
      nextRunAt: "2026-02-24T17:00:00.000Z",
    }, { userId: "u1", workspaceId: "w1" });

    assert.equal(result.proposal.title, "Daily headlines");
    assert.equal(result.proposal.scheduleType, "interval");
    assert.equal(result.proposal.intervalMinutes, 1440);
    assert.deepEqual(result.actions, ["Create it", "Cancel"]);
  });

  it("auto-approves confirmed automations for workspace owners", async () => {
    const execute = createChatToolExecutor({
      taskRepo: {
        createTask: async ({ title, prompt, workspaceId, approvalStatus, status, approvedByUserId }) => ({
          id: "task-2",
          title,
          prompt,
          state: status === "active" ? "active" : "paused",
          approvalStatus,
          status,
          enabled: status === "active",
          approvedByUserId,
          workspaceId,
          createdAt: "2026-02-23T00:00:00.000Z",
        }),
      },
    });

    const result = await execute("create_task", {
      title: "Daily digest",
      scheduleType: "interval",
      intervalMinutes: 1440,
      confirmed: true,
    }, { userId: "owner-1", workspaceId: "w1", role: "owner" });

    assert.equal(result.task.id, "task-2");
    assert.equal(result.task.approvalStatus, "approved");
    assert.equal(result.task.status, "active");
    assert.equal(result.task.enabled, true);
    assert.equal(result.approvalRequired, false);
  });

  it("keeps confirmed automations pending for non-managers", async () => {
    const execute = createChatToolExecutor({
      taskRepo: {
        createTask: async ({ approvalStatus, status }) => ({
          id: "task-3",
          title: "Daily digest",
          prompt: "Daily digest",
          state: "pending_approval",
          approvalStatus,
          status,
          enabled: false,
          createdAt: "2026-02-23T00:00:00.000Z",
        }),
      },
    });

    const result = await execute("create_task", {
      title: "Daily digest",
      scheduleType: "interval",
      intervalMinutes: 1440,
      confirmed: true,
    }, { userId: "member-1", workspaceId: "w1", role: "member" });

    assert.equal(result.task.id, "task-3");
    assert.equal(result.task.approvalStatus, "pending_approval");
    assert.equal(result.task.status, "paused");
    assert.equal(result.approvalRequired, true);
  });

  it("normalizes list_tasks status all and respects limit", async () => {
    const execute = createChatToolExecutor({
      taskRepo: {
        listTasks: async (_status, _workspaceId) => [
          { id: "task-1", title: "One", state: "pending_approval", status: "paused", createdAt: "2026-02-23T00:00:00.000Z" },
          { id: "task-2", title: "Two", state: "active", status: "active", createdAt: "2026-02-23T00:00:00.000Z" },
        ],
      },
    });

    const result = await execute("list_tasks", {
      status: "all",
      limit: 1,
    }, { userId: "u1", workspaceId: "w1" });
    assert.equal(result.count, 1);
    assert.equal(result.tasks.length, 1);
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
