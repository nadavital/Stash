export function createAuthEventRecorder({ authRepo, logger }) {
  return function recordAuthEvent(event = {}) {
    const outcome = String(event.outcome || "unknown").toLowerCase();
    const logPayload = {
      eventType: event.eventType || "auth.unknown",
      outcome,
      provider: event.provider || "",
      userId: event.userId || "",
      workspaceId: event.workspaceId || "",
      email: event.email || "",
      ip: event.ip || "",
      reason: event.reason || "",
      metadata: event.metadata || null,
    };

    Promise.resolve(authRepo.recordAuthEvent(logPayload)).catch((error) => {
      logger.warn("auth_event_write_failed", {
        eventType: logPayload.eventType,
        message: error instanceof Error ? error.message : String(error),
      });
    });

    if (outcome === "failure") {
      logger.warn("auth_event", logPayload);
    } else {
      logger.info("auth_event", logPayload);
    }
  };
}
