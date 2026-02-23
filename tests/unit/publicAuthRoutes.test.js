import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handlePublicAuthRoutes } from "../../src/routes/publicAuthRoutes.js";

function createBaseContext(overrides = {}) {
  return {
    requestIp: "127.0.0.1",
    requestOrigin: "http://localhost:8787",
    sendJson: () => {},
    readJsonBody: async () => ({}),
    resolveErrorStatus: () => 400,
    config: { authProvider: "local", authRequireEmailVerification: false },
    logger: { warn: () => {} },
    checkAuthRate: () => ({ allowed: true, retryAfter: 0 }),
    getAuthFailureStatus: () => ({ requiresCaptcha: false, count: 0 }),
    registerAuthFailure: () => ({ requiresCaptcha: false, count: 0 }),
    clearAuthFailures: () => {},
    recordAuthEvent: () => {},
    neonSignInWithEmailPassword: async () => ({}),
    resolveNeonActorFromToken: async () => ({}),
    buildNeonSessionPayload: () => ({}),
    firebaseSignInWithEmailPassword: async () => ({}),
    verifyFirebaseIdToken: async () => ({}),
    authRepo: {
      loginAndIssueSession: async () => ({
        user: { id: "u1", email: "user@example.com" },
        workspace: { id: "w1" },
      }),
    },
    buildFirebaseSessionPayload: () => ({}),
    firebaseSendEmailVerification: async () => {},
    neonSignUpWithEmailPassword: async () => ({}),
    firebaseSignUpWithEmailPassword: async () => ({}),
    neonSendPasswordResetEmail: async () => {},
    firebaseSendPasswordResetEmail: async () => {},
    firebaseRefreshIdToken: async () => ({}),
    ...overrides,
  };
}

describe("handlePublicAuthRoutes", () => {
  it("returns false for unrelated routes", async () => {
    const handled = await handlePublicAuthRoutes(
      { method: "GET" },
      {},
      new URL("http://localhost/api/notes"),
      createBaseContext(),
    );
    assert.equal(handled, false);
  });

  it("rate limits auth write paths before body parsing", async () => {
    const calls = { json: 0, body: 0 };
    const handled = await handlePublicAuthRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/login"),
      createBaseContext({
        checkAuthRate: () => ({ allowed: false, retryAfter: 20 }),
        readJsonBody: async () => {
          calls.body += 1;
          return {};
        },
        sendJson: (_res, statusCode, payload) => {
          calls.json += 1;
          assert.equal(statusCode, 429);
          assert.equal(payload.captchaRequired, true);
        },
      }),
    );
    assert.equal(handled, true);
    assert.equal(calls.json, 1);
    assert.equal(calls.body, 0);
  });

  it("blocks auth writes when failure tracker requires captcha", async () => {
    const handled = await handlePublicAuthRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/signup"),
      createBaseContext({
        getAuthFailureStatus: () => ({ requiresCaptcha: true, count: 99 }),
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 429);
          assert.equal(payload.captchaRequired, true);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("rejects workspace override in login body", async () => {
    const handled = await handlePublicAuthRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/login"),
      createBaseContext({
        readJsonBody: async () => ({ email: "x", workspaceId: "forbidden" }),
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 400);
          assert.match(payload.error, /Workspace override is not allowed/i);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("handles local login and records success", async () => {
    let loginCalls = 0;
    let clearCalls = 0;
    let eventCalls = 0;
    const handled = await handlePublicAuthRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/login"),
      createBaseContext({
        readJsonBody: async () => ({ email: "user@example.com", password: "secret" }),
        authRepo: {
          loginAndIssueSession: async () => {
            loginCalls += 1;
            return {
              user: { id: "u-local", email: "user@example.com" },
              workspace: { id: "w-local" },
            };
          },
        },
        clearAuthFailures: () => {
          clearCalls += 1;
        },
        recordAuthEvent: (event) => {
          eventCalls += 1;
          assert.equal(event.eventType, "auth.login");
          assert.equal(event.outcome, "success");
          assert.equal(event.provider, "local");
        },
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 200);
          assert.equal(payload.session.user.id, "u-local");
          assert.equal(payload.session.workspace.id, "w-local");
        },
      }),
    );
    assert.equal(handled, true);
    assert.equal(loginCalls, 1);
    assert.equal(clearCalls, 1);
    assert.equal(eventCalls, 1);
  });

  it("rejects password reset when provider is local", async () => {
    const handled = await handlePublicAuthRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/password-reset"),
      createBaseContext({
        config: { authProvider: "local", authRequireEmailVerification: false },
        readJsonBody: async () => ({ email: "user@example.com" }),
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 400);
          assert.match(payload.error, /only available with Firebase auth provider/i);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("handles neon password reset and returns ok", async () => {
    let resetCalls = 0;
    const handled = await handlePublicAuthRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/password-reset"),
      createBaseContext({
        config: { authProvider: "neon", authRequireEmailVerification: false },
        readJsonBody: async () => ({ email: "reset@example.com" }),
        neonSendPasswordResetEmail: async ({ email, origin }) => {
          resetCalls += 1;
          assert.equal(email, "reset@example.com");
          assert.equal(origin, "http://localhost:8787");
        },
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 200);
          assert.equal(payload.ok, true);
        },
      }),
    );
    assert.equal(handled, true);
    assert.equal(resetCalls, 1);
  });

  it("rejects refresh endpoint in neon provider mode", async () => {
    const handled = await handlePublicAuthRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/refresh"),
      createBaseContext({
        config: { authProvider: "neon", authRequireEmailVerification: false },
        readJsonBody: async () => ({ refreshToken: "rtok" }),
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 400);
          assert.match(payload.error, /not available in Neon auth mode/i);
        },
      }),
    );
    assert.equal(handled, true);
  });

  it("refreshes firebase tokens and propagates requiresEmailVerification", async () => {
    let refreshCalls = 0;
    const handled = await handlePublicAuthRoutes(
      { method: "POST" },
      {},
      new URL("http://localhost/api/auth/refresh"),
      createBaseContext({
        config: { authProvider: "firebase", authRequireEmailVerification: true },
        readJsonBody: async () => ({ refreshToken: "refresh-123" }),
        firebaseRefreshIdToken: async (refreshToken) => {
          refreshCalls += 1;
          assert.equal(refreshToken, "refresh-123");
          return { idToken: "id-token", refreshToken: "new-refresh" };
        },
        verifyFirebaseIdToken: async (idToken) => {
          assert.equal(idToken, "id-token");
          return { sub: "firebase-user" };
        },
        authRepo: {
          resolveFirebaseActorFromClaims: async (claims) => {
            assert.equal(claims.sub, "firebase-user");
            return {
              id: "firebase-user",
              email: "firebase@example.com",
              emailVerified: false,
              workspaceId: "w-firebase",
            };
          },
        },
        buildFirebaseSessionPayload: () => ({
          user: { id: "firebase-user", email: "firebase@example.com" },
          workspace: { id: "w-firebase" },
        }),
        sendJson: (_res, statusCode, payload) => {
          assert.equal(statusCode, 200);
          assert.equal(payload.session.user.id, "firebase-user");
          assert.equal(payload.session.requiresEmailVerification, true);
        },
      }),
    );
    assert.equal(handled, true);
    assert.equal(refreshCalls, 1);
  });
});
