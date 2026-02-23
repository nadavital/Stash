import crypto from "node:crypto";
import { config } from "../../config.js";
import {
  AuthError,
  nowIso,
  normalizeEmail,
  mapSessionRow,
  verifyPassword,
  validatePassword,
  normalizeProvider,
} from "./utils.js";

export const sessionSecurityMethods = {
  getSession(token) {
    const normalized = String(token || "").trim();
    if (!normalized) return null;

    const row = this.getSessionStmt.get(normalized);
    if (!row) return null;

    if (Date.parse(row.expires_at) <= Date.now()) {
      this.deleteSessionStmt.run(normalized);
      return null;
    }

    return mapSessionRow(row);
  },

  recordAuthEvent({
    eventType = "auth.unknown",
    outcome = "unknown",
    provider = "",
    userId = "",
    workspaceId = "",
    email = "",
    ip = "",
    reason = "",
    metadata = null,
  } = {}) {
    const id = `ae_${crypto.randomUUID()}`;
    const createdAt = nowIso();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    this.insertAuthEventStmt.run(
      id,
      String(eventType || "auth.unknown").slice(0, 120),
      String(outcome || "unknown").slice(0, 32),
      String(provider || "").slice(0, 40) || null,
      String(userId || "").trim() || null,
      String(workspaceId || "").trim() || null,
      normalizeEmail(email) || null,
      String(ip || "").slice(0, 120) || null,
      String(reason || "").slice(0, 400) || null,
      metadataJson,
      createdAt
    );
    return { id, createdAt };
  },

  listAuthEventsForWorkspace(workspaceId, limit = 100) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return [];
    const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    return this.listAuthEventsStmt.all(normalizedWorkspaceId, normalizedLimit).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      outcome: row.outcome,
      provider: row.provider || "",
      userId: row.user_id || "",
      workspaceId: row.workspace_id || "",
      email: row.email || "",
      ip: row.ip || "",
      reason: row.reason || "",
      metadata: (() => {
        if (!row.metadata_json) return null;
        try {
          return JSON.parse(row.metadata_json);
        } catch {
          return null;
        }
      })(),
      createdAt: row.created_at,
    }));
  },

  revokeAllSessionsForUser(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return { revoked: 0 };
    const result = this.deleteSessionsForUserStmt.run(normalizedUserId);
    return { revoked: result?.changes || 0 };
  },

  changeLocalPassword({ userId, currentPassword, newPassword } = {}) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      throw new AuthError("Missing user id", 400);
    }
    const user = this.getUserByIdStmt.get(normalizedUserId);
    if (!user) {
      throw new AuthError("User not found", 404);
    }
    if (!user.password_hash) {
      throw new AuthError("Password change is not available for this account", 400);
    }
    if (!verifyPassword(currentPassword, user.password_hash)) {
      throw new AuthError("Current password is incorrect", 401);
    }
    const validNew = validatePassword(newPassword);
    this._setUserPassword(normalizedUserId, validNew);
    this.revokeAllSessionsForUser(normalizedUserId);
    return { ok: true };
  },

  deleteUserAccount(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      throw new AuthError("Missing user id", 400);
    }
    const existing = this.getUserByIdStmt.get(normalizedUserId);
    if (!existing) {
      throw new AuthError("User not found", 404);
    }

    this.db.exec("BEGIN");
    try {
      this.deleteSessionsForUserStmt.run(normalizedUserId);
      this.deleteUserByIdStmt.run(normalizedUserId);
      this.db.exec("COMMIT");
      return { deleted: true };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  },

  issueSession({ email, name = "", user = null } = {}) {
    const sessionUser = user || this.ensureUser({ email, name });
    const actor = this.buildActorForUser(sessionUser, { emailVerified: true });

    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + config.authSessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
    const token = `sess_${crypto.randomUUID()}`;
    this.insertSessionStmt.run(token, actor.userId, actor.workspaceId, createdAt, expiresAt);

    return {
      token,
      user: {
        id: actor.userId,
        email: actor.userEmail,
        displayName: actor.userName,
      },
      workspace: {
        id: actor.workspaceId,
        slug: actor.workspaceSlug,
        name: actor.workspaceName,
      },
      role: actor.role,
      createdAt,
      expiresAt,
    };
  },

  signUpAndIssueSession({ email, name = "", password } = {}) {
    const user = this.registerUser({ email, name, password });
    return this.issueSession({ user });
  },

  loginAndIssueSession({ email, password } = {}) {
    const user = this.authenticateUser({ email, password });
    return this.issueSession({ user });
  },
};
