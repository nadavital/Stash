function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || Math.floor(parsed) !== parsed) {
    return null;
  }
  return parsed;
}

function parseIfMatchRevision(req) {
  const rawHeader = req?.headers?.["if-match"];
  const normalizedRaw = Array.isArray(rawHeader) ? String(rawHeader[0] || "").trim() : String(rawHeader || "").trim();
  if (!normalizedRaw) {
    return { value: null, error: "" };
  }
  if (normalizedRaw === "*") {
    return { value: null, error: 'If-Match "*" is not supported; send a concrete revision.' };
  }

  const firstTag = normalizedRaw.split(",")[0]?.trim() || "";
  if (!firstTag) {
    return { value: null, error: "Invalid If-Match header." };
  }
  const weakStripped = firstTag.replace(/^W\//i, "").trim();
  const unquoted = weakStripped.startsWith("\"") && weakStripped.endsWith("\"")
    ? weakStripped.slice(1, -1).trim()
    : weakStripped;
  const withoutPrefix = unquoted.startsWith("rev-") ? unquoted.slice(4) : unquoted;
  const parsed = parsePositiveInteger(withoutPrefix);
  if (!parsed) {
    return { value: null, error: "If-Match must be a positive integer revision (example: \"3\")." };
  }
  return { value: parsed, error: "" };
}

function resolveBaseRevision(req, body = {}) {
  const headerRevision = parseIfMatchRevision(req);
  if (headerRevision.error) {
    return { value: undefined, error: headerRevision.error };
  }

  let bodyRevision = null;
  if (body?.baseRevision !== undefined) {
    bodyRevision = parsePositiveInteger(body.baseRevision);
    if (!bodyRevision) {
      return { value: undefined, error: "baseRevision must be a positive integer" };
    }
  }

  if (headerRevision.value !== null && bodyRevision !== null && headerRevision.value !== bodyRevision) {
    return { value: undefined, error: "If-Match revision does not match baseRevision body value" };
  }

  if (headerRevision.value !== null) {
    return { value: headerRevision.value, error: "" };
  }
  if (bodyRevision !== null) {
    return { value: bodyRevision, error: "" };
  }
  return { value: undefined, error: "" };
}

function isRevisionConflictError(error) {
  return String(error?.code || "").trim().toUpperCase() === "REVISION_CONFLICT" || Boolean(error?.conflict);
}

function buildNoteEtag(revision) {
  const parsed = parsePositiveInteger(revision);
  return parsed ? `"${parsed}"` : "";
}

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
    const resolvedBaseRevision = resolveBaseRevision(req, body);
    if (resolvedBaseRevision.error) {
      sendJson(res, 400, { error: resolvedBaseRevision.error });
      return true;
    }
    try {
      const note = await updateMemoryExtractedContent({
        id,
        title: body.title,
        content: body.content,
        rawContent: body.rawContent,
        markdownContent: body.markdownContent,
        baseRevision: resolvedBaseRevision.value,
        requeueEnrichment: body.requeueEnrichment === true,
        actor,
      });
      const etag = buildNoteEtag(note?.revision);
      sendJson(res, 200, { note }, etag ? { ETag: etag } : null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update extracted content failed";
      const statusCode = isRevisionConflictError(err)
        ? 412
        : resolveErrorStatus(err, msg.includes("not found") ? 404 : 400);
      const etag = buildNoteEtag(err?.conflict?.currentRevision);
      sendJson(
        res,
        statusCode,
        {
          error: msg,
          ...(err?.conflict ? { conflict: err.conflict } : {}),
        },
        etag ? { ETag: etag } : null
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
    const resolvedBaseRevision = resolveBaseRevision(req, body);
    if (resolvedBaseRevision.error) {
      sendJson(res, 400, { error: resolvedBaseRevision.error });
      return true;
    }
    try {
      const note = await updateMemory({
        id,
        title: body.title,
        content: body.content,
        summary: body.summary,
        tags: body.tags,
        project: body.project,
        baseRevision: resolvedBaseRevision.value,
        actor,
      });
      const etag = buildNoteEtag(note?.revision);
      sendJson(res, 200, { note }, etag ? { ETag: etag } : null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      const statusCode = isRevisionConflictError(err)
        ? 412
        : resolveErrorStatus(err, msg.includes("not found") ? 404 : 400);
      const etag = buildNoteEtag(err?.conflict?.currentRevision);
      sendJson(
        res,
        statusCode,
        {
          error: msg,
          ...(err?.conflict ? { conflict: err.conflict } : {}),
        },
        etag ? { ETag: etag } : null
      );
    }
    return true;
  }

  return false;
}
