import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildApiHandlerDeps, createRuntimeServices } from "../../src/serverRuntime/runtimeBuilders.js";

describe("runtimeBuilders", () => {
  it("creates runtime services with callable handlers", () => {
    const staticDeps = {
      config: { authProvider: "neon" },
      authRepo: {
        recordAuthEvent: async () => {},
      },
      extractSessionTokenFromHeaders: () => "",
      verifyFirebaseIdToken: async () => ({}),
      verifyNeonAccessToken: async () => ({}),
      mapNeonClaimsToIdentity: () => ({
        subject: "sub_1",
        email: "user@example.com",
        name: "User",
        emailVerified: true,
      }),
      enrichmentQueue: { subscribe: () => () => {} },
      subscribeActivity: () => () => {},
      collaborationRepo: {
        getFolderMemberRole: async () => "viewer",
      },
      buildWebSearchTool: () => ({ type: "web_search" }),
      folderRepo: {
        getFolder: async () => null,
        getFolderByName: async () => null,
      },
      taskRepo: {
        listTasks: async () => [],
        createTask: async () => ({ id: "task-1", title: "Task", status: "open" }),
        updateTask: async () => ({ id: "task-1", title: "Task", status: "open" }),
        completeTask: async () => ({ id: "task-1", title: "Task", status: "closed" }),
        deleteTask: async () => ({ deleted: true, id: "task-1" }),
      },
      createMemory: async () => ({ id: "n1", sourceType: "text" }),
      batchCreateMemories: async () => ({ created: 0, failed: 0, items: [] }),
      createWorkspaceFolder: async () => ({}),
      listFolderCollaborators: async () => ({ items: [] }),
      setFolderCollaboratorRole: async () => ({}),
      removeFolderCollaborator: async () => ({ removed: 1 }),
      listWorkspaceActivity: async () => ({ items: [] }),
      searchMemories: async () => [],
      getMemoryRawContent: async () => ({}),
      updateMemory: async () => ({ id: "n1" }),
      updateMemoryAttachment: async () => ({ id: "n1" }),
      updateMemoryExtractedContent: async () => ({ id: "n1" }),
      addMemoryComment: async () => ({}),
      listMemoryVersions: async () => ({ items: [] }),
      restoreMemoryVersion: async () => ({ id: "n1" }),
      retryMemoryEnrichment: async () => ({ note: { id: "n1" }, queued: true }),
    };

    const services = createRuntimeServices(staticDeps, {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    assert.equal(typeof services.checkAuthRate, "function");
    assert.equal(typeof services.recordAuthEvent, "function");
    assert.equal(typeof services.buildActorFromRequest, "function");
    assert.equal(typeof services.handleSSE, "function");
    assert.equal(typeof services.executeChatToolCall, "function");
    assert.equal(services.isWorkspaceManager({ role: "owner" }), true);
    assert.equal(services.isWorkspaceManager({ role: "admin" }), true);
    assert.equal(services.isWorkspaceManager({ role: "member" }), false);
  });

  it("builds api handler deps using static and runtime services", () => {
    const staticDeps = new Proxy(
      {
        config: { authProvider: "neon", authRequireEmailVerification: false },
      },
      {
        get(target, prop) {
          if (prop in target) return target[prop];
          return `static:${String(prop)}`;
        },
      },
    );
    const runtimeServices = new Proxy(
      {},
      {
        get(_target, prop) {
          return `runtime:${String(prop)}`;
        },
      },
    );

    const deps = buildApiHandlerDeps(staticDeps, runtimeServices, {
      startedAt: 42,
      logger: { info: () => {} },
    });

    assert.equal(deps.startedAt, 42);
    assert.equal(typeof deps.logger.info, "function");
    assert.equal(deps.providerName, "static:providerName");
    assert.equal(deps.resolveNeonActorFromToken, "runtime:resolveNeonActorFromToken");
    assert.equal(deps.executeChatToolCall, "runtime:executeChatToolCall");
    assert.equal(deps.batchMoveMemories, "static:batchMoveMemories");
  });
});
