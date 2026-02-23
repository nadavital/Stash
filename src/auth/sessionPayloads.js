export function buildSessionResponseFromActor({
  actor,
  token,
  refreshToken = "",
  createdAt = "",
  expiresAt = "",
  provider = "local",
}) {
  return {
    token,
    refreshToken: String(refreshToken || "").trim(),
    user: {
      id: actor.userId,
      email: actor.userEmail,
      displayName: actor.userName || "",
      emailVerified: actor.emailVerified !== false,
    },
    workspace: {
      id: actor.workspaceId,
      slug: actor.workspaceSlug || "",
      name: actor.workspaceName,
    },
    role: actor.role || "member",
    createdAt: createdAt || new Date().toISOString(),
    expiresAt: expiresAt || "",
    provider,
  };
}

export function buildFirebaseSessionPayload(firebaseAuthResult, actor) {
  const expiresInSeconds = Number(firebaseAuthResult?.expiresIn || 0);
  const expiresAt = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : "";

  return buildSessionResponseFromActor({
    actor,
    token: String(firebaseAuthResult?.idToken || "").trim(),
    refreshToken: String(firebaseAuthResult?.refreshToken || "").trim(),
    createdAt: new Date().toISOString(),
    expiresAt,
    provider: "firebase",
  });
}

export function buildNeonSessionPayload(neonAuthResult, actor) {
  return buildSessionResponseFromActor({
    actor,
    token: String(neonAuthResult?.token || "").trim(),
    refreshToken: String(neonAuthResult?.refreshToken || "").trim(),
    createdAt: new Date().toISOString(),
    expiresAt: String(neonAuthResult?.expiresAt || "").trim(),
    provider: "neon",
  });
}
