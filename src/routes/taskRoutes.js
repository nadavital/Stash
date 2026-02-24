function parseTaskIdFromPath(pathname = "", { suffix = "" } = {}) {
  const basePrefix = "/api/tasks/";
  if (!String(pathname || "").startsWith(basePrefix)) {
    return "";
  }

  const raw = suffix
    ? String(pathname).slice(basePrefix.length, -String(suffix).length)
    : String(pathname).slice(basePrefix.length);
  return decodeURIComponent(raw || "").trim();
}

function parseFilterStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "all") return null;
  return normalized;
}

function parseLimit(value, fallback = 50, { min = 1, max = 200 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseErrorStatus(err, fallback = 400) {
  const msg = err instanceof Error ? String(err.message || "") : "";
  if (/not found/i.test(msg)) return 404;
  if (/missing\s+task\s+id/i.test(msg)) return 400;
  if (/must be approved/i.test(msg)) return 409;
  return fallback;
}

function canApproveAutomations(actor, isWorkspaceManager) {
  if (typeof isWorkspaceManager === "function") {
    return isWorkspaceManager(actor);
  }
  const role = String(actor?.role || "").trim().toLowerCase();
  return role === "owner" || role === "admin";
}

export async function handleTaskRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    readJsonBody,
    taskRepo,
    runTaskNow,
    isWorkspaceManager,
  } = context;

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    try {
      const status = parseFilterStatus(url.searchParams.get("status") || "");
      const limit = parseLimit(url.searchParams.get("limit"), 80);
      const tasks = await taskRepo.listTasks(status, actor.workspaceId);
      const items = Array.isArray(tasks) ? tasks.slice(0, limit) : [];
      sendJson(res, 200, { items, count: items.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to list tasks";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJsonBody(req);
    try {
      const requireApproval = body.requireApproval === true;
      const activate = body.activate === true;
      const approvalStatus = requireApproval ? "pending_approval" : "approved";
      const task = await taskRepo.createTask({
        title: body.title,
        name: body.name,
        prompt: body.prompt,
        project: body.project,
        scopeType: body.scopeType,
        scopeFolder: body.scopeFolder,
        scheduleType: body.scheduleType,
        intervalMinutes: body.intervalMinutes,
        timezone: body.timezone,
        maxActionsPerRun: body.maxActionsPerRun,
        maxConsecutiveFailures: body.maxConsecutiveFailures,
        dryRun: body.dryRun === true,
        status: activate ? "active" : "paused",
        approvalStatus,
        workspaceId: actor.workspaceId,
        createdByUserId: actor.userId,
        approvedByUserId: approvalStatus === "approved" ? actor.userId : "",
      });
      sendJson(res, 201, { task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create failed";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/tasks\/[^/]+\/approve$/)) {
    const id = parseTaskIdFromPath(url.pathname, { suffix: "/approve" });
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    if (!canApproveAutomations(actor, isWorkspaceManager)) {
      sendJson(res, 403, { error: "Only workspace admins can approve automations" });
      return true;
    }
    const body = await readJsonBody(req);
    try {
      const task = await taskRepo.approveTask(
        id,
        {
          approvedByUserId: actor.userId,
          activate: body.activate !== false,
        },
        actor.workspaceId,
      );
      sendJson(res, 200, { task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Approve failed";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/tasks\/[^/]+\/pause$/)) {
    const id = parseTaskIdFromPath(url.pathname, { suffix: "/pause" });
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    try {
      const task = await taskRepo.pauseTask(id, actor.workspaceId);
      sendJson(res, 200, { task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pause failed";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/tasks\/[^/]+\/resume$/)) {
    const id = parseTaskIdFromPath(url.pathname, { suffix: "/resume" });
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    try {
      const task = await taskRepo.resumeTask(id, actor.workspaceId);
      sendJson(res, 200, { task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Resume failed";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/tasks\/[^/]+\/run-now$/)) {
    const id = parseTaskIdFromPath(url.pathname, { suffix: "/run-now" });
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    if (typeof runTaskNow !== "function") {
      sendJson(res, 501, { error: "Task execution is not available" });
      return true;
    }

    try {
      const run = await runTaskNow({
        taskId: id,
        workspaceId: actor.workspaceId,
        triggeredByUserId: actor.userId,
      });
      sendJson(res, 200, { run });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Run failed";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/tasks\/[^/]+\/runs$/)) {
    const id = parseTaskIdFromPath(url.pathname, { suffix: "/runs" });
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }

    try {
      const limit = parseLimit(url.searchParams.get("limit"), 30, { min: 1, max: 100 });
      const items = await taskRepo.listTaskRuns(id, actor.workspaceId, { limit });
      sendJson(res, 200, { items, count: items.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to list runs";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
    const id = parseTaskIdFromPath(url.pathname);
    if (!id || id.includes("/")) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    try {
      const task = await taskRepo.getTask(id, actor.workspaceId);
      sendJson(res, 200, { task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lookup failed";
      sendJson(res, parseErrorStatus(err, 404), { error: msg });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/tasks/")) {
    const id = parseTaskIdFromPath(url.pathname);
    if (!id || id.includes("/")) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    const body = await readJsonBody(req);
    try {
      const task = await taskRepo.updateTask(
        id,
        {
          title: body.title,
          name: body.name,
          prompt: body.prompt,
          project: body.project,
          scopeType: body.scopeType,
          scopeFolder: body.scopeFolder,
          scheduleType: body.scheduleType,
          intervalMinutes: body.intervalMinutes,
          timezone: body.timezone,
          maxActionsPerRun: body.maxActionsPerRun,
          maxConsecutiveFailures: body.maxConsecutiveFailures,
          dryRun: body.dryRun,
          status: body.status,
          enabled: body.enabled,
        },
        actor.workspaceId,
      );
      sendJson(res, 200, { task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/tasks/")) {
    const id = parseTaskIdFromPath(url.pathname);
    if (!id || id.includes("/")) {
      sendJson(res, 400, { error: "Missing task id" });
      return true;
    }
    try {
      const result = await taskRepo.deleteTask(id, actor.workspaceId);
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      sendJson(res, parseErrorStatus(err, 400), { error: msg });
    }
    return true;
  }

  return false;
}
