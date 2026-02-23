function buildNoteEtag(revision) {
  const parsed = Number(revision);
  if (!Number.isFinite(parsed) || parsed < 1) return "";
  return `"${Math.floor(parsed)}"`;
}

export async function handleNoteRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    resolveErrorStatus,
    readJsonBody,
    validateNotePayload,
    parseWorkingSetIds,
    listWorkspaceActivity,
    findRelatedMemories,
    retryMemoryEnrichment,
    getMemoryById,
    deleteMemory,
    deleteProjectMemories,
    searchMemories,
    listRecentMemories,
    createMemory,
  } = context;

  if (req.method === "GET" && url.pathname === "/api/activity") {
    try {
      const result = await listWorkspaceActivity({
        actor,
        folderId: url.searchParams.get("folderId") || "",
        noteId: url.searchParams.get("noteId") || "",
        limit: Number(url.searchParams.get("limit") || "60"),
      });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to fetch activity" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/notes\/[^/]+\/related$/)) {
    const suffix = "/related";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }
    const limit = Number(url.searchParams.get("limit") || "5");
    try {
      const items = await findRelatedMemories({ id, limit, actor });
      sendJson(res, 200, { items, count: items.length });
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Related lookup failed" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/notes\/[^/]+\/retry-enrichment$/)) {
    const suffix = "/retry-enrichment";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }
    try {
      const result = await retryMemoryEnrichment({ id, actor });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Retry failed" });
    }
    return true;
  }

  if (
    req.method === "GET"
    && url.pathname.match(/^\/api\/notes\/[^/]+$/)
    && !url.pathname.endsWith("/batch-delete")
    && !url.pathname.endsWith("/batch-move")
  ) {
    const encodedId = url.pathname.slice("/api/notes/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }
    try {
      const note = await getMemoryById({ id, actor });
      const etag = buildNoteEtag(note?.revision);
      sendJson(res, 200, { note }, etag ? { ETag: etag } : null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Fetch failed";
      const statusCode = resolveErrorStatus(error, msg.includes("not found") ? 404 : 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Fetch failed" });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/notes/")) {
    const encodedId = url.pathname.slice("/api/notes/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }

    try {
      const result = await deleteMemory({ id, actor });
      if (!result.deleted) {
        sendJson(res, 404, { error: `Memory not found: ${id}` });
        return true;
      }
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Delete failed" });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/projects/")) {
    const encodedProject = url.pathname.slice("/api/projects/".length);
    const project = decodeURIComponent(encodedProject || "").trim();
    if (!project) {
      sendJson(res, 400, { error: "Missing project" });
      return true;
    }

    try {
      const result = await deleteProjectMemories({ project, actor });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Delete project failed" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/notes") {
    const query = url.searchParams.get("query") || "";
    const project = url.searchParams.get("project") || "";
    const limit = Number(url.searchParams.get("limit") || "20");
    const offset = Number(url.searchParams.get("offset") || "0");
    const scope = url.searchParams.get("scope") || "all";
    const workingSetIds = parseWorkingSetIds(url.searchParams.getAll("workingSetIds"));

    const hasScopedSearch =
      Boolean(query.trim()) ||
      Boolean(project.trim()) ||
      String(scope || "").trim().toLowerCase() !== "all" ||
      workingSetIds.length > 0;
    const results = hasScopedSearch
      ? await searchMemories({ query, project, limit, offset, actor, scope, workingSetIds })
      : (await listRecentMemories(limit, offset, actor)).map((note, index) => ({
          rank: index + 1,
          score: 1,
          note,
        }));

    sendJson(res, 200, {
      items: results,
      count: results.length,
      offset,
      limit,
      hasMore: results.length === limit,
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/recent") {
    const limit = Number(url.searchParams.get("limit") || "20");
    const offset = Number(url.searchParams.get("offset") || "0");
    const scope = url.searchParams.get("scope") || "all";
    const project = url.searchParams.get("project") || "";
    const contextNoteId = url.searchParams.get("contextNoteId") || "";
    const workingSetIds = parseWorkingSetIds(url.searchParams.getAll("workingSetIds"));
    const notes = await listRecentMemories(limit, offset, actor, {
      scope,
      project,
      contextNoteId,
      workingSetIds,
    });
    sendJson(res, 200, {
      items: notes,
      count: notes.length,
      offset,
      limit,
      hasMore: notes.length === limit,
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/notes") {
    const body = await readJsonBody(req);
    const validation = validateNotePayload(body);
    if (!validation.valid) {
      sendJson(res, 400, { error: validation.errors.join("; ") });
      return true;
    }
    const note = await createMemory({
      content: body.content,
      title: body.title,
      sourceType: body.sourceType,
      sourceUrl: body.sourceUrl,
      imageDataUrl: body.imageDataUrl,
      fileDataUrl: body.fileDataUrl,
      fileName: body.fileName,
      fileMimeType: body.fileMimeType,
      project: body.project,
      metadata: {
        createdFrom: "web-app",
        actorUserId: actor.userId,
      },
      actor,
    });
    const etag = buildNoteEtag(note?.revision);
    sendJson(res, 201, { note }, etag ? { ETag: etag } : null);
    return true;
  }

  return false;
}
