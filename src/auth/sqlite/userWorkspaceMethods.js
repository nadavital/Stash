import crypto from "node:crypto";
import { config } from "../../config.js";
import {
  AuthError,
  nowIso,
  normalizeEmail,
  isEmailLike,
  normalizeDisplayName,
  slugify,
  validatePassword,
  hashPassword,
  normalizePassword,
  verifyPassword,
  normalizeWorkspaceRole,
  normalizeProvider,
  isUniqueConstraintError,
} from "./utils.js";

export const userWorkspaceMethods = {
  ensureWorkspace({ workspaceId = "", workspaceName = "" } = {}) {
    const normalizedId = String(workspaceId || "").trim();
    if (normalizedId) {
      const existing = this.getWorkspaceByIdStmt.get(normalizedId);
      if (existing) {
        return existing;
      }

      const now = nowIso();
      const name = String(workspaceName || config.defaultWorkspaceName).trim() || config.defaultWorkspaceName;
      this.insertWorkspaceStmt.run(normalizedId, slugify(name), name, now, now);
      return this.getWorkspaceByIdStmt.get(normalizedId);
    }

    const normalizedName = String(workspaceName || "").trim();
    if (!normalizedName) {
      return this.getWorkspaceByIdStmt.get(config.defaultWorkspaceId);
    }

    const bySlug = this.getWorkspaceBySlugStmt.get(slugify(normalizedName));
    if (bySlug) return bySlug;

    const now = nowIso();
    const id = `ws_${crypto.randomUUID()}`;
    this.insertWorkspaceStmt.run(id, slugify(normalizedName), normalizedName.slice(0, 120), now, now);
    return this.getWorkspaceByIdStmt.get(id);
  },

  ensureUser({ email, name = "" }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) {
      throw new Error("Valid email is required");
    }

    const existing = this.getUserByEmailStmt.get(normalizedEmail);
    if (existing) return existing;

    const now = nowIso();
    const id = `user_${crypto.randomUUID()}`;
    const displayName = normalizeDisplayName(name, normalizedEmail);
    this.insertUserStmt.run(id, normalizedEmail, displayName, null, null, "local", null, now, now);
    return this.getUserByIdStmt.get(id);
  },

  _setUserPassword(userId, password) {
    const passwordHash = hashPassword(password);
    const now = nowIso();
    this.updateUserPasswordStmt.run(passwordHash, now, now, userId);
  },

  registerUser({ email, name = "", password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) {
      throw new AuthError("Valid email is required", 400);
    }

    const normalizedName = normalizeDisplayName(name, normalizedEmail);
    const validPassword = validatePassword(password);
    const existing = this.getUserByEmailStmt.get(normalizedEmail);

    if (existing?.password_hash) {
      throw new AuthError("An account with that email already exists", 409);
    }

    if (existing && !existing.password_hash) {
      const now = nowIso();
      this.updateUserProfileStmt.run(normalizedName, now, existing.id);
      this._setUserPassword(existing.id, validPassword);
      if (!existing.auth_provider) {
        this.updateUserAuthIdentityStmt.run("local", null, now, existing.id);
      }
      return this.getUserByIdStmt.get(existing.id);
    }

    const now = nowIso();
    const id = `user_${crypto.randomUUID()}`;
    this.insertUserStmt.run(
      id,
      normalizedEmail,
      normalizedName,
      hashPassword(validPassword),
      now,
      "local",
      null,
      now,
      now
    );
    return this.getUserByIdStmt.get(id);
  },

  authenticateUser({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) {
      throw new AuthError("Valid email is required", 400);
    }

    const normalizedPassword = normalizePassword(password);
    if (!normalizedPassword) {
      throw new AuthError("Password is required", 400);
    }

    const user = this.getUserByEmailStmt.get(normalizedEmail);
    if (!user?.password_hash) {
      throw new AuthError("Invalid email or password", 401);
    }
    if (!verifyPassword(normalizedPassword, user.password_hash)) {
      throw new AuthError("Invalid email or password", 401);
    }
    return user;
  },

  ensureMembership({ userId, workspaceId, role = "member" }) {
    const existing = this.getMembershipStmt.get(userId, workspaceId);
    if (existing) return existing;

    const now = nowIso();
    const id = `wm_${crypto.randomUUID()}`;
    this.insertMembershipStmt.run(id, userId, workspaceId, normalizeWorkspaceRole(role), now, now);
    return this.getMembershipStmt.get(userId, workspaceId);
  },

  listWorkspacesForUser(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return [];
    return this.listMembershipsForUserStmt.all(normalizedUserId).map((row) => ({
      id: row.workspace_id,
      slug: row.slug,
      name: row.workspace_name,
      role: row.role || "member",
      joinedAt: row.created_at,
    }));
  },

  _resolveWorkspaceForUser(userId, preferredWorkspaceId = "") {
    const preferred = String(preferredWorkspaceId || "").trim();
    if (preferred) {
      const membership = this.getMembershipStmt.get(userId, preferred);
      if (membership) {
        const workspace = this.getWorkspaceByIdStmt.get(preferred);
        if (workspace) {
          return {
            workspace,
            role: membership.role || "member",
          };
        }
      }
    }

    const existing = this.findWorkspaceForUserStmt.get(userId, config.defaultWorkspaceId);
    if (existing) {
      const membership = this.getMembershipStmt.get(userId, existing.id);
      return {
        workspace: existing,
        role: membership?.role || "member",
      };
    }

    return null;
  },

  _createWorkspace({ name, id = "" } = {}) {
    const workspaceName = String(name || "").trim().slice(0, 120) || "Workspace";
    const workspaceId = String(id || "").trim() || `ws_${crypto.randomUUID()}`;
    const now = nowIso();
    let slug = slugify(workspaceName);

    let suffix = 0;
    while (true) {
      const existing = this.getWorkspaceBySlugStmt.get(slug);
      if (!existing || existing.id === workspaceId) {
        break;
      }
      suffix += 1;
      const base = slugify(workspaceName).slice(0, 56) || "workspace";
      slug = `${base}-${suffix}`;
    }

    this.insertWorkspaceStmt.run(workspaceId, slug, workspaceName, now, now);
    return this.getWorkspaceByIdStmt.get(workspaceId);
  },

  ensurePersonalWorkspaceForUser(user) {
    const existing = this.findWorkspaceForUserStmt.get(user.id, config.defaultWorkspaceId);
    if (existing && existing.id !== config.defaultWorkspaceId) {
      return existing;
    }

    const displayName = String(user.display_name || "").trim();
    const emailLocal = String(user.email || "")
      .split("@")[0]
      .replace(/[^a-zA-Z0-9_-]+/g, " ")
      .trim();
    const workspaceName = displayName
      ? `${displayName}'s Workspace`
      : emailLocal
        ? `${emailLocal} Workspace`
        : "Personal Workspace";

    const workspace = this._createWorkspace({ name: workspaceName });
    this.ensureMembership({
      userId: user.id,
      workspaceId: workspace.id,
      role: "owner",
    });
    return workspace;
  },

  buildActorForUser(user, { preferredWorkspaceId = "", emailVerified = true } = {}) {
    if (!user?.id) {
      throw new AuthError("Missing user for actor", 400);
    }

    let workspaceContext = this._resolveWorkspaceForUser(user.id, preferredWorkspaceId);
    if (!workspaceContext) {
      const workspace = this.ensurePersonalWorkspaceForUser(user);
      const defaultRole = "owner";
      const membership = this.ensureMembership({
        userId: user.id,
        workspaceId: workspace.id,
        role: defaultRole,
      });
      workspaceContext = { workspace, role: membership?.role || defaultRole };
    }

    const { workspace, role } = workspaceContext;

    return {
      userId: user.id,
      userEmail: user.email,
      userName: user.display_name,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      role: role || "member",
      emailVerified: Boolean(emailVerified),
      authProvider: normalizeProvider(user.auth_provider || "local"),
      authProviderSubject: String(user.provider_subject || "").trim(),
    };
  },

  buildActorForUserId(userId, { preferredWorkspaceId = "", emailVerified = true } = {}) {
    const user = this.getUserByIdStmt.get(String(userId || "").trim());
    if (!user) {
      throw new AuthError("User not found", 404);
    }
    return this.buildActorForUser(user, { preferredWorkspaceId, emailVerified });
  },

  upsertProviderUser({ provider, subject, email, name = "" } = {}) {
    const normalizedProvider = normalizeProvider(provider);
    const normalizedSubject = String(subject || "").trim();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedSubject) {
      throw new AuthError("Missing provider subject", 400);
    }
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) {
      throw new AuthError("Valid email is required", 400);
    }

    const normalizedName = normalizeDisplayName(name, normalizedEmail);
    const now = nowIso();

    const byProvider = this.getUserByProviderStmt.get(normalizedProvider, normalizedSubject);
    if (byProvider) {
      if (byProvider.email !== normalizedEmail || byProvider.display_name !== normalizedName) {
        try {
          this.updateUserIdentityFromProviderStmt.run(normalizedEmail, normalizedName, now, byProvider.id);
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            throw new AuthError("This email is already linked to another account", 409);
          }
          throw error;
        }
      }
      return this.getUserByIdStmt.get(byProvider.id);
    }

    const byEmail = this.getUserByEmailStmt.get(normalizedEmail);
    if (byEmail) {
      const existingProvider = normalizeProvider(byEmail.auth_provider || "local");
      const existingSubject = String(byEmail.provider_subject || "").trim();

      if (existingSubject && (existingProvider !== normalizedProvider || existingSubject !== normalizedSubject)) {
        throw new AuthError("This email is already linked to another sign-in method", 409);
      }

      this.updateUserAuthIdentityStmt.run(normalizedProvider, normalizedSubject, now, byEmail.id);
      if (byEmail.display_name !== normalizedName) {
        this.updateUserProfileStmt.run(normalizedName, now, byEmail.id);
      }
      return this.getUserByIdStmt.get(byEmail.id);
    }

    const id = `user_${crypto.randomUUID()}`;
    try {
      this.insertUserStmt.run(
        id,
        normalizedEmail,
        normalizedName,
        null,
        null,
        normalizedProvider,
        normalizedSubject,
        now,
        now
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AuthError("An account with that email already exists", 409);
      }
      throw error;
    }
    return this.getUserByIdStmt.get(id);
  },

  resolveFirebaseActorFromClaims(claims = {}, { preferredWorkspaceId = "" } = {}) {
    const subject = String(claims.uid || claims.user_id || claims.sub || "").trim();
    const email = normalizeEmail(claims.email || "");
    const name = String(claims.name || claims.displayName || "").trim();
    const emailVerified = Boolean(claims.email_verified);

    if (!subject) {
      throw new AuthError("Invalid Firebase token: missing subject", 401);
    }
    if (!email || !isEmailLike(email)) {
      throw new AuthError("Firebase account must include a valid email", 401);
    }

    const user = this.upsertProviderUser({
      provider: "firebase",
      subject,
      email,
      name,
    });

    return this.buildActorForUser(user, {
      preferredWorkspaceId,
      emailVerified,
    });
  },

  getUserById(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return null;
    const row = this.getUserByIdStmt.get(normalizedUserId);
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      authProvider: normalizeProvider(row.auth_provider || "local"),
      authProviderSubject: String(row.provider_subject || "").trim(),
    };
  },
};
