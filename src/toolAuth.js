import { config } from "./config.js";
import { authRepo } from "./storage/provider.js";
import { verifyFirebaseIdToken } from "./firebaseAuthLazy.js";

function authError(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeToken(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  if (match?.[1]) return String(match[1]).trim();
  return trimmed;
}

function resolvePreferredWorkspaceId(args = {}) {
  const fromArgs = String(args.workspaceId || "").trim();
  if (fromArgs) return fromArgs;
  return String(process.env.STASH_WORKSPACE_ID || "").trim();
}

function resolveToolToken(args = {}) {
  const fromArgs = normalizeToken(args.sessionToken || args.authorization || "");
  if (fromArgs) return fromArgs;
  return normalizeToken(process.env.STASH_SESSION_TOKEN || "");
}

export async function buildActorFromToolArgs(args = {}) {
  const sessionToken = resolveToolToken(args);
  if (!sessionToken) {
    throw authError("Unauthorized: provide sessionToken or set STASH_SESSION_TOKEN");
  }

  const preferredWorkspaceId = resolvePreferredWorkspaceId(args);

  if (config.authProvider === "firebase") {
    try {
      const claims = await verifyFirebaseIdToken(sessionToken);
      const actor = await authRepo.resolveFirebaseActorFromClaims(claims, { preferredWorkspaceId });
      if (config.authRequireEmailVerification && !actor.emailVerified) {
        throw authError("Email verification required before accessing memory tools", 403);
      }
      return {
        token: sessionToken,
        provider: "firebase",
        ...actor,
      };
    } catch (error) {
      if (Number(error?.status) === 403) {
        throw error;
      }
      throw authError("Unauthorized: invalid or expired session token");
    }
  }

  const session = await authRepo.getSession(sessionToken);
  if (!session) {
    throw authError("Unauthorized: invalid or expired session token");
  }

  try {
    const actor = await authRepo.buildActorForUserId(session.user.id, {
      preferredWorkspaceId,
      emailVerified: true,
    });
    return {
      token: sessionToken,
      provider: "local",
      ...actor,
    };
  } catch {
    throw authError("Unauthorized: invalid session actor");
  }
}
