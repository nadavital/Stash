export async function handleMetaRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    isWorkspaceManager,
    readJsonBody,
    listProjects,
    listTags,
    noteRepo,
    getMemoryStats,
    getEnrichmentQueueStats,
    enrichmentQueue,
    exportMemories,
  } = context;

  if (req.method === "GET" && url.pathname === "/api/projects") {
    const projects = await listProjects(actor);
    sendJson(res, 200, { items: projects, count: projects.length });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/tags") {
    const tags = await listTags(actor);
    sendJson(res, 200, { items: tags, count: tags.length });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/tags/rename") {
    const body = await readJsonBody(req);
    if (!body.oldTag || !body.newTag) {
      sendJson(res, 400, { error: "Missing oldTag or newTag" });
      return true;
    }
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can rename tags globally" });
      return true;
    }
    const updated = await noteRepo.renameTag(body.oldTag, body.newTag, actor.workspaceId);
    sendJson(res, 200, { updated });
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/tags/")) {
    const encodedTag = url.pathname.slice("/api/tags/".length);
    const tag = decodeURIComponent(encodedTag || "").trim();
    if (!tag) {
      sendJson(res, 400, { error: "Missing tag" });
      return true;
    }
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can remove tags globally" });
      return true;
    }
    const updated = await noteRepo.removeTag(tag, actor.workspaceId);
    sendJson(res, 200, { updated });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    const stats = await getMemoryStats(actor);
    let queue = {
      pending: enrichmentQueue.pending ?? 0,
      running: enrichmentQueue.active ?? 0,
      failed: enrichmentQueue.stats?.failed ?? 0,
      queued: enrichmentQueue.stats?.queued ?? 0,
      retry: enrichmentQueue.stats?.retry ?? 0,
      completed: enrichmentQueue.stats?.completed ?? 0,
      delayed: enrichmentQueue.stats?.delayed ?? 0,
      total: enrichmentQueue.stats?.total ?? 0,
    };
    if (isWorkspaceManager(actor)) {
      try {
        const queueStats = await getEnrichmentQueueStats({ actor, failedLimit: 1 });
        if (queueStats?.counts) {
          queue = {
            pending: Number(queueStats.counts.pending || 0),
            running: Number(queueStats.counts.running || 0),
            failed: Number(queueStats.counts.failed || 0),
            queued: Number(queueStats.counts.queued || 0),
            retry: Number(queueStats.counts.retry || 0),
            completed: Number(queueStats.counts.completed || 0),
            delayed: Number(queueStats.counts.delayed || 0),
            total: Number(queueStats.counts.total || 0),
          };
        }
      } catch {
        // no-op: stats endpoint should remain best-effort
      }
    }
    sendJson(res, 200, { ...stats, queue });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/export") {
    const project = url.searchParams.get("project") || null;
    const format = url.searchParams.get("format") || "json";
    const data = await exportMemories({ project, format, actor });
    if (format === "markdown") {
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": "attachment; filename=notes-export.md",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    } else {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=notes-export.json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    }
    return true;
  }

  return false;
}
