export function sendAuthSession(res, context) {
  const { actor, requiresEmailVerification, sendJson, config } = context;
  sendJson(res, 200, {
    actor: {
      userId: actor.userId,
      userEmail: actor.userEmail,
      userName: actor.userName || "",
      workspaceId: actor.workspaceId,
      workspaceName: actor.workspaceName,
      workspaceSlug: actor.workspaceSlug || "",
      role: actor.role,
      emailVerified: Boolean(actor.emailVerified),
      provider: actor.provider || config.authProvider,
    },
    requiresEmailVerification,
  });
}

export function handleUnverifiedAccessGate(req, res, url, context) {
  const { requiresEmailVerification, sendJson } = context;
  if (!requiresEmailVerification) {
    return false;
  }
  const allowWhileUnverified =
    (req.method === "POST" && url.pathname === "/api/auth/email-verification/send") ||
    (req.method === "POST" && url.pathname === "/api/auth/signout-all") ||
    (req.method === "DELETE" && url.pathname === "/api/auth/account");
  if (allowWhileUnverified) {
    return false;
  }
  sendJson(res, 403, {
    error: "Email verification required before accessing app data",
    requiresEmailVerification: true,
  });
  return true;
}

export async function handleEnrichmentQueueRoute(res, url, context) {
  const { actor, sendJson, resolveErrorStatus, isWorkspaceManager, getEnrichmentQueueStats } = context;
  try {
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can view queue diagnostics" });
      return;
    }
    const failedLimit = Number(url.searchParams.get("failedLimit") || "20");
    const stats = await getEnrichmentQueueStats({ actor, failedLimit });
    sendJson(res, 200, stats);
  } catch (error) {
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to fetch queue stats" });
  }
}

export async function handleEmailVerificationSendRoute(res, context) {
  const {
    actor,
    requestIp,
    sendJson,
    resolveErrorStatus,
    config,
    firebaseSendEmailVerification,
    recordAuthEvent,
  } = context;
  if (config.authProvider === "neon") {
    sendJson(res, 400, {
      error: "Email verification send endpoint is not available in Neon auth mode. Use Neon Auth email verification flow.",
    });
    return;
  }
  if (config.authProvider !== "firebase") {
    sendJson(res, 400, { error: "Email verification endpoint is only available with Firebase auth provider" });
    return;
  }
  try {
    await firebaseSendEmailVerification({ idToken: actor.token });
    recordAuthEvent({
      eventType: "auth.email_verification.send",
      outcome: "success",
      provider: "firebase",
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      email: actor.userEmail,
      ip: requestIp,
    });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    recordAuthEvent({
      eventType: "auth.email_verification.send",
      outcome: "failure",
      provider: "firebase",
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      email: actor.userEmail,
      ip: requestIp,
      reason: error instanceof Error ? error.message : "Email verification send failed",
    });
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Email verification send failed" });
  }
}

export async function handlePasswordChangeRoute(req, res, context) {
  const {
    actor,
    requestIp,
    sendJson,
    readJsonBody,
    resolveErrorStatus,
    config,
    authRepo,
    firebaseChangePassword,
    verifyFirebaseIdToken,
    buildFirebaseSessionPayload,
    registerAuthFailure,
    recordAuthEvent,
  } = context;
  const body = await readJsonBody(req);
  try {
    if (config.authProvider === "firebase") {
      const updated = await firebaseChangePassword({
        idToken: actor.token,
        newPassword: body.newPassword,
      });
      const claims = await verifyFirebaseIdToken(updated.idToken);
      const updatedActor = await authRepo.resolveFirebaseActorFromClaims(claims, {
        preferredWorkspaceId: actor.workspaceId,
      });
      const session = buildFirebaseSessionPayload(updated, updatedActor);
      session.user.emailVerified = Boolean(updatedActor.emailVerified);
      sendJson(res, 200, { ok: true, session });
    } else if (config.authProvider === "neon") {
      sendJson(res, 400, {
        error: "Password change via API is not available in Neon auth mode. Use Neon Auth password update flow.",
      });
      return;
    } else {
      await authRepo.changeLocalPassword({
        userId: actor.userId,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      });
      sendJson(res, 200, { ok: true });
    }
    recordAuthEvent({
      eventType: "auth.password_change",
      outcome: "success",
      provider: config.authProvider,
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      email: actor.userEmail,
      ip: requestIp,
    });
  } catch (error) {
    const failure = registerAuthFailure(requestIp);
    recordAuthEvent({
      eventType: "auth.password_change",
      outcome: "failure",
      provider: config.authProvider,
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      email: actor.userEmail,
      ip: requestIp,
      reason: error instanceof Error ? error.message : "Password change failed",
      metadata: failure,
    });
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Password change failed" });
  }
}

export async function handleSignoutAllRoute(res, context) {
  const {
    actor,
    requestIp,
    sendJson,
    resolveErrorStatus,
    config,
    revokeFirebaseUserSessions,
    authRepo,
    recordAuthEvent,
  } = context;
  try {
    if (config.authProvider === "firebase") {
      await revokeFirebaseUserSessions(actor.authProviderSubject);
    }
    const localRevoked = await authRepo.revokeAllSessionsForUser(actor.userId);
    recordAuthEvent({
      eventType: "auth.signout_all",
      outcome: "success",
      provider: config.authProvider,
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      email: actor.userEmail,
      ip: requestIp,
      metadata: { localRevoked: localRevoked.revoked || 0 },
    });
    sendJson(res, 200, { ok: true, revokedLocalSessions: localRevoked.revoked || 0 });
  } catch (error) {
    recordAuthEvent({
      eventType: "auth.signout_all",
      outcome: "failure",
      provider: config.authProvider,
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      email: actor.userEmail,
      ip: requestIp,
      reason: error instanceof Error ? error.message : "Sign out all failed",
    });
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Sign out all failed" });
  }
}

export async function handleDeleteAccountRoute(req, res, context) {
  const {
    actor,
    requestIp,
    sendJson,
    readJsonBody,
    resolveErrorStatus,
    config,
    authRepo,
    deleteFirebaseUser,
    recordAuthEvent,
  } = context;
  const body = await readJsonBody(req);
  try {
    if (config.authProvider === "local") {
      await authRepo.authenticateUser({
        email: actor.userEmail,
        password: body.password,
      });
    }
    if (config.authProvider === "firebase") {
      await deleteFirebaseUser(actor.authProviderSubject, { idToken: actor.token });
    }
    await authRepo.deleteUserAccount(actor.userId);
    recordAuthEvent({
      eventType: "auth.account_delete",
      outcome: "success",
      provider: config.authProvider,
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      email: actor.userEmail,
      ip: requestIp,
    });
    sendJson(res, 200, { ok: true, deleted: true });
  } catch (error) {
    recordAuthEvent({
      eventType: "auth.account_delete",
      outcome: "failure",
      provider: config.authProvider,
      userId: actor.userId,
      workspaceId: actor.workspaceId,
      email: actor.userEmail,
      ip: requestIp,
      reason: error instanceof Error ? error.message : "Account delete failed",
    });
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Account delete failed" });
  }
}
