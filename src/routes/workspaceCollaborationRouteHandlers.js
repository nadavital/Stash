export async function handleWorkspacesRoute(res, context) {
  const { actor, sendJson, authRepo } = context;
  const items = await authRepo.listWorkspacesForUser(actor.userId);
  sendJson(res, 200, { items, count: items.length });
}

export async function handleWorkspaceMembersRoute(res, url, context) {
  const { actor, sendJson, authRepo } = context;
  const limit = Number(url.searchParams.get("limit") || "200");
  const items = await authRepo.listWorkspaceMembers(actor.workspaceId, { limit });
  sendJson(res, 200, { items, count: items.length });
}

export async function handleIncomingInvitesRoute(res, url, context) {
  const { actor, sendJson, authRepo } = context;
  const items = await authRepo.listIncomingWorkspaceInvites(actor.userEmail, Number(url.searchParams.get("limit") || "50"));
  sendJson(res, 200, { items, count: items.length });
}

export async function handleWorkspaceInvitesListRoute(res, url, context) {
  const { actor, sendJson, isWorkspaceManager, authRepo } = context;
  if (!isWorkspaceManager(actor)) {
    sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can list invites" });
    return;
  }
  const status = url.searchParams.get("status") || "";
  const limit = Number(url.searchParams.get("limit") || "100");
  const items = await authRepo.listWorkspaceInvites(actor.workspaceId, { status, limit });
  sendJson(res, 200, { items, count: items.length });
}

export async function handleWorkspaceInvitesCreateRoute(req, res, context) {
  const { actor, sendJson, readJsonBody, resolveErrorStatus, isWorkspaceManager, authRepo } = context;
  if (!isWorkspaceManager(actor)) {
    sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can create invites" });
    return;
  }
  const body = await readJsonBody(req);
  try {
    const invite = await authRepo.createWorkspaceInvite({
      workspaceId: actor.workspaceId,
      invitedByUserId: actor.userId,
      email: body.email,
      role: body.role || "member",
      expiresInHours: Number(body.expiresInHours || "72"),
    });
    sendJson(res, 201, { invite });
  } catch (error) {
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Invite create failed" });
  }
}

export async function handleWorkspaceInvitesAcceptRoute(res, url, context) {
  const { actor, sendJson, resolveErrorStatus, authRepo } = context;
  const token = decodeURIComponent(
    url.pathname.slice("/api/workspaces/invites/".length, url.pathname.lastIndexOf("/accept"))
  ).trim();
  if (!token) {
    sendJson(res, 400, { error: "Missing invite token" });
    return;
  }
  try {
    const invite = await authRepo.acceptWorkspaceInvite({
      token,
      userId: actor.userId,
      userEmail: actor.userEmail,
    });
    sendJson(res, 200, { invite });
  } catch (error) {
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Invite accept failed" });
  }
}

export async function handleWorkspaceInvitesRevokeRoute(res, url, context) {
  const { actor, sendJson, resolveErrorStatus, isWorkspaceManager, authRepo } = context;
  if (!isWorkspaceManager(actor)) {
    sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can revoke invites" });
    return;
  }
  const inviteId = decodeURIComponent(url.pathname.slice("/api/workspaces/invites/".length)).trim();
  if (!inviteId) {
    sendJson(res, 400, { error: "Missing invite id" });
    return;
  }
  try {
    const invite = await authRepo.revokeWorkspaceInvite({ id: inviteId, workspaceId: actor.workspaceId });
    sendJson(res, 200, { invite });
  } catch (error) {
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Invite revoke failed" });
  }
}

export async function handleAuthAuditRoute(res, url, context) {
  const { actor, sendJson, isWorkspaceManager, authRepo } = context;
  if (!isWorkspaceManager(actor)) {
    sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can view auth audit logs" });
    return;
  }
  const limit = Number(url.searchParams.get("limit") || "100");
  const items = await authRepo.listAuthEventsForWorkspace(actor.workspaceId, limit);
  sendJson(res, 200, { items, count: items.length });
}
