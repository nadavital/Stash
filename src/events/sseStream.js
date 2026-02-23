export function createSseHandler({
  enrichmentQueue,
  subscribeActivity,
  collaborationRepo,
  isWorkspaceManager,
}) {
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
