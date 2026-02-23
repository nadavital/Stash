export function createSseHandler({
  enrichmentQueue,
  subscribeActivity,
  collaborationRepo,
  isWorkspaceManager,
}) {
  function mapActivityToWorkspaceAction(event = null) {
    if (!event || typeof event !== "object") return null;
    const eventType = String(event.eventType || "").trim().toLowerCase();
    const entityType = String(event.entityType || "").trim().toLowerCase();
    const entityId = String(event.entityId || event.noteId || event.folderId || "").trim();
    if (!eventType || !entityType || !entityId) return null;

    let mutationType = "";
    if (eventType === "note.created") mutationType = "note.create";
    else if (eventType === "note.updated") mutationType = "note.update";
    else if (eventType === "note.deleted") mutationType = "note.delete";
    else if (eventType === "note.comment_added") mutationType = "note.comment.add";
    else if (eventType === "note.version_restored") mutationType = "note.version.restore";
    else if (eventType === "note.enrichment_retry") mutationType = "note.enrichment.retry";
    else if (eventType === "folder.created") mutationType = "folder.create";
    else if (eventType === "folder.updated") mutationType = "folder.update";
    else if (eventType === "folder.deleted") mutationType = "folder.delete";
    else if (eventType === "folder.shared") mutationType = "folder.collaborator.set";
    else if (eventType === "folder.unshared") mutationType = "folder.collaborator.remove";
    if (!mutationType) return null;

    const details = event.details && typeof event.details === "object" ? event.details : {};
    const patch = {};
    if (typeof details.title === "string" && details.title.trim()) patch.title = String(details.title).trim();
    if (typeof details.project === "string" && details.project.trim()) patch.project = String(details.project).trim();
    if (typeof details.folderName === "string" && details.folderName.trim()) patch.name = String(details.folderName).trim();

    return {
      actionId: `activity:${String(event.id || "").trim() || Date.now()}`,
      phase: "commit",
      entityType,
      entityId,
      mutationType,
      patch: Object.keys(patch).length > 0 ? patch : null,
      baseRevision: null,
      nextRevision: null,
      actor: {
        userId: String(event.actorUserId || "").trim(),
        workspaceId: String(event.workspaceId || "").trim(),
        role: "",
      },
      name: eventType,
      result: null,
      error: "",
      source: "activity",
      occurredAt: String(event.createdAt || "").trim(),
    };
  }

  function queueEventNoteOwnerId(event = null) {
    const note = event?.result;
    if (!note || typeof note !== "object") return "";
    const explicitOwner = String(note.ownerUserId || "").trim();
    if (explicitOwner) return explicitOwner;
    const creator = String(note.createdByUserId || "").trim();
    if (creator) return creator;
    return String(note?.metadata?.actorUserId || "").trim();
  }

  function canActorReceiveQueueEvent(actor = null, event = null) {
    if (!actor || !event) return false;
    if (isWorkspaceManager(actor)) return true;
    const actorUserId = String(actor.userId || "").trim();
    if (!actorUserId) return false;

    const visibilityUserId = String(event.visibilityUserId || "").trim();
    if (visibilityUserId) {
      return visibilityUserId === actorUserId;
    }

    const ownerUserId = queueEventNoteOwnerId(event);
    if (ownerUserId) {
      return ownerUserId === actorUserId;
    }

    return false;
  }

  function sanitizeQueueEventForStream(event = null) {
    if (!event || typeof event !== "object") return null;
    const payload = { ...event };
    delete payload.visibilityUserId;
    return payload;
  }

  async function canActorReceiveActivityEvent(actor = null, event = null) {
    if (!actor || !event) return false;
    if (String(event.workspaceId || "").trim() !== String(actor.workspaceId || "").trim()) {
      return false;
    }
    if (isWorkspaceManager(actor)) return true;
    const actorUserId = String(actor.userId || "").trim();
    if (!actorUserId) return false;

    const visibilityUserId = String(event.visibilityUserId || "").trim();
    if (visibilityUserId) {
      return visibilityUserId === actorUserId;
    }

    const folderId = String(event.folderId || "").trim();
    if (folderId) {
      const role = await collaborationRepo.getFolderMemberRole({
        workspaceId: actor.workspaceId,
        folderId,
        userId: actorUserId,
      });
      return Boolean(role);
    }
    return true;
  }

  return function handleSSE(req, res, actor) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    const keepalive = setInterval(() => {
      res.write(`: keepalive ${new Date().toISOString()}\n\n`);
    }, 30000);

    const unsubscribe = enrichmentQueue.subscribe((event) => {
      const eventWorkspaceId =
        event?.workspaceId || event?.result?.workspaceId || event?.result?.note?.workspaceId || null;
      if (!eventWorkspaceId || eventWorkspaceId !== actor.workspaceId) {
        return;
      }
      if (!canActorReceiveQueueEvent(actor, event)) {
        return;
      }
      const payload = sanitizeQueueEventForStream(event);
      if (!payload) {
        return;
      }
      const eventType = payload.type || "message";
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const unsubscribeActivity = subscribeActivity((event) => {
      Promise.resolve(canActorReceiveActivityEvent(actor, event))
        .then((allowed) => {
          if (!allowed) return;
          if (!event || typeof event !== "object") return;
          const payload = { ...event };
          delete payload.visibilityUserId;
          res.write(`event: activity\ndata: ${JSON.stringify(payload)}\n\n`);
          const workspaceAction = mapActivityToWorkspaceAction(payload);
          if (workspaceAction) {
            res.write(`event: workspace_action_commit\ndata: ${JSON.stringify(workspaceAction)}\n\n`);
          }
        })
        .catch(() => {});
    });

    req.on("close", () => {
      clearInterval(keepalive);
      unsubscribe();
      unsubscribeActivity();
    });
  };
}
