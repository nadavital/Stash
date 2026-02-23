import crypto from "node:crypto";
import {
  AuthError,
  nowIso,
  normalizeEmail,
  isEmailLike,
  normalizeWorkspaceRole,
} from "./utils.js";

export const inviteMethods = {
  createWorkspaceInvite({ workspaceId, email, role = "member", invitedByUserId, expiresInHours = 72 } = {}) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    const normalizedInvitedBy = String(invitedByUserId || "").trim();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedWorkspaceId) throw new AuthError("Missing workspace id", 400);
    if (!normalizedInvitedBy) throw new AuthError("Missing inviter user id", 400);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) throw new AuthError("Valid email is required", 400);

    const workspace = this.getWorkspaceByIdStmt.get(normalizedWorkspaceId);
    if (!workspace) throw new AuthError("Workspace not found", 404);

    const invitee = this.getUserByEmailStmt.get(normalizedEmail);
    if (invitee) {
      const membership = this.getMembershipStmt.get(invitee.id, normalizedWorkspaceId);
      if (membership) {
        throw new AuthError("User is already a workspace member", 409);
      }
    }

    const now = nowIso();
    const expiresAt = new Date(Date.now() + Math.max(1, Number(expiresInHours) || 72) * 60 * 60 * 1000).toISOString();
    const id = `wi_${crypto.randomUUID()}`;
    const token = `inv_${crypto.randomUUID().replace(/-/g, "")}`;
    this.insertWorkspaceInviteStmt.run(
      id,
      token,
      normalizedWorkspaceId,
      normalizedEmail,
      normalizeWorkspaceRole(role),
      normalizedInvitedBy,
      "pending",
      expiresAt,
      null,
      null,
      null,
      now,
      now
    );

    return this.getWorkspaceInviteById(id);
  },

  getWorkspaceInviteByToken(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) return null;
    return this.getWorkspaceInviteByTokenStmt.get(normalizedToken) || null;
  },

  getWorkspaceInviteById(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    const row = this.getWorkspaceInviteByIdStmt.get(normalizedId);
    return row ? this._mapInviteRow(row) : null;
  },

  _getWorkspaceInviteByIdRaw(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    return this.getWorkspaceInviteByIdStmt.get(normalizedId) || null;
  },

  listWorkspaceInvites(workspaceId, { status = "", limit = 100 } = {}) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return [];
    const raw = this.listWorkspaceInvitesStmt.all(normalizedWorkspaceId, Math.min(Math.max(Number(limit) || 50, 1), 500));
    const normalizedStatus = String(status || "").trim().toLowerCase();
    const filtered = normalizedStatus ? raw.filter((row) => String(row.status || "").toLowerCase() === normalizedStatus) : raw;
    return filtered.map((row) => this._mapInviteRow(row));
  },

  listIncomingWorkspaceInvites(email, limit = 100) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return [];
    const rows = this.listIncomingWorkspaceInvitesStmt.all(normalizedEmail, Math.min(Math.max(Number(limit) || 50, 1), 500));
    return rows.map((row) => this._mapInviteRow(row));
  },

  _mapInviteRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      token: row.token,
      workspaceId: row.workspace_id,
      email: row.email,
      role: row.role || "member",
      invitedByUserId: row.invited_by_user_id,
      status: row.status || "pending",
      expiresAt: row.expires_at,
      acceptedByUserId: row.accepted_by_user_id || "",
      acceptedAt: row.accepted_at || "",
      revokedAt: row.revoked_at || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  acceptWorkspaceInvite({ token, userId, userEmail } = {}) {
    const invite = this.getWorkspaceInviteByToken(token);
    if (!invite) throw new AuthError("Invite not found", 404);
    if (String(invite.status || "").toLowerCase() !== "pending") {
      throw new AuthError("Invite is no longer active", 400);
    }
    if (Date.parse(invite.expires_at) <= Date.now()) {
      throw new AuthError("Invite has expired", 400);
    }
    const normalizedUserEmail = normalizeEmail(userEmail);
    if (!normalizedUserEmail || normalizedUserEmail !== normalizeEmail(invite.email)) {
      throw new AuthError("Invite email does not match current account", 403);
    }

    const normalizedUserId = String(userId || "").trim();
    const now = nowIso();
    this.db.exec("BEGIN");
    try {
      this.ensureMembership({
        userId: normalizedUserId,
        workspaceId: invite.workspace_id,
        role: normalizeWorkspaceRole(invite.role || "member"),
      });
      this.acceptWorkspaceInviteStmt.run(normalizedUserId, now, now, invite.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    return this.getWorkspaceInviteById(invite.id);
  },

  revokeWorkspaceInvite({ id, workspaceId } = {}) {
    const invite = this._getWorkspaceInviteByIdRaw(id);
    if (!invite) throw new AuthError("Invite not found", 404);
    if (String(invite.workspace_id || "") !== String(workspaceId || "")) {
      throw new AuthError("Invite does not belong to this workspace", 403);
    }
    if (String(invite.status || "").toLowerCase() !== "pending") {
      return this._mapInviteRow(invite);
    }

    const now = nowIso();
    this.revokeWorkspaceInviteStmt.run(now, now, invite.id);
    return this.getWorkspaceInviteById(invite.id);
  },
};
