export async function handleAuthLogin(req, res, context) {
  const {
    requestIp,
    requestOrigin,
    sendJson,
    readJsonBody,
    resolveErrorStatus,
    config,
    logger,
    registerAuthFailure,
    clearAuthFailures,
    recordAuthEvent,
    neonSignInWithEmailPassword,
    resolveNeonActorFromToken,
    buildNeonSessionPayload,
    firebaseSignInWithEmailPassword,
    verifyFirebaseIdToken,
    authRepo,
    buildFirebaseSessionPayload,
    firebaseSendEmailVerification,
  } = context;

  const body = await readJsonBody(req);
  if (body.workspaceId || body.workspaceName) {
    sendJson(res, 400, { error: "Workspace override is not allowed in auth endpoints" });
    return;
  }
  try {
    let session;
    if (config.authProvider === "neon") {
      const neonResult = await neonSignInWithEmailPassword({
        email: body.email,
        password: body.password,
        origin: requestOrigin,
      });
      const actor = await resolveNeonActorFromToken(neonResult.token);
      session = buildNeonSessionPayload(neonResult, actor);
      session.user.emailVerified = Boolean(actor.emailVerified);
      if (config.authRequireEmailVerification && !actor.emailVerified) {
        session.requiresEmailVerification = true;
      }
    } else if (config.authProvider === "firebase") {
      const firebaseResult = await firebaseSignInWithEmailPassword({
        email: body.email,
        password: body.password,
      });
      const claims = await verifyFirebaseIdToken(firebaseResult.idToken);
      const actor = await authRepo.resolveFirebaseActorFromClaims(claims);
      session = buildFirebaseSessionPayload(firebaseResult, actor);
      session.user.emailVerified = Boolean(actor.emailVerified);
      if (config.authRequireEmailVerification && !actor.emailVerified) {
        try {
          await firebaseSendEmailVerification({ idToken: firebaseResult.idToken });
        } catch {
          // no-op
        }
        session.requiresEmailVerification = true;
      }
    } else {
      session = await authRepo.loginAndIssueSession({
        email: body.email,
        password: body.password,
      });
    }
    clearAuthFailures(requestIp);
    recordAuthEvent({
      eventType: "auth.login",
      outcome: "success",
      provider: config.authProvider,
      userId: session.user?.id || "",
      workspaceId: session.workspace?.id || "",
      email: session.user?.email || body.email || "",
      ip: requestIp,
    });
    sendJson(res, 200, { session });
  } catch (error) {
    const failure = registerAuthFailure(requestIp);
    recordAuthEvent({
      eventType: "auth.login",
      outcome: "failure",
      provider: config.authProvider,
      email: body.email || "",
      ip: requestIp,
      reason: error instanceof Error ? error.message : "Login failed",
      metadata: failure,
    });
    if (failure.requiresCaptcha) {
      logger.warn("auth_suspicious_activity", {
        ip: requestIp,
        eventType: "auth.login",
        failures: failure.count,
      });
    }
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Login failed" });
  }
}

export async function handleAuthSignup(req, res, context) {
  const {
    requestIp,
    requestOrigin,
    sendJson,
    readJsonBody,
    resolveErrorStatus,
    config,
    registerAuthFailure,
    clearAuthFailures,
    recordAuthEvent,
    neonSignUpWithEmailPassword,
    resolveNeonActorFromToken,
    buildNeonSessionPayload,
    firebaseSignUpWithEmailPassword,
    verifyFirebaseIdToken,
    authRepo,
    buildFirebaseSessionPayload,
    firebaseSendEmailVerification,
  } = context;

  const body = await readJsonBody(req);
  if (body.workspaceId || body.workspaceName) {
    sendJson(res, 400, { error: "Workspace override is not allowed in auth endpoints" });
    return;
  }
  try {
    let session;
    if (config.authProvider === "neon") {
      const neonResult = await neonSignUpWithEmailPassword({
        email: body.email,
        password: body.password,
        name: body.name || "",
        origin: requestOrigin,
      });
      const actor = await resolveNeonActorFromToken(neonResult.token);
      session = buildNeonSessionPayload(neonResult, actor);
      session.user.emailVerified = Boolean(actor.emailVerified);
      if (config.authRequireEmailVerification && !actor.emailVerified) {
        session.requiresEmailVerification = true;
      }
    } else if (config.authProvider === "firebase") {
      const firebaseResult = await firebaseSignUpWithEmailPassword({
        email: body.email,
        password: body.password,
        name: body.name || "",
      });
      const claims = await verifyFirebaseIdToken(firebaseResult.idToken);
      const actor = await authRepo.resolveFirebaseActorFromClaims(claims);
      session = buildFirebaseSessionPayload(firebaseResult, actor);
      session.user.emailVerified = Boolean(actor.emailVerified);
      if (config.authRequireEmailVerification && !actor.emailVerified) {
        try {
          await firebaseSendEmailVerification({ idToken: firebaseResult.idToken });
        } catch {
          // no-op
        }
        session.requiresEmailVerification = true;
      }
    } else {
      session = await authRepo.signUpAndIssueSession({
        email: body.email,
        name: body.name,
        password: body.password,
      });
    }
    clearAuthFailures(requestIp);
    recordAuthEvent({
      eventType: "auth.signup",
      outcome: "success",
      provider: config.authProvider,
      userId: session.user?.id || "",
      workspaceId: session.workspace?.id || "",
      email: session.user?.email || body.email || "",
      ip: requestIp,
    });
    sendJson(res, 201, { session });
  } catch (error) {
    const failure = registerAuthFailure(requestIp);
    recordAuthEvent({
      eventType: "auth.signup",
      outcome: "failure",
      provider: config.authProvider,
      email: body.email || "",
      ip: requestIp,
      reason: error instanceof Error ? error.message : "Sign up failed",
      metadata: failure,
    });
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Sign up failed" });
  }
}

