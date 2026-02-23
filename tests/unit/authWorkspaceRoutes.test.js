import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleAuthWorkspaceRoutes } from "../../src/routes/authWorkspaceRoutes.js";

function createBaseContext(overrides = {}) {
  return {
    actor: {
      userId: "u1",
      userEmail: "user@example.com",
      userName: "User",
      workspaceId: "w1",
      workspaceName: "Workspace",
      workspaceSlug: "workspace",
      role: "member",
      emailVerified: true,
      provider: "local",
      token: "tok",
      authProviderSubject: "sub1",
    },
    requestIp: "127.0.0.1",
    requiresEmailVerification: false,
    sendJson: () => {},
    readJsonBody: async () => ({}),
    resolveErrorStatus: () => 400,
    config: { authProvider: "local", authRequireEmailVerification: false },
    isWorkspaceManager: () => false,
    authRepo: {
      listWorkspacesForUser: async () => [],
      listWorkspaceMembers: async () => [],
      listIncomingWorkspaceInvites: async () => [],
      listWorkspaceInvites: async () => [],
      createWorkspaceInvite: async () => ({}),
      acceptWorkspaceInvite: async () => ({}),
      revokeWorkspaceInvite: async () => ({}),
      listAuthEventsForWorkspace: async () => [],
      revokeAllSessionsForUser: async () => ({ revoked: 0 }),
      authenticateUser: async () => {},
      deleteUserAccount: async () => {},
      resolveFirebaseActorFromClaims: async () => ({}),
      changeLocalPassword: async () => {},
    },
    getEnrichmentQueueStats: async () => ({ pending: 0 }),
    firebaseSendEmailVerification: async () => {},
    firebaseChangePassword: async () => ({}),
    verifyFirebaseIdToken: async () => ({}),
    buildFirebaseSessionPayload: () => ({}),
    revokeFirebaseUserSessions: async () => {},
    deleteFirebaseUser: async () => {},
    registerAuthFailure: () => ({ count: 1, requiresCaptcha: false }),
    recordAuthEvent: () => {},
    ...overrides,
  };
}

describe("handleAuthWorkspaceRoutes", () => {
  it("returns false for unrelated route", async () => {
    const handled = await handleAuthWorkspaceRoutes(
      { method: "GET" },
      {},
      new URL("http://localhost/api/notes"),
      createBaseContext(),
    );
    assert.equal(handled, false);
  });

  it("returns actor session payload", async () => {
    const handled = await handleAuthWorkspaceRoutes(
      { method: "GET" },
      {},
      new URL("http://localhost/api/auth/session"),
      createBaseContext({
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 200);
          assert.equal(payload.actor.userId, "u1");
          assert.equal(payload.actor.workspaceId, "w1");
          assert.equal(payload.requiresEmailVerification, false);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("blocks non-allowed routes while email verification is required", async () => {
    const handled = await handleAuthWorkspaceRoutes(
      { method: "GET" },
      {},
      new URL("http://localhost/api/workspaces"),
      createBaseContext({
        requiresEmailVerification: true,
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 403);
          assert.equal(payload.requiresEmailVerification, true);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("allows signout-all while email verification is required", async () => {
    const handled = await handleAuthWorkspaceRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/signout-all"),
      createBaseContext({
        requiresEmailVerification: true,
        authRepo: {
          revokeAllSessionsForUser: async () => ({ revoked: 3 }),
        },
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 200);
          assert.equal(payload.revokedLocalSessions, 3);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("forbids queue diagnostics for non-managers", async () => {
    const handled = await handleAuthWorkspaceRoutes(
      { method: "GET" },
      {},
      new URL("http://localhost/api/enrichment/queue"),
      createBaseContext({
        isWorkspaceManager: () => false,
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 403);
          assert.match(payload.error, /only workspace owners\/admins/i);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("lists workspaces for current user", async () => {
    const handled = await handleAuthWorkspaceRoutes(
      { method: "GET" },
      {},
      new URL("http://localhost/api/workspaces"),
      createBaseContext({
        authRepo: {
          listWorkspacesForUser: async (userId) => {
            assert.equal(userId, "u1");
            return [{ id: "w1" }, { id: "w2" }];
          },
        },
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 200);
          assert.equal(payload.count, 2);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("forbids invite create for non-managers", async () => {
    const handled = await handleAuthWorkspaceRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/workspaces/invites"),
      createBaseContext({
        isWorkspaceManager: () => false,
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 403);
          assert.match(payload.error, /only workspace owners\/admins can create invites/i);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("rejects empty invite token on accept route", async () => {
    const handled = await handleAuthWorkspaceRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/workspaces/invites/%20/accept"),
      createBaseContext({
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 400);
          assert.match(payload.error, /Missing invite token/i);
        },
      }),
    );
    assert.equal(handled, true);
  });
});
