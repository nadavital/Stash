import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPublicAuthRouteContext,
  buildAuthWorkspaceRouteContext,
  buildChatRouteContext,
  buildBatchRouteContext,
} from "../../src/routes/apiRouteContexts.js";
import { handleApiHealth } from "../../src/routes/apiHealth.js";

describe("api route context builders", () => {
  it("builds public auth route context with request metadata", () => {
    const deps = {
      sendJson: () => {},
      readJsonBody: () => {},
      resolveErrorStatus: () => {},
      config: { authProvider: "neon" },
      logger: {},
      checkAuthRate: () => {},
      getAuthFailureStatus: () => {},
      registerAuthFailure: () => {},
      clearAuthFailures: () => {},
      recordAuthEvent: () => {},
      neonSignInWithEmailPassword: () => {},
      resolveNeonActorFromToken: () => {},
      buildNeonSessionPayload: () => {},
      firebaseSignInWithEmailPassword: () => {},
      verifyFirebaseIdToken: () => {},
      authRepo: {},
      buildFirebaseSessionPayload: () => {},
      firebaseSendEmailVerification: () => {},
      neonSignUpWithEmailPassword: () => {},
      firebaseSignUpWithEmailPassword: () => {},
      neonSendPasswordResetEmail: () => {},
      firebaseSendPasswordResetEmail: () => {},
      firebaseRefreshIdToken: () => {},
    };

    const context = buildPublicAuthRouteContext(deps, {
      requestIp: "1.2.3.4",
      requestOrigin: "http://localhost:8787",
    });

    assert.equal(context.requestIp, "1.2.3.4");
    assert.equal(context.requestOrigin, "http://localhost:8787");
    assert.equal(context.config.authProvider, "neon");
  });

  it("builds authenticated contexts with actor attached", () => {
    const actor = { userId: "u1", workspaceId: "w1" };
    const deps = {
      sendJson: () => {},
      readJsonBody: () => {},
      resolveErrorStatus: () => {},
      config: { authProvider: "neon" },
      isWorkspaceManager: () => true,
      authRepo: {},
      getEnrichmentQueueStats: () => {},
      firebaseSendEmailVerification: () => {},
      firebaseChangePassword: () => {},
      verifyFirebaseIdToken: () => {},
      buildFirebaseSessionPayload: () => {},
      revokeFirebaseUserSessions: () => {},
      deleteFirebaseUser: () => {},
      registerAuthFailure: () => {},
      recordAuthEvent: () => {},
      parseWorkingSetIds: () => [],
      normalizeRecentChatMessages: () => [],
      isLikelyExternalInfoRequest: () => false,
      extractDomainsFromText: () => [],
      extractDomainFromUrl: () => "",
      searchMemories: () => [],
      noteRepo: {},
      buildChatWebSearchTool: () => null,
      CHAT_TOOLS: [],
      createCitationNoteAliasMap: () => new Map(),
      createCitationNoteNameAliasMap: () => new Map(),
      createStreamingResponse: () => {},
      extractOutputUrlCitations: () => [],
      buildCitationBlock: () => "",
      CHAT_SYSTEM_PROMPT: "",
      createAgentToolHarness: () => {},
      resolveAgentToolArgs: () => ({}),
      executeChatToolCall: () => {},
      logger: {},
      buildAgentNoteTitle: () => "",
      createMemory: () => {},
      askMemories: () => {},
      buildProjectContext: () => "",
      validateBatchPayload: () => ({ valid: true }),
      batchDeleteMemories: () => {},
      batchMoveMemories: () => {},
    };

    const authContext = buildAuthWorkspaceRouteContext(deps, {
      actor,
      requestIp: "5.6.7.8",
      requiresEmailVerification: true,
    });
    const chatContext = buildChatRouteContext(deps, { actor });
    const batchContext = buildBatchRouteContext(deps, { actor });

    assert.equal(authContext.actor, actor);
    assert.equal(authContext.requestIp, "5.6.7.8");
    assert.equal(authContext.requiresEmailVerification, true);
    assert.equal(chatContext.actor, actor);
    assert.equal(batchContext.actor, actor);
  });
});

describe("handleApiHealth", () => {
  it("returns false for non-health route", async () => {
    const called = [];
    const result = await handleApiHealth(
      { method: "GET" },
      {},
      {
        url: { pathname: "/api/other" },
        startedAt: Date.now(),
        sendJson: (...args) => called.push(args),
        hasOpenAI: () => true,
        config: { authProvider: "neon" },
        isFirebaseConfigured: async () => true,
        isNeonConfigured: () => true,
        providerName: "postgres",
        storageBridgeMode: "direct",
        enrichmentQueue: { pending: 0, active: 0, stats: {} },
      },
    );
    assert.equal(result, false);
    assert.equal(called.length, 0);
  });

  it("returns health payload for /api/health", async () => {
    const called = [];
    const result = await handleApiHealth(
      { method: "GET" },
      {},
      {
        url: { pathname: "/api/health" },
        startedAt: Date.now() - 1000,
        sendJson: (...args) => called.push(args),
        hasOpenAI: () => false,
        config: { authProvider: "neon" },
        isFirebaseConfigured: async () => false,
        isNeonConfigured: () => true,
        providerName: "postgres",
        storageBridgeMode: "direct",
        enrichmentQueue: { pending: 1, active: 2, stats: { failed: 3 } },
      },
    );

    assert.equal(result, true);
    assert.equal(called.length, 1);
    assert.equal(called[0][1], 200);
    assert.equal(called[0][2].ok, true);
    assert.equal(called[0][2].auth.provider, "neon");
    assert.equal(called[0][2].queue.pending, 1);
    assert.equal(called[0][2].queue.failed, 3);
  });
});
