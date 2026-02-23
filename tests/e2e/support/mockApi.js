function wait(ms = 0) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildSseBody(events = []) {
  const lines = [];
  events.forEach((event) => {
    lines.push(`event: ${event.type}`);
    lines.push(`data: ${JSON.stringify(event.data || {})}`);
    lines.push("");
  });
  if (!events.some((event) => event.type === "done")) {
    lines.push("event: done");
    lines.push(`data: ${JSON.stringify({ done: true })}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function encodeJson(route, status, payload) {
  return route.fulfill({
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
}

function noteMatchesQuery(note, query) {
  const q = normalizeText(query).toLowerCase();
  if (!q) return true;
  const haystack = [
    note.title,
    note.content,
    note.summary,
    note.project,
    note.sourceUrl,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .join("\n");
  return haystack.includes(q);
}

function sortNotesNewest(notes) {
  return [...notes].sort((a, b) => {
    const aTs = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTs = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTs - aTs;
  });
}

export function createMockWorkspaceState() {
  return {
    actor: {
      userId: "usr_e2e_1",
      userEmail: "e2e@example.com",
      userName: "E2E Tester",
      workspaceId: "ws_e2e_1",
      workspaceName: "E2E Workspace",
      workspaceSlug: "e2e-workspace",
      role: "owner",
      provider: "local",
    },
    folders: [
      {
        id: "fld_focus",
        name: "Focus",
        description: "Work docs",
        color: "blue",
        symbol: "DOC",
        parentId: null,
      },
      {
        id: "fld_personal",
        name: "Personal",
        description: "Personal notes",
        color: "teal",
        symbol: "DOC",
        parentId: null,
      },
    ],
    notes: [
      {
        id: "n1",
        title: "Deep Work Checklist",
        content: "Plan, execute, review.",
        sourceType: "file",
        sourceUrl: "https://example.com/deep-work",
        summary: "Checklist for deep work sessions.",
        tags: ["focus"],
        project: "Focus",
        fileName: "deep-work.md",
        fileMime: "text/markdown",
        fileSize: 1240,
        rawContent: "",
        markdownContent: "# Deep Work Checklist\n\n- Plan\n- Execute\n- Review",
        metadata: {},
        revision: 3,
        status: "ready",
        createdAt: "2026-02-20T10:00:00.000Z",
        updatedAt: "2026-02-23T00:00:00.000Z",
      },
      {
        id: "n2",
        title: "Date Night Ideas",
        content: "Try dinner + jazz in SF.",
        sourceType: "text",
        sourceUrl: "https://workmode.co/sf/cafes",
        summary: "Planning ideas.",
        tags: ["planning"],
        project: "Personal",
        fileName: "",
        fileMime: "",
        fileSize: 0,
        rawContent: "",
        markdownContent: "",
        metadata: {},
        revision: 1,
        status: "ready",
        createdAt: "2026-02-19T08:00:00.000Z",
        updatedAt: "2026-02-22T08:00:00.000Z",
      },
    ],
    versionsByNoteId: {
      n1: [
        {
          versionNumber: 3,
          createdAt: "2026-02-23T00:00:00.000Z",
          actorName: "E2E Tester",
          actorUserId: "usr_e2e_1",
          changeSummary: "Updated checklist",
          content: "# Deep Work Checklist\n\n- Plan\n- Execute\n- Review",
        },
      ],
      n2: [],
    },
  };
}

function buildCitationItems(notes) {
  return notes.map((note, index) => ({
    rank: index + 1,
    label: `N${index + 1}`,
    score: 0.9 - index * 0.1,
    note,
  }));
}

function getFolderByIdOrName(state, rawId) {
  const target = decodeURIComponent(String(rawId || "")).trim();
  if (!target) return null;
  return state.folders.find((folder) =>
    String(folder.id || "").toLowerCase() === target.toLowerCase()
    || String(folder.name || "").toLowerCase() === target.toLowerCase()
  ) || null;
}

function findNote(state, noteId) {
  const id = decodeURIComponent(String(noteId || "")).trim();
  if (!id) return null;
  return state.notes.find((note) => String(note.id) === id) || null;
}

function listNotes(state, url) {
  const query = normalizeText(url.searchParams.get("query"));
  const project = normalizeText(url.searchParams.get("project"));
  const limit = Math.max(1, Number(url.searchParams.get("limit") || 80));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const workingSetIds = url.searchParams.getAll("workingSetIds").map((id) => normalizeText(id)).filter(Boolean);
  const workingSet = new Set(workingSetIds);

  let filtered = sortNotesNewest(state.notes);
  if (project) {
    filtered = filtered.filter((note) => String(note.project || "").toLowerCase() === project.toLowerCase());
  }
  if (workingSet.size > 0) {
    filtered = filtered.filter((note) => workingSet.has(String(note.id)));
  }
  if (query) {
    filtered = filtered.filter((note) => noteMatchesQuery(note, query));
  }
  const slice = filtered.slice(offset, offset + limit);
  return {
    items: buildCitationItems(slice),
    count: filtered.length,
    offset,
    limit,
    hasMore: offset + slice.length < filtered.length,
  };
}

export async function installMockApi(page, {
  state = createMockWorkspaceState(),
  onChatRequest = null,
} = {}) {
  const chatRequests = [];

  await page.addInitScript(() => {
    window.localStorage.setItem("stash.session.token", "e2e-session-token");
    window.localStorage.setItem("stash.workspace.id", "ws_e2e_1");
    window.localStorage.removeItem("stash.session.refreshToken");
    window.localStorage.removeItem("pm.session.token");
    window.localStorage.removeItem("pm.session.refreshToken");
    window.localStorage.removeItem("pm.workspace.id");

    // Prevent network/EventSource flakiness in tests.
    class MockEventSource {
      constructor(url) {
        this.url = url;
        this.onopen = null;
        this.onerror = null;
        this.onmessage = null;
      }
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }
    window.EventSource = MockEventSource;
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/api/auth/session") {
      await encodeJson(route, 200, { actor: state.actor });
      return;
    }

    if (method === "GET" && pathname === "/api/notes") {
      await encodeJson(route, 200, listNotes(state, url));
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/notes/") && pathname.endsWith("/related")) {
      await encodeJson(route, 200, { items: [] });
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/notes/") && pathname.endsWith("/versions")) {
      const noteId = pathname.split("/")[3] || "";
      await encodeJson(route, 200, {
        items: state.versionsByNoteId[noteId] || [],
      });
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/notes/")) {
      const noteId = pathname.split("/")[3] || "";
      const note = findNote(state, noteId);
      if (!note) {
        await encodeJson(route, 404, { error: "Not found" });
        return;
      }
      await encodeJson(route, 200, { note });
      return;
    }

    if (method === "PUT" && pathname.startsWith("/api/notes/") && pathname.endsWith("/extracted")) {
      const noteId = pathname.split("/")[3] || "";
      const note = findNote(state, noteId);
      if (!note) {
        await encodeJson(route, 404, { error: "Not found" });
        return;
      }
      const payload = request.postDataJSON() || {};
      note.content = normalizeText(payload.content) || note.content;
      note.markdownContent = String(payload.markdownContent || note.markdownContent || "");
      note.rawContent = String(payload.rawContent || note.rawContent || "");
      note.revision = Number(note.revision || 1) + 1;
      note.updatedAt = new Date().toISOString();
      await encodeJson(route, 200, { note });
      return;
    }

    if (method === "PUT" && pathname.startsWith("/api/notes/")) {
      const noteId = pathname.split("/")[3] || "";
      const note = findNote(state, noteId);
      if (!note) {
        await encodeJson(route, 404, { error: "Not found" });
        return;
      }
      const payload = request.postDataJSON() || {};
      if (payload.title !== undefined) note.title = normalizeText(payload.title);
      if (payload.content !== undefined) note.content = String(payload.content || "");
      if (payload.project !== undefined) note.project = normalizeText(payload.project) || note.project;
      note.revision = Number(note.revision || 1) + 1;
      note.updatedAt = new Date().toISOString();
      await encodeJson(route, 200, { note });
      return;
    }

    if (method === "POST" && pathname === "/api/notes/batch-move") {
      const payload = request.postDataJSON() || {};
      const ids = Array.isArray(payload.ids) ? payload.ids.map((id) => String(id)) : [];
      const project = normalizeText(payload.project);
      state.notes.forEach((note) => {
        if (ids.includes(String(note.id)) && project) {
          note.project = project;
          note.updatedAt = new Date().toISOString();
        }
      });
      await encodeJson(route, 200, { ok: true });
      return;
    }

    if (method === "DELETE" && pathname.startsWith("/api/notes/")) {
      const noteId = pathname.split("/")[3] || "";
      const before = state.notes.length;
      state.notes = state.notes.filter((note) => String(note.id) !== String(noteId));
      await encodeJson(route, 200, { deleted: state.notes.length < before });
      return;
    }

    if (method === "GET" && pathname === "/api/folders") {
      await encodeJson(route, 200, { items: state.folders });
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/folders/") && pathname.endsWith("/children")) {
      const folderId = pathname.split("/")[3] || "";
      const children = state.folders.filter((folder) => String(folder.parentId || "") === String(folderId));
      await encodeJson(route, 200, { items: children });
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/folders/") && pathname.endsWith("/collaborators")) {
      await encodeJson(route, 200, { items: [] });
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/folders/")) {
      const target = pathname.split("/")[3] || "";
      const folder = getFolderByIdOrName(state, target);
      if (!folder) {
        await encodeJson(route, 404, { error: "Folder not found" });
        return;
      }
      await encodeJson(route, 200, { folder });
      return;
    }

    if (method === "GET" && pathname === "/api/activity") {
      await encodeJson(route, 200, { items: [] });
      return;
    }

    if (method === "GET" && pathname === "/api/workspaces/members") {
      await encodeJson(route, 200, { items: [] });
      return;
    }

    if (method === "POST" && pathname === "/api/chat") {
      const body = request.postDataJSON() || {};
      const callIndex = chatRequests.push(body) - 1;
      const custom = typeof onChatRequest === "function"
        ? await onChatRequest({ body, callIndex, state, chatRequests })
        : null;

      const response = custom || {
        delayMs: 0,
        status: 200,
        events: [
          { type: "citations", data: { citations: [] } },
          { type: "token", data: { token: "E2E default response." } },
          { type: "done", data: { done: true } },
        ],
      };
      const statusCode = Number(response.status) || 200;
      const errorPayload = response.payload && typeof response.payload === "object"
        ? response.payload
        : { error: String(response.error || "Request failed") };

      if (Number(response.delayMs) > 0) {
        await wait(Number(response.delayMs));
      }

      const acceptHeader = String(request.headers().accept || "");
      const wantsStream = acceptHeader.includes("text/event-stream");
      if (statusCode >= 400) {
        await encodeJson(route, statusCode, errorPayload);
        return;
      }
      if (wantsStream) {
        await route.fulfill({
          status: statusCode,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
          body: buildSseBody(response.events || []),
        });
      } else {
        await encodeJson(route, statusCode, {
          answer: String(response.answer || "E2E default response."),
          citations: [],
        });
      }
      return;
    }

    if (method === "GET" && pathname === "/api/events") {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: "event: connected\ndata: {}\n\n",
      });
      return;
    }

    await encodeJson(route, 404, { error: `Unhandled mock endpoint: ${method} ${pathname}` });
  });

  return {
    state,
    chatRequests,
  };
}
