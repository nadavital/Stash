export async function handleBatchNoteRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    resolveErrorStatus,
    readJsonBody,
    validateBatchPayload,
    validateBatchCreatePayload,
    batchCreateMemories,
    batchDeleteMemories,
    batchMoveMemories,
  } = context;

  if (req.method === "POST" && url.pathname === "/api/notes/batch-create") {
    const body = await readJsonBody(req);
    const bv = validateBatchCreatePayload(body);
    if (!bv.valid) {
      sendJson(res, 400, { error: bv.errors.join("; ") });
      return true;
    }
    try {
      const result = await batchCreateMemories({
        items: body.items,
        project: body.project || "",
        actor,
        metadata: {
          createdFrom: "web-app-batch",
          actorUserId: actor.userId,
        },
      });
      sendJson(res, result.failed > 0 ? 207 : 201, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Batch create failed" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/notes/batch-delete") {
    const body = await readJsonBody(req);
    const bv = validateBatchPayload(body);
    if (!bv.valid) {
      sendJson(res, 400, { error: bv.errors.join("; ") });
      return true;
    }
    try {
      const result = await batchDeleteMemories({ ids: body.ids, actor });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Batch delete failed" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/notes/batch-move") {
    const body = await readJsonBody(req);
    const bv = validateBatchPayload(body);
    if (!bv.valid) {
      sendJson(res, 400, { error: bv.errors.join("; ") });
      return true;
    }
    try {
      const moved = await batchMoveMemories({
        ids: body.ids,
        project: body.project || "",
        actor,
      });
      sendJson(res, 200, moved);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Batch move failed" });
    }
    return true;
  }

  return false;
}
