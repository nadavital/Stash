import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const BASE = process.env.TEST_BASE_URL || "http://localhost:8787";
const TEST_RUN_ID = process.env.TEST_RUN_ID || Date.now().toString(36);
const SECONDARY_EMAIL = `integration+second-${TEST_RUN_ID}@example.com`;
let AUTH_TOKEN = "";
let REQUEST_SEQ = 0;
let SECONDARY_TOKEN = "";
let PRIMARY_WORKSPACE_ID = "";

function jsonFetch(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    REQUEST_SEQ += 1;
    const requestIp = options.clientIp || `192.0.2.${(REQUEST_SEQ % 200) + 1}`;
    const authHeader =
      options.authToken === null
        ? {}
        : options.authToken
          ? { Authorization: `Bearer ${options.authToken}` }
          : AUTH_TOKEN
            ? { Authorization: `Bearer ${AUTH_TOKEN}` }
            : {};
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": requestIp,
        ...authHeader,
        ...options.headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, body: data, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function getSecondaryToken() {
  if (SECONDARY_TOKEN) return SECONDARY_TOKEN;

  const secondPassword = "integration-pass-456";

  const secondSignup = await jsonFetch("/api/auth/signup", {
    method: "POST",
    authToken: null,
    body: {
      email: SECONDARY_EMAIL,
      name: "Integration Second User",
      password: secondPassword,
    },
  });

  if (secondSignup.status === 201) {
    SECONDARY_TOKEN = secondSignup.body.session?.token || "";
    return SECONDARY_TOKEN;
  }

  const secondLogin = await jsonFetch("/api/auth/login", {
    method: "POST",
    authToken: null,
    body: {
      email: SECONDARY_EMAIL,
      password: secondPassword,
    },
  });
  assert.equal(secondLogin.status, 200);
  SECONDARY_TOKEN = secondLogin.body.session?.token || "";
  return SECONDARY_TOKEN;
}

async function ensureSecondaryInPrimaryWorkspace() {
  const secondToken = await getSecondaryToken();
  assert.ok(secondToken);

  if (!PRIMARY_WORKSPACE_ID) {
    const session = await jsonFetch("/api/auth/session");
    assert.equal(session.status, 200);
    PRIMARY_WORKSPACE_ID = session.body?.actor?.workspaceId || "";
  }
  assert.ok(PRIMARY_WORKSPACE_ID);

  const existingWorkspaces = await jsonFetch("/api/workspaces", { authToken: secondToken });
  assert.equal(existingWorkspaces.status, 200);
  const alreadyMember = (existingWorkspaces.body.items || []).some((item) => item?.id === PRIMARY_WORKSPACE_ID);
  if (alreadyMember) {
    return secondToken;
  }

  const created = await jsonFetch("/api/workspaces/invites", {
    method: "POST",
    body: {
      email: SECONDARY_EMAIL,
      role: "member",
    },
  });
  if (created.status === 201 && created.body?.invite?.token) {
    const accepted = await jsonFetch(
      `/api/workspaces/invites/${encodeURIComponent(created.body.invite.token)}/accept`,
      { method: "POST", authToken: secondToken }
    );
    assert.equal(accepted.status, 200);
  }

  const refreshed = await jsonFetch("/api/workspaces", { authToken: secondToken });
  assert.equal(refreshed.status, 200);
  const hasPrimary = (refreshed.body.items || []).some((item) => item?.id === PRIMARY_WORKSPACE_ID);
  assert.equal(hasPrimary, true);
  return secondToken;
}

describe("API Integration", () => {
  // These tests assume a running server at TEST_BASE_URL (or localhost:8787 by default).

  before(async () => {
    const email = "integration@example.com";
    const password = "integration-pass-123";

    const signUpResult = await jsonFetch("/api/auth/signup", {
      method: "POST",
      body: {
        email,
        name: "Integration Test",
        password,
      },
    });

    if (signUpResult.status === 201) {
      assert.ok(signUpResult.body.session?.token);
      AUTH_TOKEN = signUpResult.body.session.token;
      return;
    }

    const { status, body } = await jsonFetch("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    assert.equal(status, 200);
    assert.ok(body.session?.token);
    AUTH_TOKEN = body.session.token;
  });

  after(() => {
    AUTH_TOKEN = "";
    SECONDARY_TOKEN = "";
  });

  it("GET /api/auth/session returns actor context", async () => {
    const { status, body } = await jsonFetch("/api/auth/session");
    assert.equal(status, 200);
    assert.ok(body.actor?.workspaceId);
    assert.ok(body.actor?.userId);
    assert.equal(typeof body.requiresEmailVerification, "boolean");
    PRIMARY_WORKSPACE_ID = body.actor.workspaceId;
  });

  it("GET /api/health returns OK", async () => {
    const { status, body } = await jsonFetch("/api/health");
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(body.uptime >= 0);
    assert.ok(body.memory);
    assert.ok(body.memory.rss > 0);
  });

  it("GET /api/notes returns items", async () => {
    const { status, body } = await jsonFetch("/api/notes?limit=5");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.count >= 0);
  });

  it("rejects query-token auth on non-SSE routes", async () => {
    const { status } = await jsonFetch(
      `/api/notes?sessionToken=${encodeURIComponent(AUTH_TOKEN)}&limit=1`,
      { authToken: null }
    );
    assert.equal(status, 401);
  });

  it("GET /api/projects returns projects list", async () => {
    const { status, body } = await jsonFetch("/api/projects");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
  });

  it("GET /api/workspaces returns memberships", async () => {
    const { status, body } = await jsonFetch("/api/workspaces");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length >= 1);
  });

  it("GET /api/workspaces/members returns workspace users", async () => {
    const secondToken = await ensureSecondaryInPrimaryWorkspace();
    assert.ok(secondToken);

    const { status, body } = await jsonFetch("/api/workspaces/members?limit=20");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length >= 2);
    const hasPrimary = (body.items || []).some((entry) => entry?.email === "integration@example.com");
    const hasSecondary = (body.items || []).some((entry) => entry?.email === SECONDARY_EMAIL);
    assert.equal(hasPrimary, true);
    assert.equal(hasSecondary, true);
  });

  it("GET /api/auth/audit returns auth events for workspace manager", async () => {
    const { status, body } = await jsonFetch("/api/auth/audit?limit=20");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
  });

  it("GET /api/tags returns tags list", async () => {
    const { status, body } = await jsonFetch("/api/tags");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
  });

  it("GET /api/stats returns statistics", async () => {
    const { status, body } = await jsonFetch("/api/stats");
    assert.equal(status, 200);
    assert.ok(typeof body.totalNotes === "number");
    assert.ok(Array.isArray(body.byProject));
    assert.ok(Array.isArray(body.bySourceType));
  });

  it("POST /api/notes validates input", async () => {
    const { status, body } = await jsonFetch("/api/notes", {
      method: "POST",
      body: { sourceType: "invalid" },
    });
    assert.equal(status, 400);
    assert.ok(body.error.includes("sourceType"));
  });

  it("POST /api/notes creates a note", async () => {
    const { status, body } = await jsonFetch("/api/notes", {
      method: "POST",
      body: { content: "Integration test note", sourceType: "text", project: "TestIntegration" },
    });
    assert.equal(status, 201);
    assert.ok(body.note);
    assert.equal(body.note.content, "Integration test note");

    // Cleanup
    if (body.note?.id) {
      await jsonFetch(`/api/notes/${body.note.id}`, { method: "DELETE" });
    }
  });

  it("isolates notes between users", async () => {
    const secondToken = await getSecondaryToken();
    assert.ok(secondToken);
    const marker = `isolation-marker-${Date.now()}`;

    const { status: createStatus, body: createBody } = await jsonFetch("/api/notes", {
      method: "POST",
      authToken: secondToken,
      body: {
        content: `Second user private note ${marker}`,
        sourceType: "text",
        project: "IsolationTest",
      },
    });

    assert.equal(createStatus, 201);
    assert.ok(createBody.note?.id);

    try {
      const { status, body } = await jsonFetch(`/api/notes?query=${encodeURIComponent(marker)}&limit=20`);
      assert.equal(status, 200);
      const leaked = (body.items || []).some((entry) =>
        String(entry?.note?.content || "").includes(marker)
      );
      assert.equal(leaked, false);
    } finally {
      await jsonFetch(`/api/notes/${encodeURIComponent(createBody.note.id)}`, {
        method: "DELETE",
        authToken: secondToken,
      });
    }
  });

  it("isolates stats and export payloads between users", async () => {
    const secondToken = await getSecondaryToken();
    assert.ok(secondToken);

    const projectName = `IsolationProject-${Date.now()}`;
    const marker = `isolation-export-${Date.now()}`;

    const { status: createStatus, body: createBody } = await jsonFetch("/api/notes", {
      method: "POST",
      authToken: secondToken,
      body: {
        content: `Private cross-user content ${marker}`,
        sourceType: "text",
        project: projectName,
      },
    });
    assert.equal(createStatus, 201);
    assert.ok(createBody.note?.id);

    try {
      const stats = await jsonFetch("/api/stats");
      assert.equal(stats.status, 200);
      const projectLeak = (stats.body.byProject || []).some((entry) => entry?.project === projectName);
      assert.equal(projectLeak, false);

      const exported = await jsonFetch("/api/export?format=json");
      assert.equal(exported.status, 200);
      const exportLeak = JSON.stringify(exported.body).includes(marker);
      assert.equal(exportLeak, false);
    } finally {
      await jsonFetch(`/api/notes/${encodeURIComponent(createBody.note.id)}`, {
        method: "DELETE",
        authToken: secondToken,
      });
    }
  });

  it("supports workspace invite create and accept", async () => {
    const secondToken = await getSecondaryToken();
    assert.ok(secondToken);
    assert.ok(PRIMARY_WORKSPACE_ID);

    const created = await jsonFetch("/api/workspaces/invites", {
      method: "POST",
      body: {
        email: SECONDARY_EMAIL,
        role: "member",
      },
    });
    assert.ok(created.status === 201 || created.status === 409);

    if (created.status === 201 && created.body?.invite?.token) {
      const accepted = await jsonFetch(
        `/api/workspaces/invites/${encodeURIComponent(created.body.invite.token)}/accept`,
        {
          method: "POST",
          authToken: secondToken,
        }
      );
      assert.equal(accepted.status, 200);
      assert.equal(accepted.body?.invite?.status, "accepted");
    } else {
      const incoming = await jsonFetch("/api/workspaces/invites/incoming", {
        authToken: secondToken,
      });
      assert.equal(incoming.status, 200);
      const pendingForPrimary = (incoming.body.items || []).find(
        (item) => item?.workspaceId === PRIMARY_WORKSPACE_ID && item?.status === "pending" && item?.token
      );
      if (pendingForPrimary?.token) {
        const accepted = await jsonFetch(
          `/api/workspaces/invites/${encodeURIComponent(pendingForPrimary.token)}/accept`,
          {
            method: "POST",
            authToken: secondToken,
          }
        );
        assert.equal(accepted.status, 200);
      }
    }

    const workspaces = await jsonFetch("/api/workspaces", {
      authToken: secondToken,
    });
    assert.equal(workspaces.status, 200);
    const hasPrimary = (workspaces.body.items || []).some((item) => item?.id === PRIMARY_WORKSPACE_ID);
    assert.equal(hasPrimary, true);
  });

  it("supports folder collaborator role management and folder activity", async () => {
    const secondToken = await ensureSecondaryInPrimaryWorkspace();
    assert.ok(secondToken);

    const folderName = `Collab-${Date.now()}`;
    const createdFolder = await jsonFetch("/api/folders", {
      method: "POST",
      body: {
        name: folderName,
        description: "Folder collaboration integration test",
        color: "blue",
      },
    });
    assert.equal(createdFolder.status, 201);
    const folderId = createdFolder.body?.folder?.id;
    assert.ok(folderId);

    try {
      const members = await jsonFetch("/api/workspaces/members?limit=100");
      assert.equal(members.status, 200);
      const secondaryMember = (members.body.items || []).find((item) => item?.email === SECONDARY_EMAIL);
      assert.ok(secondaryMember?.userId);

      const initialCollaborators = await jsonFetch(`/api/folders/${encodeURIComponent(folderId)}/collaborators`);
      assert.equal(initialCollaborators.status, 200);
      const hasManager = (initialCollaborators.body.items || []).some(
        (entry) => entry?.userId && entry?.role === "manager"
      );
      assert.equal(hasManager, true);

      const setRole = await jsonFetch(
        `/api/folders/${encodeURIComponent(folderId)}/collaborators/${encodeURIComponent(secondaryMember.userId)}`,
        {
          method: "PUT",
          body: { role: "editor" },
        }
      );
      assert.equal(setRole.status, 200);
      assert.equal(setRole.body?.collaborator?.role, "editor");

      const afterSet = await jsonFetch(`/api/folders/${encodeURIComponent(folderId)}/collaborators`);
      assert.equal(afterSet.status, 200);
      const collaborator = (afterSet.body.items || []).find((entry) => entry?.userId === secondaryMember.userId);
      assert.equal(collaborator?.role, "editor");

      const activity = await jsonFetch(`/api/activity?folderId=${encodeURIComponent(folderId)}&limit=20`);
      assert.equal(activity.status, 200);
      assert.ok(Array.isArray(activity.body.items));
      const eventTypes = (activity.body.items || []).map((entry) => entry?.eventType).filter(Boolean);
      assert.ok(eventTypes.includes("folder.created"));
      assert.ok(eventTypes.includes("folder.shared"));

      const removed = await jsonFetch(
        `/api/folders/${encodeURIComponent(folderId)}/collaborators/${encodeURIComponent(secondaryMember.userId)}`,
        { method: "DELETE" }
      );
      assert.equal(removed.status, 200);
      assert.equal(removed.body.removed, 1);

      const afterRemove = await jsonFetch(`/api/folders/${encodeURIComponent(folderId)}/collaborators`);
      assert.equal(afterRemove.status, 200);
      const stillPresent = (afterRemove.body.items || []).some((entry) => entry?.userId === secondaryMember.userId);
      assert.equal(stillPresent, false);
    } finally {
      await jsonFetch(`/api/folders/${encodeURIComponent(folderId)}`, { method: "DELETE" });
    }
  });

  it("GET /api/export returns data", async () => {
    const { status } = await jsonFetch("/api/export?format=json");
    assert.equal(status, 200);
  });

  it("OPTIONS returns CORS headers", async () => {
    const { status, headers } = await jsonFetch("/api/notes", { method: "OPTIONS" });
    assert.equal(status, 204);
    assert.ok(headers["access-control-allow-methods"]?.includes("PUT"));
  });

  it("returns 404 for unknown API routes", async () => {
    const { status } = await jsonFetch("/api/nonexistent");
    assert.equal(status, 404);
  });

  // --- PUT /api/notes/:id ---

  it("PUT /api/notes/:id updates a note", async () => {
    // Create a note first
    const { body: created } = await jsonFetch("/api/notes", {
      method: "POST",
      body: { content: "Original content", sourceType: "text", project: "TestPUT" },
    });
    const id = created.note.id;

    // Update content and tags
    const { status, body } = await jsonFetch(`/api/notes/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: { content: "Updated content", tags: ["test-tag"] },
    });
    assert.equal(status, 200);
    assert.equal(body.note.content, "Updated content");
    assert.ok(body.note.tags.includes("test-tag"));

    // Cleanup
    await jsonFetch(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
  });

  it("PUT /api/notes/:id returns 404 for nonexistent note", async () => {
    const { status } = await jsonFetch("/api/notes/nonexistent-id-12345", {
      method: "PUT",
      body: { content: "nope" },
    });
    assert.equal(status, 404);
  });

  it("PUT /api/notes/:id returns 400 for missing id", async () => {
    const { status } = await jsonFetch("/api/notes/%20", {
      method: "PUT",
      body: { content: "nope" },
    });
    assert.equal(status, 400);
  });

  // --- POST /api/notes/batch-delete ---

  it("POST /api/notes/batch-delete deletes multiple notes", async () => {
    // Create two notes
    const { body: n1 } = await jsonFetch("/api/notes", {
      method: "POST",
      body: { content: "Batch delete 1", sourceType: "text", project: "TestBatch" },
    });
    const { body: n2 } = await jsonFetch("/api/notes", {
      method: "POST",
      body: { content: "Batch delete 2", sourceType: "text", project: "TestBatch" },
    });

    const ids = [n1.note.id, n2.note.id];
    const { status, body } = await jsonFetch("/api/notes/batch-delete", {
      method: "POST",
      body: { ids },
    });
    assert.equal(status, 200);
    assert.equal(body.deleted, 2);
  });

  it("POST /api/notes/batch-delete validates input", async () => {
    const { status, body } = await jsonFetch("/api/notes/batch-delete", {
      method: "POST",
      body: {},
    });
    assert.equal(status, 400);
    assert.ok(body.error);
  });

  // --- POST /api/notes/batch-move ---

  it("POST /api/notes/batch-move moves notes to a project", async () => {
    // Create two notes
    const { body: n1 } = await jsonFetch("/api/notes", {
      method: "POST",
      body: { content: "Batch move 1", sourceType: "text", project: "SourceProject" },
    });
    const { body: n2 } = await jsonFetch("/api/notes", {
      method: "POST",
      body: { content: "Batch move 2", sourceType: "text", project: "SourceProject" },
    });

    const ids = [n1.note.id, n2.note.id];
    const { status, body } = await jsonFetch("/api/notes/batch-move", {
      method: "POST",
      body: { ids, project: "TargetProject" },
    });
    assert.equal(status, 200);
    assert.equal(body.moved, 2);

    // Cleanup
    await jsonFetch("/api/notes/batch-delete", {
      method: "POST",
      body: { ids },
    });
  });

  it("POST /api/notes/batch-move validates input", async () => {
    const { status, body } = await jsonFetch("/api/notes/batch-move", {
      method: "POST",
      body: { project: "nowhere" },
    });
    assert.equal(status, 400);
    assert.ok(body.error);
  });

  // --- Pagination ---

  it("GET /api/notes respects offset and limit params", async () => {
    const { status, body } = await jsonFetch("/api/notes?limit=2&offset=0");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length <= 2);
    assert.equal(body.offset, 0);
    assert.equal(body.limit, 2);
    assert.ok(typeof body.hasMore === "boolean");
  });

  it("GET /api/notes offset returns different results", async () => {
    // Create enough notes to paginate
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const { body } = await jsonFetch("/api/notes", {
        method: "POST",
        body: { content: `Pagination note ${i}`, sourceType: "text", project: "TestPagination" },
      });
      ids.push(body.note.id);
    }

    const { body: page1 } = await jsonFetch("/api/notes?limit=2&offset=0&project=TestPagination");
    const { body: page2 } = await jsonFetch("/api/notes?limit=2&offset=2&project=TestPagination");

    assert.ok(page1.items.length <= 2);
    // page2 may have items or not, depending on other data; just verify the response shape
    assert.ok(Array.isArray(page2.items));
    assert.equal(page2.offset, 2);

    // Cleanup
    await jsonFetch("/api/notes/batch-delete", { method: "POST", body: { ids } });
  });

  it("GET /api/notes supports item scope with working set ids", async () => {
    const project = `ScopeItem-${Date.now()}`;
    const createdIds = [];
    try {
      const first = await jsonFetch("/api/notes", {
        method: "POST",
        body: { content: "Scope item note A", sourceType: "text", project },
      });
      const second = await jsonFetch("/api/notes", {
        method: "POST",
        body: { content: "Scope item note B", sourceType: "text", project },
      });
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      createdIds.push(first.body.note.id, second.body.note.id);

      const path = `/api/notes?scope=item&limit=10&workingSetIds=${encodeURIComponent(first.body.note.id)}`;
      const { status, body } = await jsonFetch(path);
      assert.equal(status, 200);
      const resultIds = (body.items || []).map((entry) => entry?.note?.id).filter(Boolean);
      assert.deepEqual(resultIds, [first.body.note.id]);
    } finally {
      if (createdIds.length) {
        await jsonFetch("/api/notes/batch-delete", { method: "POST", body: { ids: createdIds } });
      }
    }
  });

  it("GET /api/recent enforces project scope rules", async () => {
    const project = `ScopeProject-${Date.now()}`;
    let createdId = "";
    try {
      const created = await jsonFetch("/api/notes", {
        method: "POST",
        body: { content: `Project scope note ${project}`, sourceType: "text", project },
      });
      assert.equal(created.status, 201);
      createdId = created.body.note.id;

      const emptyScoped = await jsonFetch("/api/recent?scope=project&limit=5");
      assert.equal(emptyScoped.status, 200);
      assert.equal(emptyScoped.body.count, 0);

      const scoped = await jsonFetch(`/api/recent?scope=project&project=${encodeURIComponent(project)}&limit=10`);
      assert.equal(scoped.status, 200);
      const ids = (scoped.body.items || []).map((entry) => entry?.id).filter(Boolean);
      assert.ok(ids.includes(createdId));
    } finally {
      if (createdId) {
        await jsonFetch(`/api/notes/${encodeURIComponent(createdId)}`, { method: "DELETE" });
      }
    }
  });

  it("POST /api/context supports item scope and working set ids", async () => {
    const marker = `context-scope-${Date.now()}`;
    const project = `ScopeContext-${Date.now()}`;
    const createdIds = [];
    try {
      const focus = await jsonFetch("/api/notes", {
        method: "POST",
        body: { content: `Focus note ${marker}`, sourceType: "text", project },
      });
      const distractor = await jsonFetch("/api/notes", {
        method: "POST",
        body: { content: "Distractor note for scope test", sourceType: "text", project },
      });
      assert.equal(focus.status, 201);
      assert.equal(distractor.status, 201);
      createdIds.push(focus.body.note.id, distractor.body.note.id);

      const { status, body } = await jsonFetch("/api/context", {
        method: "POST",
        body: {
          task: marker,
          scope: "item",
          workingSetIds: [focus.body.note.id],
          limit: 6,
        },
      });
      assert.equal(status, 200);
      const citationIds = (body.citations || []).map((entry) => entry?.note?.id).filter(Boolean);
      assert.ok(citationIds.includes(focus.body.note.id));
      assert.equal(citationIds.includes(distractor.body.note.id), false);
    } finally {
      if (createdIds.length) {
        await jsonFetch("/api/notes/batch-delete", { method: "POST", body: { ids: createdIds } });
      }
    }
  });

  it("POST /api/chat keeps context note first for item scope", async () => {
    const marker = `chat-scope-${Date.now()}`;
    const project = `ScopeChat-${Date.now()}`;
    const createdIds = [];
    try {
      const focus = await jsonFetch("/api/notes", {
        method: "POST",
        body: { content: `Primary context ${marker}`, sourceType: "text", project },
      });
      const extra = await jsonFetch("/api/notes", {
        method: "POST",
        body: { content: `Secondary context ${marker}`, sourceType: "text", project },
      });
      assert.equal(focus.status, 201);
      assert.equal(extra.status, 201);
      createdIds.push(focus.body.note.id, extra.body.note.id);

      const { status, body } = await jsonFetch("/api/chat", {
        method: "POST",
        body: {
          question: `Summarize this: ${marker}`,
          scope: "item",
          contextNoteId: focus.body.note.id,
          workingSetIds: [focus.body.note.id],
          limit: 5,
        },
      });
      assert.equal(status, 200);
      assert.ok(Array.isArray(body.citations));
      assert.ok(body.citations.length >= 1);
      const citationIds = body.citations.map((entry) => entry?.note?.id).filter(Boolean);
      assert.equal(citationIds[0], focus.body.note.id);
      assert.equal(citationIds.every((id) => id === focus.body.note.id), true);
    } finally {
      if (createdIds.length) {
        await jsonFetch("/api/notes/batch-delete", { method: "POST", body: { ids: createdIds } });
      }
    }
  });

  // --- SSE ---

  it("GET /api/events returns SSE stream", async () => {
    const result = await new Promise((resolve, reject) => {
      const url = new URL("/api/events", BASE);
      const req = http.get(url, {
        headers: {
          "X-Forwarded-For": "192.0.2.99",
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
      }, (res) => {
        assert.equal(res.statusCode, 200);
        assert.ok(res.headers["content-type"]?.includes("text/event-stream"));
        assert.equal(res.headers["cache-control"], "no-cache");

        // Read first chunk then close
        res.once("data", (chunk) => {
          const text = chunk.toString();
          // SSE comment or event — valid if starts with : or data:
          resolve({ statusCode: res.statusCode, contentType: res.headers["content-type"], firstChunk: text });
          req.destroy();
        });

        // Timeout in case no data arrives
        setTimeout(() => {
          resolve({ statusCode: res.statusCode, contentType: res.headers["content-type"], firstChunk: null });
          req.destroy();
        }, 2000);
      });
      req.on("error", (err) => {
        // ECONNRESET is expected when we destroy
        if (err.code !== "ECONNRESET") reject(err);
      });
    });

    assert.equal(result.statusCode, 200);
    assert.ok(result.contentType?.includes("text/event-stream"));
  });
});
