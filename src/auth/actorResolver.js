export function createActorResolver({
  config,
  authRepo,
  extractSessionTokenFromHeaders,
  verifyFirebaseIdToken,
  verifyNeonAccessToken,
  mapNeonClaimsToIdentity,
}) {
  async function resolveNeonActorFromToken(token, { preferredWorkspaceId = "" } = {}) {
    const claims = await verifyNeonAccessToken(token);
    const identity = mapNeonClaimsToIdentity(claims);
    const user = await authRepo.upsertProviderUser({
      provider: "neon",
      subject: identity.subject,
      email: identity.email,
      name: identity.name,
    });
    return authRepo.buildActorForUser(user, {
      preferredWorkspaceId,
      emailVerified: identity.emailVerified,
    });
  }

  async function buildActorFromRequest(req, { url = null, allowQueryToken = false } = {}) {
    const token = extractSessionTokenFromHeaders(req.headers);
    const tokenFromQuery = allowQueryToken ? url?.searchParams?.get("sessionToken") || "" : "";
    const finalToken = token || String(tokenFromQuery).trim();
    if (!finalToken) return null;
    const preferredWorkspaceId =
      String(req.headers["x-workspace-id"] || "").trim() ||
      String(url?.searchParams?.get("workspaceId") || "").trim();

    if (config.authProvider === "firebase") {
      try {
        const claims = await verifyFirebaseIdToken(finalToken);
        const actor = await authRepo.resolveFirebaseActorFromClaims(claims, { preferredWorkspaceId });
        return {
          token: finalToken,
          provider: "firebase",
          ...actor,
        };
      } catch {
        return null;
      }
    }
    if (config.authProvider === "neon") {
      try {
        const actor = await resolveNeonActorFromToken(finalToken, { preferredWorkspaceId });
        return {
          token: finalToken,
          provider: "neon",
          ...actor,
        };
      } catch {
        return null;
      }
    }

    const session = await authRepo.getSession(finalToken);
    if (!session) return null;
    try {
      const actor = await authRepo.buildActorForUserId(session.user.id, {
        preferredWorkspaceId,
        emailVerified: true,
      });
      return {
        token: finalToken,
        provider: "local",
        ...actor,
      };
    } catch {
      return null;
    }
  }

  return {
    resolveNeonActorFromToken,
    buildActorFromRequest,
  };
}