export async function handleAuthPasswordReset(req, res, context) {
  const {
    requestIp,
    requestOrigin,
    sendJson,
    readJsonBody,
    resolveErrorStatus,
    config,
    registerAuthFailure,
    clearAuthFailures,
    recordAuthEvent,
    neonSendPasswordResetEmail,
    firebaseSendPasswordResetEmail,
  } = context;

  const body = await readJsonBody(req);
  if (config.authProvider === "neon") {
    try {
      await neonSendPasswordResetEmail({
        email: body.email,
        origin: requestOrigin,
      });
      clearAuthFailures(requestIp);
      recordAuthEvent({
        eventType: "auth.password_reset.request",
        outcome: "success",
        provider: "neon",
        email: body.email || "",
        ip: requestIp,
      });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      const failure = registerAuthFailure(requestIp);
      recordAuthEvent({
        eventType: "auth.password_reset.request",
        outcome: "failure",
        provider: "neon",
        email: body.email || "",
        ip: requestIp,
        reason: error instanceof Error ? error.message : "Password reset failed",
        metadata: failure,
      });
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Password reset failed" });
    }
    return;
  }

  if (config.authProvider !== "firebase") {
    sendJson(res, 400, { error: "Password reset via API is only available with Firebase auth provider" });
    return;
  }

  try {
    await firebaseSendPasswordResetEmail({ email: body.email });
    clearAuthFailures(requestIp);
    recordAuthEvent({
      eventType: "auth.password_reset.request",
      outcome: "success",
      provider: "firebase",
      email: body.email || "",
      ip: requestIp,
    });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    const failure = registerAuthFailure(requestIp);
    recordAuthEvent({
      eventType: "auth.password_reset.request",
      outcome: "failure",
      provider: "firebase",
      email: body.email || "",
      ip: requestIp,
      reason: error instanceof Error ? error.message : "Password reset failed",
      metadata: failure,
    });
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Password reset failed" });
  }
}

export async function handleAuthRefresh(req, res, context) {
  const {
    sendJson,
    readJsonBody,
    resolveErrorStatus,
    config,
    firebaseRefreshIdToken,
    verifyFirebaseIdToken,
    authRepo,
    buildFirebaseSessionPayload,
  } = context;

  const body = await readJsonBody(req);
  if (config.authProvider === "neon") {
    sendJson(res, 400, {
      error: "Token refresh via API is not available in Neon auth mode. Use the Neon Auth client session flow.",
    });
    return;
  }

  if (config.authProvider !== "firebase") {
    sendJson(res, 400, { error: "Token refresh is only available with Firebase auth provider" });
    return;
  }

  try {
    const refreshed = await firebaseRefreshIdToken(body.refreshToken);
    const claims = await verifyFirebaseIdToken(refreshed.idToken);
    const actor = await authRepo.resolveFirebaseActorFromClaims(claims);
    const session = buildFirebaseSessionPayload(refreshed, actor);
    session.user.emailVerified = Boolean(actor.emailVerified);
    if (config.authRequireEmailVerification && !actor.emailVerified) {
      session.requiresEmailVerification = true;
    }
    sendJson(res, 200, { session });
  } catch (error) {
    const statusCode = resolveErrorStatus(error, 400);
    sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Token refresh failed" });
  }
}
