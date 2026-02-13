import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;
const SCRYPT_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 64 * 1024 * 1024,
});

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isEmailLike(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeDisplayName(name, email) {
  const normalized = String(name || "").trim();
  if (normalized) return normalized.slice(0, 120);
  const local = normalizeEmail(email).split("@")[0] || "user";
  return local.slice(0, 120);
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "workspace";
}

function normalizePassword(password) {
  return String(password || "");
}

function validatePassword(password) {
  const normalized = normalizePassword(password);
  if (!normalized || normalized.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, 400);
  }
  if (normalized.length > PASSWORD_MAX_LENGTH) {
    throw new AuthError(`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`, 400);
  }
  return normalized;
}

function hashPassword(password) {
  const plain = validatePassword(password);
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return [
    "scrypt",
    String(SCRYPT_PARAMS.N),
    String(SCRYPT_PARAMS.r),
    String(SCRYPT_PARAMS.p),
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

function verifyPassword(password, encodedHash) {
  const plain = normalizePassword(password);
  if (!plain || !encodedHash) return false;

  const parts = String(encodedHash).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");

  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !salt.length || !expected.length) {
    return false;
  }

  const actual = crypto.scryptSync(plain, salt, expected.length, {
    N,
    r,
    p,
    maxmem: SCRYPT_PARAMS.maxmem,
  });

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function mapSessionRow(row) {
  if (!row) return null;
  return {
    token: row.token,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
    },
    workspace: {
      id: row.workspace_id,
      slug: row.slug,
      name: row.workspace_name,
    },
    role: row.role || "member",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function normalizeProvider(provider) {
  const normalized = String(provider || "").trim().toLowerCase();
  return normalized || "local";
}

function normalizeWorkspaceRole(role = "member") {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "member") {
    return normalized;
  }
  return "member";
}

function isUniqueConstraintError(error) {
  const message = String(error?.message || "");
  return message.includes("SQLITE_CONSTRAINT");
}

export function extractSessionTokenFromHeaders(headers = {}) {
  const authorization = headers.authorization;
  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const fromCustomHeader = headers["x-session-token"];
  if (typeof fromCustomHeader === "string" && fromCustomHeader.trim()) {
    return fromCustomHeader.trim();
  }

  return "";
}

class AuthRepository {
  constructor(dbPath = config.dbPath) {
    this.db = new DatabaseSync(dbPath, { timeout: 5000 });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    this._initSchema();
    this._prepareStatements();
    this._ensureDefaultWorkspace();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT,
        password_updated_at TEXT,
        auth_provider TEXT,
        provider_subject TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this._ensureUsersSchemaColumns();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, workspace_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )
    `);

    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON workspace_memberships(workspace_id);`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_invites (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        invited_by_user_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TEXT NOT NULL,
        accepted_by_user_id TEXT,
        accepted_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY(invited_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace
      ON workspace_invites(workspace_id, status, created_at)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_workspace_invites_email
      ON workspace_invites(email, status, created_at)
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        outcome TEXT NOT NULL,
        provider TEXT,
        user_id TEXT,
        workspace_id TEXT,
        email TEXT,
        ip TEXT,
        reason TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_events_created
      ON auth_events(created_at)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_events_workspace
      ON auth_events(workspace_id, created_at)
    `);
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_subject
      ON users(auth_provider, provider_subject)
      WHERE auth_provider IS NOT NULL AND provider_subject IS NOT NULL
    `);
  }

  _ensureUsersSchemaColumns() {
    const columns = this.db.prepare("PRAGMA table_info(users)").all();
    const columnNames = new Set(columns.map((column) => column.name));

    if (!columnNames.has("password_hash")) {
      this.db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
    }
    if (!columnNames.has("password_updated_at")) {
      this.db.exec("ALTER TABLE users ADD COLUMN password_updated_at TEXT");
    }
    if (!columnNames.has("auth_provider")) {
      this.db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT");
    }
    if (!columnNames.has("provider_subject")) {
      this.db.exec("ALTER TABLE users ADD COLUMN provider_subject TEXT");
    }
  }

  _prepareStatements() {
    this.insertUserStmt = this.db.prepare(`
      INSERT INTO users (
        id,
        email,
        display_name,
        password_hash,
        password_updated_at,
        auth_provider,
        provider_subject,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getUserByEmailStmt = this.db.prepare(`
      SELECT * FROM users WHERE email = ? LIMIT 1
    `);

    this.getUserByProviderStmt = this.db.prepare(`
      SELECT * FROM users WHERE auth_provider = ? AND provider_subject = ? LIMIT 1
    `);

    this.getUserByIdStmt = this.db.prepare(`
      SELECT * FROM users WHERE id = ? LIMIT 1
    `);

    this.updateUserProfileStmt = this.db.prepare(`
      UPDATE users
      SET display_name = ?, updated_at = ?
      WHERE id = ?
    `);

    this.updateUserPasswordStmt = this.db.prepare(`
      UPDATE users
      SET password_hash = ?, password_updated_at = ?, updated_at = ?
      WHERE id = ?
    `);

    this.updateUserAuthIdentityStmt = this.db.prepare(`
      UPDATE users
      SET auth_provider = ?, provider_subject = ?, updated_at = ?
      WHERE id = ?
    `);

    this.updateUserIdentityFromProviderStmt = this.db.prepare(`
      UPDATE users
      SET email = ?, display_name = ?, updated_at = ?
      WHERE id = ?
    `);

    this.insertWorkspaceStmt = this.db.prepare(`
      INSERT INTO workspaces (id, slug, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.getWorkspaceByIdStmt = this.db.prepare(`
      SELECT * FROM workspaces WHERE id = ? LIMIT 1
    `);

    this.getWorkspaceBySlugStmt = this.db.prepare(`
      SELECT * FROM workspaces WHERE slug = ? LIMIT 1
    `);

    this.insertMembershipStmt = this.db.prepare(`
      INSERT OR IGNORE INTO workspace_memberships (id, user_id, workspace_id, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.getMembershipStmt = this.db.prepare(`
      SELECT * FROM workspace_memberships WHERE user_id = ? AND workspace_id = ? LIMIT 1
    `);

    this.listMembershipsForUserStmt = this.db.prepare(`
      SELECT
        m.id,
        m.user_id,
        m.workspace_id,
        m.role,
        m.created_at,
        m.updated_at,
        w.slug,
        w.name AS workspace_name
      FROM workspace_memberships m
      JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.user_id = ?
      ORDER BY datetime(m.created_at) ASC
    `);

    this.findWorkspaceForUserStmt = this.db.prepare(`
      SELECT w.*
      FROM workspaces w
      JOIN workspace_memberships m ON m.workspace_id = w.id
      WHERE m.user_id = ?
      ORDER BY
        CASE WHEN w.id = ? THEN 1 ELSE 0 END ASC,
        datetime(m.created_at) ASC
      LIMIT 1
    `);

    this.insertSessionStmt = this.db.prepare(`
      INSERT INTO sessions (token, user_id, workspace_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.deleteSessionStmt = this.db.prepare(`
      DELETE FROM sessions WHERE token = ?
    `);

    this.getSessionStmt = this.db.prepare(`
      SELECT
        s.token,
        s.user_id,
        s.workspace_id,
        s.created_at,
        s.expires_at,
        u.email,
        u.display_name,
        w.slug,
        w.name AS workspace_name,
        m.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      JOIN workspaces w ON w.id = s.workspace_id
      JOIN workspace_memberships m ON m.user_id = s.user_id AND m.workspace_id = s.workspace_id
      WHERE s.token = ?
      LIMIT 1
    `);

    this.deleteSessionsForUserStmt = this.db.prepare(`
      DELETE FROM sessions WHERE user_id = ?
    `);

    this.deleteUserByIdStmt = this.db.prepare(`
      DELETE FROM users WHERE id = ?
    `);

    this.insertWorkspaceInviteStmt = this.db.prepare(`
      INSERT INTO workspace_invites (
        id,
        token,
        workspace_id,
        email,
        role,
        invited_by_user_id,
        status,
        expires_at,
        accepted_by_user_id,
        accepted_at,
        revoked_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getWorkspaceInviteByTokenStmt = this.db.prepare(`
      SELECT * FROM workspace_invites WHERE token = ? LIMIT 1
    `);

    this.getWorkspaceInviteByIdStmt = this.db.prepare(`
      SELECT * FROM workspace_invites WHERE id = ? LIMIT 1
    `);

    this.listWorkspaceInvitesStmt = this.db.prepare(`
      SELECT * FROM workspace_invites
      WHERE workspace_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `);

    this.listIncomingWorkspaceInvitesStmt = this.db.prepare(`
      SELECT * FROM workspace_invites
      WHERE email = ? AND status = 'pending'
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `);

    this.acceptWorkspaceInviteStmt = this.db.prepare(`
      UPDATE workspace_invites
      SET status = 'accepted', accepted_by_user_id = ?, accepted_at = ?, updated_at = ?
      WHERE id = ?
    `);

    this.revokeWorkspaceInviteStmt = this.db.prepare(`
      UPDATE workspace_invites
      SET status = 'revoked', revoked_at = ?, updated_at = ?
      WHERE id = ?
    `);

    this.insertAuthEventStmt = this.db.prepare(`
      INSERT INTO auth_events (
        id,
        event_type,
        outcome,
        provider,
        user_id,
        workspace_id,
        email,
        ip,
        reason,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.listAuthEventsStmt = this.db.prepare(`
      SELECT * FROM auth_events
      WHERE workspace_id = ?
      ORDER BY datetime(created_at) DESC
      LIMIT ?
    `);
  }

  _ensureDefaultWorkspace() {
    const existing = this.getWorkspaceByIdStmt.get(config.defaultWorkspaceId);
    if (existing) return;

    const now = nowIso();
    let fallbackSlug = slugify(config.defaultWorkspaceName);
    const bySlug = this.getWorkspaceBySlugStmt.get(fallbackSlug);
    if (bySlug && bySlug.id !== config.defaultWorkspaceId) {
      fallbackSlug = `${fallbackSlug}-${String(config.defaultWorkspaceId).slice(-8)}`.slice(0, 64);
    }
    this.insertWorkspaceStmt.run(
      config.defaultWorkspaceId,
      fallbackSlug,
      config.defaultWorkspaceName,
      now,
      now
    );
  }

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
  }

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
  }

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
  }

  _setUserPassword(userId, password) {
    const passwordHash = hashPassword(password);
    const now = nowIso();
    this.updateUserPasswordStmt.run(passwordHash, now, now, userId);
  }

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
  }

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
  }

  ensureMembership({ userId, workspaceId, role = "member" }) {
    const existing = this.getMembershipStmt.get(userId, workspaceId);
    if (existing) return existing;

    const now = nowIso();
    const id = `wm_${crypto.randomUUID()}`;
    this.insertMembershipStmt.run(id, userId, workspaceId, normalizeWorkspaceRole(role), now, now);
    return this.getMembershipStmt.get(userId, workspaceId);
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  buildActorForUserId(userId, { preferredWorkspaceId = "", emailVerified = true } = {}) {
    const user = this.getUserByIdStmt.get(String(userId || "").trim());
    if (!user) {
      throw new AuthError("User not found", 404);
    }
    return this.buildActorForUser(user, { preferredWorkspaceId, emailVerified });
  }

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
  }

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
  }

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
  }

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
  }

  revokeAllSessionsForUser(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return { revoked: 0 };
    const result = this.deleteSessionsForUserStmt.run(normalizedUserId);
    return { revoked: result?.changes || 0 };
  }

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
  }

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
  }

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
  }

  getWorkspaceInviteByToken(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) return null;
    return this.getWorkspaceInviteByTokenStmt.get(normalizedToken) || null;
  }

  getWorkspaceInviteById(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    const row = this.getWorkspaceInviteByIdStmt.get(normalizedId);
    return row ? this._mapInviteRow(row) : null;
  }

  _getWorkspaceInviteByIdRaw(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    return this.getWorkspaceInviteByIdStmt.get(normalizedId) || null;
  }

  listWorkspaceInvites(workspaceId, { status = "", limit = 100 } = {}) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return [];
    const raw = this.listWorkspaceInvitesStmt.all(normalizedWorkspaceId, Math.min(Math.max(Number(limit) || 50, 1), 500));
    const normalizedStatus = String(status || "").trim().toLowerCase();
    const filtered = normalizedStatus ? raw.filter((row) => String(row.status || "").toLowerCase() === normalizedStatus) : raw;
    return filtered.map((row) => this._mapInviteRow(row));
  }

  listIncomingWorkspaceInvites(email, limit = 100) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return [];
    const rows = this.listIncomingWorkspaceInvitesStmt.all(normalizedEmail, Math.min(Math.max(Number(limit) || 50, 1), 500));
    return rows.map((row) => this._mapInviteRow(row));
  }

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
  }

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
  }

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
  }

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
  }

  signUpAndIssueSession({ email, name = "", password } = {}) {
    const user = this.registerUser({ email, name, password });
    return this.issueSession({ user });
  }

  loginAndIssueSession({ email, password } = {}) {
    const user = this.authenticateUser({ email, password });
    return this.issueSession({ user });
  }

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
  }
}

export const authRepo = new AuthRepository();
export { AuthError };
