export async function handleTaskRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    readJsonBody,
    taskRepo,
  } = context;

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    const status = url.searchParams.get("status") || "open";
    const tasks = await taskRepo.listTasks(status, actor.workspaceId);
    sendJson(res, 200, { items: tasks, count: tasks.length });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJsonBody(req);
    const task = await taskRepo.createTask({
      title: body.title,
      status: body.status || "open",
      workspaceId: actor.workspaceId,
    });
    sendJson(res, 201, { task });
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/tasks/")) {
    const encodedId = url.pathname.slice("/api/tasks/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    const body = await readJsonBody(req);
    try {
      const task = await taskRepo.updateTask(
        id,
        {
          title: body.title,
          status: body.status,
        },
        actor.workspaceId
      );
      sendJson(res, 200, { task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      sendJson(res, msg.includes("not found") ? 404 : 400, { error: msg });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/tasks/")) {
    const encodedId = url.pathname.slice("/api/tasks/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    try {
      const result = await taskRepo.deleteTask(id, actor.workspaceId);
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      sendJson(res, msg.includes("not found") ? 404 : 400, { error: msg });
    }
    return true;
  }

  return false;
}
