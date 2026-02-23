import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApiHandler } from "../../src/routes/apiRouter.js";

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    ended: false,
    body: "",
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.ended = true;
      this.body = body;
    },
  };
}

function createBaseDeps(overrides = {}) {
  return {
    config: { authProvider: "neon", authRequireEmailVerification: false },
    getRequestIp: () => "127.0.0.1",
    getRequestOrigin: () => "http://localhost:8787",
    buildActorFromRequest: async () => ({ userId: "u1", workspaceId: "w1", emailVerified: true }),
    sendUnauthorized: () => {},
    handleSSE: () => {},
    sendJson: () => {},
    ...overrides,
  };
}

function createBaseRouteHandlers(overrides = {}) {
  return {
    handleApiHealth: async () => false,
    handlePublicAuthRoutes: async () => false,
    handleAuthWorkspaceRoutes: async () => false,
    handleNoteRoutes: async () => false,
    handleMetaRoutes: async () => false,
    handleChatRoutes: async () => false,
    handleFolderRoutes: async () => false,
    handleTaskRoutes: async () => false,
    handleNoteMutationRoutes: async () => false,
    handleBatchNoteRoutes: async () => false,
    ...overrides,
  };
}

describe("createApiHandler control flow", () => {
  it("handles CORS preflight and exits early", async () => {
    const routeCalls = [];
    const handler = createApiHandler(
      createBaseDeps(),
      createBaseRouteHandlers({
        handleApiHealth: async () => {
          routeCalls.push("health");
          return false;
        },
      }),
    );
    const req = { method: "OPTIONS" };
    const res = createRes();
    const url = new URL("http://localhost/api/chat");

    await handler(req, res, url);

    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
    assert.deepEqual(routeCalls, []);
  });

  it("short-circuits when public auth route handles request", async () => {
    let actorLookups = 0;
    const handler = createApiHandler(
      createBaseDeps({
        buildActorFromRequest: async () => {
          actorLookups += 1;
          return null;
        },
      }),
      createBaseRouteHandlers({
        handlePublicAuthRoutes: async () => true,
      }),
    );

    await handler({ method: "POST" }, createRes(), new URL("http://localhost/api/auth/login"));
    assert.equal(actorLookups, 0);
  });

  it("sends unauthorized when actor resolution fails", async () => {
    let unauthorizedCount = 0;
    const handler = createApiHandler(
      createBaseDeps({
        buildActorFromRequest: async () => null,
        sendUnauthorized: (_res, provider) => {
          unauthorizedCount += 1;
          assert.equal(provider, "neon");
        },
      }),
      createBaseRouteHandlers(),
    );

    await handler({ method: "GET" }, createRes(), new URL("http://localhost/api/notes"));
    assert.equal(unauthorizedCount, 1);
  });

  it("dispatches SSE route before normal route chain", async () => {
    const calls = [];
    const handler = createApiHandler(
      createBaseDeps({
        handleSSE: () => calls.push("sse"),
      }),
      createBaseRouteHandlers({
        handleNoteRoutes: async () => {
          calls.push("note");
          return false;
        },
      }),
    );

    await handler({ method: "GET" }, createRes(), new URL("http://localhost/api/events"));
    assert.deepEqual(calls, ["sse"]);
  });

  it("marks requiresEmailVerification in auth workspace context when needed", async () => {
    let seenRequiresEmailVerification = null;
    const handler = createApiHandler(
      createBaseDeps({
        config: { authProvider: "neon", authRequireEmailVerification: true },
        buildActorFromRequest: async () => ({
          userId: "u1",
          workspaceId: "w1",
          emailVerified: false,
        }),
      }),
      createBaseRouteHandlers({
        handleAuthWorkspaceRoutes: async (_req, _res, _url, context) => {
          seenRequiresEmailVerification = context.requiresEmailVerification;
          return true;
        },
      }),
    );

    await handler({ method: "GET" }, createRes(), new URL("http://localhost/api/notes"));
    assert.equal(seenRequiresEmailVerification, true);
  });

  it("stops route pipeline after first handler returns true", async () => {
    const calls = [];
    const handler = createApiHandler(
      createBaseDeps(),
      createBaseRouteHandlers({
        handleNoteRoutes: async () => {
          calls.push("note");
          return true;
        },
        handleMetaRoutes: async () => {
          calls.push("meta");
          return false;
        },
      }),
    );

    await handler({ method: "GET" }, createRes(), new URL("http://localhost/api/notes"));
    assert.deepEqual(calls, ["note"]);
  });

  it("returns 404 when no route handles request", async () => {
    let status = 0;
    let payload = null;
    const handler = createApiHandler(
      createBaseDeps({
        sendJson: (_res, statusCode, body) => {
          status = statusCode;
          payload = body;
        },
      }),
      createBaseRouteHandlers(),
    );

    await handler({ method: "GET" }, createRes(), new URL("http://localhost/api/unknown"));
    assert.equal(status, 404);
    assert.deepEqual(payload, { error: "API route not found" });
  });
});
