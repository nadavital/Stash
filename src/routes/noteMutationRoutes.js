export async function handleNoteMutationRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    resolveErrorStatus,
    readJsonBody,
    validateNotePayload,
    addMemoryComment,
    listMemoryVersions,
    restoreMemoryVersion,
    updateMemoryExtractedContent,
    updateMemory,
  } = context;

  if (req.method === "POST" && url.pathname.match(/^\/api\/notes\/[^/]+\/comments$/)) {
    const suffix = "/comments";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }
    const body = await readJsonBody(req);
    const text = String(body?.text || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "Missing comment text" });
      return true;
    }
    try {
      const result = await addMemoryComment({
        id,
        text,
        actor,
      });
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add comment";
      sendJson(res, resolveErrorStatus(err, msg.includes("not found") ? 404 : 400), { error: msg });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/notes\/[^/]+\/versions$/)) {
    const suffix = "/versions";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }
    try {
      const result = await listMemoryVersions({ id, actor });
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to list versions";
      sendJson(res, resolveErrorStatus(err, msg.includes("not found") ? 404 : 400), { error: msg });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/notes\/[^/]+\/restore$/)) {
    const suffix = "/restore";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }
    const body = await readJsonBody(req);
    const versionNumber = Number(body?.versionNumber);
    if (!Number.isFinite(versionNumber) || versionNumber < 1) {
      sendJson(res, 400, { error: "Missing or invalid versionNumber" });
      return true;
    }
    try {
      const note = await restoreMemoryVersion({ id, versionNumber, actor });
      sendJson(res, 200, { note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      sendJson(res, resolveErrorStatus(err, msg.includes("not found") ? 404 : 400), { error: msg });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.match(/^\/api\/notes\/[^/]+\/extracted$/)) {
    const suffix = "/extracted";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }
    const body = await readJsonBody(req);
    const hasTitle = body.title !== undefined;
    const hasContent = body.content !== undefined;
    const hasRawContent = body.rawContent !== undefined;
    const hasMarkdownContent = body.markdownContent !== undefined;
    const hasBaseRevision = body.baseRevision !== undefined;
    if (!hasTitle && !hasContent && !hasRawContent && !hasMarkdownContent) {
      sendJson(res, 400, { error: "Nothing to update" });
      return true;
    }
    if (hasTitle && body.title !== null && typeof body.title !== "string") {
      sendJson(res, 400, { error: "title must be a string or null" });
      return true;
    }
    if (hasContent && body.content !== null && typeof body.content !== "string") {
      sendJson(res, 400, { error: "content must be a string or null" });
      return true;
    }
    if (hasRawContent && body.rawContent !== null && typeof body.rawContent !== "string") {
      sendJson(res, 400, { error: "rawContent must be a string or null" });
      return true;
    }
    if (hasMarkdownContent && body.markdownContent !== null && typeof body.markdownContent !== "string") {
      sendJson(res, 400, { error: "markdownContent must be a string or null" });
      return true;
    }
    if (hasBaseRevision) {
      const parsedBaseRevision = Number(body.baseRevision);
      if (!Number.isFinite(parsedBaseRevision) || parsedBaseRevision < 1) {
        sendJson(res, 400, { error: "baseRevision must be a positive integer" });
        return true;
      }
    }
    try {
      const note = await updateMemoryExtractedContent({
        id,
        title: body.title,
        content: body.content,
        rawContent: body.rawContent,
        markdownContent: body.markdownContent,
        baseRevision: body.baseRevision,
        requeueEnrichment: body.requeueEnrichment === true,
        actor,
      });
      sendJson(res, 200, { note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update extracted content failed";
      sendJson(
        res,
        resolveErrorStatus(err, msg.includes("not found") ? 404 : 400),
        {
          error: msg,
          ...(err?.conflict ? { conflict: err.conflict } : {}),
        }
      );
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/notes/")) {
    const encodedId = url.pathname.slice("/api/notes/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return true;
    }
    const body = await readJsonBody(req);
    const validation = validateNotePayload(body, { requireContent: false });
    if (!validation.valid) {
      sendJson(res, 400, { error: validation.errors.join("; ") });
      return true;
    }
    if (body.baseRevision !== undefined) {
      const parsedBaseRevision = Number(body.baseRevision);
      if (!Number.isFinite(parsedBaseRevision) || parsedBaseRevision < 1) {
        sendJson(res, 400, { error: "baseRevision must be a positive integer" });
        return true;
      }
    }
    try {
      const note = await updateMemory({
        id,
        title: body.title,
        content: body.content,
        summary: body.summary,
        tags: body.tags,
        project: body.project,
        baseRevision: body.baseRevision,
        actor,
      });
      sendJson(res, 200, { note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      sendJson(
        res,
        resolveErrorStatus(err, msg.includes("not found") ? 404 : 400),
        {
          error: msg,
          ...(err?.conflict ? { conflict: err.conflict } : {}),
        }
      );
    }
    return true;
  }

  return false;
}
