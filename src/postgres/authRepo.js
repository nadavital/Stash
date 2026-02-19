import crypto from "node:crypto";
import { config } from "../config.js";
import { getPostgresPool } from "./pool.js";
import { ensurePostgresReady } from "./runtime.js";

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

function toIso(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
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
  const actual = crypto.scryptSync(plain, salt, expected.length, { N, r, p, maxmem: SCRYPT_PARAMS.maxmem });
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function isUniqueConstraintError(error) {
  return String(error?.code || "") === "23505";
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
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
  };
}

function mapInviteRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    token: row.token,
    workspaceId: row.workspace_id,
    email: row.email,
    role: row.role || "member",
    invitedByUserId: row.invited_by_user_id,
    status: row.status || "pending",
    expiresAt: toIso(row.expires_at),
    acceptedByUserId: row.accepted_by_user_id || "",
    acceptedAt: row.accepted_at ? toIso(row.accepted_at) : "",
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : "",
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

class PostgresAuthRepository {
  constructor(pool = getPostgresPool()) {
    this.pool = pool;
    this._initPromise = null;
  }

  async _ensureInitialized() {
    await ensurePostgresReady();
    if (!this._initPromise) {
      this._initPromise = this._ensureDefaultWorkspace();
    }
    await this._initPromise;
  }

  async _query(sql, params = []) {
    await this._ensureInitialized();
    return this.pool.query(sql, params);
  }

  async _withTransaction(fn) {
    await this._ensureInitialized();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async _ensureDefaultWorkspace() {
    const existing = await this.pool.query(`SELECT id FROM workspaces WHERE id = $1 LIMIT 1`, [config.defaultWorkspaceId]);
    if (existing.rows[0]) return;
    const now = nowIso();
    let slug = slugify(config.defaultWorkspaceName);
    const bySlug = await this.pool.query(`SELECT id FROM workspaces WHERE slug = $1 LIMIT 1`, [slug]);
    if (bySlug.rows[0] && bySlug.rows[0].id !== config.defaultWorkspaceId) {
      slug = `${slug}-${String(config.defaultWorkspaceId).slice(-8)}`.slice(0, 64);
    }
    await this.pool.query(
      `INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
      [config.defaultWorkspaceId, slug, config.defaultWorkspaceName, now, now]
    );
  }

  async _getUserByEmail(email) {
    const result = await this._query(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [email]);
    return result.rows[0] || null;
  }

  async _getUserByProvider(provider, subject) {
    const result = await this._query(`SELECT * FROM users WHERE auth_provider = $1 AND provider_subject = $2 LIMIT 1`, [
      provider,
      subject,
    ]);
    return result.rows[0] || null;
  }

  async _getUserByIdRaw(userId) {
    const result = await this._query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
    return result.rows[0] || null;
  }

  async _getWorkspaceById(workspaceId) {
    const result = await this._query(`SELECT * FROM workspaces WHERE id = $1 LIMIT 1`, [workspaceId]);
    return result.rows[0] || null;
  }

  async _getWorkspaceBySlug(slug) {
    const result = await this._query(`SELECT * FROM workspaces WHERE slug = $1 LIMIT 1`, [slug]);
    return result.rows[0] || null;
  }

  async _getMembership(userId, workspaceId) {
    const result = await this._query(
      `SELECT * FROM workspace_memberships WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
      [userId, workspaceId]
    );
    return result.rows[0] || null;
  }

  async getSession(token) {
    const normalized = String(token || "").trim();
    if (!normalized) return null;
    const result = await this._query(
      `
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
        WHERE s.token = $1
        LIMIT 1
      `,
      [normalized]
    );
    const row = result.rows[0];
    if (!row) return null;
    const expiresAtMs = Date.parse(toIso(row.expires_at));
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      await this._query(`DELETE FROM sessions WHERE token = $1`, [normalized]);
      return null;
    }
    return mapSessionRow(row);
  }

  async ensureWorkspace({ workspaceId = "", workspaceName = "" } = {}) {
    const normalizedId = String(workspaceId || "").trim();
    if (normalizedId) {
      const existing = await this._getWorkspaceById(normalizedId);
      if (existing) return existing;
      const now = nowIso();
      const name = String(workspaceName || config.defaultWorkspaceName).trim() || config.defaultWorkspaceName;
      let slug = slugify(name);
      const existingBySlug = await this._getWorkspaceBySlug(slug);
      if (existingBySlug && existingBySlug.id !== normalizedId) {
        slug = `${slug}-${normalizedId.slice(-8)}`.slice(0, 64);
      }
      await this._query(
        `INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
        [normalizedId, slug, name, now, now]
      );
      return this._getWorkspaceById(normalizedId);
    }

    const normalizedName = String(workspaceName || "").trim();
    if (!normalizedName) {
      return this._getWorkspaceById(config.defaultWorkspaceId);
    }
    const existingBySlug = await this._getWorkspaceBySlug(slugify(normalizedName));
    if (existingBySlug) return existingBySlug;

    const now = nowIso();
    const id = `ws_${crypto.randomUUID()}`;
    await this._query(
      `INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
      [id, slugify(normalizedName), normalizedName.slice(0, 120), now, now]
    );
    return this._getWorkspaceById(id);
  }

  async ensureUser({ email, name = "" }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) {
      throw new Error("Valid email is required");
    }
    const existing = await this._getUserByEmail(normalizedEmail);
    if (existing) return existing;
    const now = nowIso();
    const id = `user_${crypto.randomUUID()}`;
    const displayName = normalizeDisplayName(name, normalizedEmail);
    await this._query(
      `
        INSERT INTO users (
          id, email, display_name, password_hash, password_updated_at,
          auth_provider, provider_subject, created_at, updated_at
        ) VALUES ($1, $2, $3, NULL, NULL, $4, NULL, $5::timestamptz, $6::timestamptz)
      `,
      [id, normalizedEmail, displayName, "local", now, now]
    );
    return this._getUserByIdRaw(id);
  }

  async _setUserPassword(userId, password) {
    const passwordHash = hashPassword(password);
    const now = nowIso();
    await this._query(
      `UPDATE users SET password_hash = $1, password_updated_at = $2::timestamptz, updated_at = $3::timestamptz WHERE id = $4`,
      [passwordHash, now, now, userId]
    );
  }

  async registerUser({ email, name = "", password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) {
      throw new AuthError("Valid email is required", 400);
    }
    const normalizedName = normalizeDisplayName(name, normalizedEmail);
    const validPassword = validatePassword(password);
    const existing = await this._getUserByEmail(normalizedEmail);

    if (existing?.password_hash) {
      throw new AuthError("An account with that email already exists", 409);
    }

    if (existing && !existing.password_hash) {
      const now = nowIso();
      await this._query(`UPDATE users SET display_name = $1, updated_at = $2::timestamptz WHERE id = $3`, [
        normalizedName,
        now,
        existing.id,
      ]);
      await this._setUserPassword(existing.id, validPassword);
      if (!existing.auth_provider) {
        await this._query(
          `UPDATE users SET auth_provider = $1, provider_subject = NULL, updated_at = $2::timestamptz WHERE id = $3`,
          ["local", now, existing.id]
        );
      }
      return this._getUserByIdRaw(existing.id);
    }

    const now = nowIso();
    const id = `user_${crypto.randomUUID()}`;
    await this._query(
      `
        INSERT INTO users (
          id, email, display_name, password_hash, password_updated_at,
          auth_provider, provider_subject, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6, NULL, $7::timestamptz, $8::timestamptz)
      `,
      [id, normalizedEmail, normalizedName, hashPassword(validPassword), now, "local", now, now]
    );
    return this._getUserByIdRaw(id);
  }

  async authenticateUser({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) {
      throw new AuthError("Valid email is required", 400);
    }
    const normalizedPassword = normalizePassword(password);
    if (!normalizedPassword) {
      throw new AuthError("Password is required", 400);
    }
    const user = await this._getUserByEmail(normalizedEmail);
    if (!user?.password_hash || !verifyPassword(normalizedPassword, user.password_hash)) {
      throw new AuthError("Invalid email or password", 401);
    }
    return user;
  }

  async _ensureMembershipTx(client, { userId, workspaceId, role = "member" }) {
    const existing = await client.query(
      `SELECT * FROM workspace_memberships WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
      [userId, workspaceId]
    );
    if (existing.rows[0]) return existing.rows[0];
    const now = nowIso();
    const id = `wm_${crypto.randomUUID()}`;
    await client.query(
      `
        INSERT INTO workspace_memberships (id, user_id, workspace_id, role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
        ON CONFLICT (user_id, workspace_id) DO NOTHING
      `,
      [id, userId, workspaceId, normalizeWorkspaceRole(role), now, now]
    );
    const after = await client.query(
      `SELECT * FROM workspace_memberships WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
      [userId, workspaceId]
    );
    return after.rows[0] || null;
  }

  async ensureMembership({ userId, workspaceId, role = "member" }) {
    return this._withTransaction((client) => this._ensureMembershipTx(client, { userId, workspaceId, role }));
  }

  async listWorkspacesForUser(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return [];
    const result = await this._query(
      `
        SELECT
          m.workspace_id,
          m.role,
          m.created_at,
          w.slug,
          w.name AS workspace_name
        FROM workspace_memberships m
        JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = $1
        ORDER BY m.created_at ASC
      `,
      [normalizedUserId]
    );
    return result.rows.map((row) => ({
      id: row.workspace_id,
      slug: row.slug,
      name: row.workspace_name,
      role: row.role || "member",
      joinedAt: toIso(row.created_at),
    }));
  }

  async listWorkspaceMembers(workspaceId, { limit = 200 } = {}) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return [];
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const result = await this._query(
      `
        SELECT
          m.user_id,
          m.workspace_id,
          m.role,
          m.created_at,
          u.email,
          u.display_name
        FROM workspace_memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1
        ORDER BY
          CASE m.role
            WHEN 'owner' THEN 1
            WHEN 'admin' THEN 2
            ELSE 3
          END ASC,
          m.created_at ASC
        LIMIT $2
      `,
      [normalizedWorkspaceId, boundedLimit]
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      workspaceId: row.workspace_id,
      role: normalizeWorkspaceRole(row.role || "member"),
      email: row.email || "",
      name: row.display_name || "",
      joinedAt: toIso(row.created_at),
    }));
  }

  async _resolveWorkspaceForUser(userId, preferredWorkspaceId = "") {
    const preferred = String(preferredWorkspaceId || "").trim();
    if (preferred) {
      const membership = await this._getMembership(userId, preferred);
      if (membership) {
        const workspace = await this._getWorkspaceById(preferred);
        if (workspace) {
          return { workspace, role: membership.role || "member" };
        }
      }
    }
    const result = await this._query(
      `
        SELECT w.*, m.role
        FROM workspaces w
        JOIN workspace_memberships m ON m.workspace_id = w.id
        WHERE m.user_id = $1
        ORDER BY CASE WHEN w.id = $2 THEN 0 ELSE 1 END, m.created_at ASC
        LIMIT 1
      `,
      [userId, config.defaultWorkspaceId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { workspace: row, role: row.role || "member" };
  }

  async _createWorkspace({ name, id = "" } = {}) {
    const workspaceName = String(name || "").trim().slice(0, 120) || "Workspace";
    const workspaceId = String(id || "").trim() || `ws_${crypto.randomUUID()}`;
    const now = nowIso();
    let slug = slugify(workspaceName);
    let suffix = 0;
    while (true) {
      const existing = await this._getWorkspaceBySlug(slug);
      if (!existing || existing.id === workspaceId) break;
      suffix += 1;
      const base = slugify(workspaceName).slice(0, 56) || "workspace";
      slug = `${base}-${suffix}`;
    }
    await this._query(
      `INSERT INTO workspaces (id, slug, name, created_at, updated_at) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
      [workspaceId, slug, workspaceName, now, now]
    );
    return this._getWorkspaceById(workspaceId);
  }

  async ensurePersonalWorkspaceForUser(user) {
    const existingContext = await this._resolveWorkspaceForUser(user.id, config.defaultWorkspaceId);
    if (existingContext?.workspace?.id && existingContext.workspace.id !== config.defaultWorkspaceId) {
      return existingContext.workspace;
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
    const workspace = await this._createWorkspace({ name: workspaceName });
    await this.ensureMembership({
      userId: user.id,
      workspaceId: workspace.id,
      role: "owner",
    });
    return workspace;
  }

  async buildActorForUser(user, { preferredWorkspaceId = "", emailVerified = true } = {}) {
    if (!user?.id) {
      throw new AuthError("Missing user for actor", 400);
    }
    let workspaceContext = await this._resolveWorkspaceForUser(user.id, preferredWorkspaceId);
    if (!workspaceContext) {
      const workspace = await this.ensurePersonalWorkspaceForUser(user);
      const membership = await this.ensureMembership({ userId: user.id, workspaceId: workspace.id, role: "owner" });
      workspaceContext = { workspace, role: membership?.role || "owner" };
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

  async buildActorForUserId(userId, { preferredWorkspaceId = "", emailVerified = true } = {}) {
    const normalizedUserId = String(userId || "").trim();
    const user = await this._getUserByIdRaw(normalizedUserId);
    if (!user) {
      throw new AuthError("User not found", 404);
    }
    return this.buildActorForUser(user, { preferredWorkspaceId, emailVerified });
  }

  async upsertProviderUser({ provider, subject, email, name = "" } = {}) {
    const normalizedProvider = normalizeProvider(provider);
    const normalizedSubject = String(subject || "").trim();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedSubject) throw new AuthError("Missing provider subject", 400);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) throw new AuthError("Valid email is required", 400);
    const normalizedName = normalizeDisplayName(name, normalizedEmail);
    const now = nowIso();

    const byProvider = await this._getUserByProvider(normalizedProvider, normalizedSubject);
    if (byProvider) {
      if (byProvider.email !== normalizedEmail || byProvider.display_name !== normalizedName) {
        try {
          await this._query(`UPDATE users SET email = $1, display_name = $2, updated_at = $3::timestamptz WHERE id = $4`, [
            normalizedEmail,
            normalizedName,
            now,
            byProvider.id,
          ]);
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            throw new AuthError("This email is already linked to another account", 409);
          }
          throw error;
        }
      }
      return this._getUserByIdRaw(byProvider.id);
    }

    const byEmail = await this._getUserByEmail(normalizedEmail);
    if (byEmail) {
      const existingProvider = normalizeProvider(byEmail.auth_provider || "local");
      const existingSubject = String(byEmail.provider_subject || "").trim();
      if (existingSubject && (existingProvider !== normalizedProvider || existingSubject !== normalizedSubject)) {
        throw new AuthError("This email is already linked to another sign-in method", 409);
      }
      await this._query(
        `UPDATE users SET auth_provider = $1, provider_subject = $2, display_name = $3, updated_at = $4::timestamptz WHERE id = $5`,
        [normalizedProvider, normalizedSubject, normalizedName, now, byEmail.id]
      );
      return this._getUserByIdRaw(byEmail.id);
    }

    const id = `user_${crypto.randomUUID()}`;
    try {
      await this._query(
        `
          INSERT INTO users (
            id, email, display_name, password_hash, password_updated_at,
            auth_provider, provider_subject, created_at, updated_at
          ) VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6::timestamptz, $7::timestamptz)
        `,
        [id, normalizedEmail, normalizedName, normalizedProvider, normalizedSubject, now, now]
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AuthError("An account with that email already exists", 409);
      }
      throw error;
    }
    return this._getUserByIdRaw(id);
  }

  async resolveFirebaseActorFromClaims(claims = {}, { preferredWorkspaceId = "" } = {}) {
    const subject = String(claims.uid || claims.user_id || claims.sub || "").trim();
    const email = normalizeEmail(claims.email || "");
    const name = String(claims.name || claims.displayName || "").trim();
    const emailVerified = Boolean(claims.email_verified);
    if (!subject) throw new AuthError("Invalid Firebase token: missing subject", 401);
    if (!email || !isEmailLike(email)) throw new AuthError("Firebase account must include a valid email", 401);

    const user = await this.upsertProviderUser({
      provider: "firebase",
      subject,
      email,
      name,
    });
    return this.buildActorForUser(user, { preferredWorkspaceId, emailVerified });
  }

  async recordAuthEvent({
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
    await this._query(
      `
        INSERT INTO auth_events (
          id, event_type, outcome, provider, user_id, workspace_id, email, ip, reason, metadata_json, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz)
      `,
      [
        id,
        String(eventType || "auth.unknown").slice(0, 120),
        String(outcome || "unknown").slice(0, 32),
        String(provider || "").slice(0, 40) || null,
        String(userId || "").trim() || null,
        String(workspaceId || "").trim() || null,
        normalizeEmail(email) || null,
        String(ip || "").slice(0, 120) || null,
        String(reason || "").slice(0, 400) || null,
        metadata ? JSON.stringify(metadata) : null,
        createdAt,
      ]
    );
    return { id, createdAt };
  }

  async listAuthEventsForWorkspace(workspaceId, limit = 100) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return [];
    const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const result = await this._query(
      `
        SELECT * FROM auth_events
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [normalizedWorkspaceId, normalizedLimit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      outcome: row.outcome,
      provider: row.provider || "",
      userId: row.user_id || "",
      workspaceId: row.workspace_id || "",
      email: row.email || "",
      ip: row.ip || "",
      reason: row.reason || "",
      metadata: row.metadata_json || null,
      createdAt: toIso(row.created_at),
    }));
  }

  async revokeAllSessionsForUser(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return { revoked: 0 };
    const result = await this._query(`DELETE FROM sessions WHERE user_id = $1`, [normalizedUserId]);
    return { revoked: Number(result.rowCount || 0) };
  }

  async changeLocalPassword({ userId, currentPassword, newPassword } = {}) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) throw new AuthError("Missing user id", 400);
    const user = await this._getUserByIdRaw(normalizedUserId);
    if (!user) throw new AuthError("User not found", 404);
    if (!user.password_hash) throw new AuthError("Password change is not available for this account", 400);
    if (!verifyPassword(currentPassword, user.password_hash)) {
      throw new AuthError("Current password is incorrect", 401);
    }
    const validNew = validatePassword(newPassword);
    await this._setUserPassword(normalizedUserId, validNew);
    await this.revokeAllSessionsForUser(normalizedUserId);
    return { ok: true };
  }

  async deleteUserAccount(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) throw new AuthError("Missing user id", 400);
    const existing = await this._getUserByIdRaw(normalizedUserId);
    if (!existing) throw new AuthError("User not found", 404);
    await this._withTransaction(async (client) => {
      await client.query(`DELETE FROM sessions WHERE user_id = $1`, [normalizedUserId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [normalizedUserId]);
    });
    return { deleted: true };
  }

  async createWorkspaceInvite({ workspaceId, email, role = "member", invitedByUserId, expiresInHours = 72 } = {}) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    const normalizedInvitedBy = String(invitedByUserId || "").trim();
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedWorkspaceId) throw new AuthError("Missing workspace id", 400);
    if (!normalizedInvitedBy) throw new AuthError("Missing inviter user id", 400);
    if (!normalizedEmail || !isEmailLike(normalizedEmail)) throw new AuthError("Valid email is required", 400);

    const workspace = await this._getWorkspaceById(normalizedWorkspaceId);
    if (!workspace) throw new AuthError("Workspace not found", 404);

    const invitee = await this._getUserByEmail(normalizedEmail);
    if (invitee) {
      const membership = await this._getMembership(invitee.id, normalizedWorkspaceId);
      if (membership) {
        throw new AuthError("User is already a workspace member", 409);
      }
    }

    const now = nowIso();
    const expiresAt = new Date(Date.now() + Math.max(1, Number(expiresInHours) || 72) * 60 * 60 * 1000).toISOString();
    const id = `wi_${crypto.randomUUID()}`;
    const token = `inv_${crypto.randomUUID().replace(/-/g, "")}`;
    await this._query(
      `
        INSERT INTO workspace_invites (
          id, token, workspace_id, email, role, invited_by_user_id, status,
          expires_at, accepted_by_user_id, accepted_at, revoked_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'pending',
          $7::timestamptz, NULL, NULL, NULL, $8::timestamptz, $9::timestamptz
        )
      `,
      [id, token, normalizedWorkspaceId, normalizedEmail, normalizeWorkspaceRole(role), normalizedInvitedBy, expiresAt, now, now]
    );
    return this.getWorkspaceInviteById(id);
  }

  async getWorkspaceInviteByToken(token) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken) return null;
    const result = await this._query(`SELECT * FROM workspace_invites WHERE token = $1 LIMIT 1`, [normalizedToken]);
    return result.rows[0] || null;
  }

  async getWorkspaceInviteById(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    const result = await this._query(`SELECT * FROM workspace_invites WHERE id = $1 LIMIT 1`, [normalizedId]);
    return mapInviteRow(result.rows[0]);
  }

  async _getWorkspaceInviteByIdRaw(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) return null;
    const result = await this._query(`SELECT * FROM workspace_invites WHERE id = $1 LIMIT 1`, [normalizedId]);
    return result.rows[0] || null;
  }

  async listWorkspaceInvites(workspaceId, { status = "", limit = 100 } = {}) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return [];
    const normalizedStatus = String(status || "").trim().toLowerCase() || null;
    const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const result = await this._query(
      `
        SELECT * FROM workspace_invites
        WHERE workspace_id = $1
          AND ($2::text IS NULL OR status = $2)
        ORDER BY created_at DESC
        LIMIT $3
      `,
      [normalizedWorkspaceId, normalizedStatus, normalizedLimit]
    );
    return result.rows.map(mapInviteRow);
  }

  async listIncomingWorkspaceInvites(email, limit = 100) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return [];
    const normalizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const result = await this._query(
      `
        SELECT * FROM workspace_invites
        WHERE email = $1 AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [normalizedEmail, normalizedLimit]
    );
    return result.rows.map(mapInviteRow);
  }

  async acceptWorkspaceInvite({ token, userId, userEmail } = {}) {
    const invite = await this.getWorkspaceInviteByToken(token);
    if (!invite) throw new AuthError("Invite not found", 404);
    if (String(invite.status || "").toLowerCase() !== "pending") {
      throw new AuthError("Invite is no longer active", 400);
    }
    if (Date.parse(toIso(invite.expires_at)) <= Date.now()) {
      throw new AuthError("Invite has expired", 400);
    }
    const normalizedUserEmail = normalizeEmail(userEmail);
    if (!normalizedUserEmail || normalizedUserEmail !== normalizeEmail(invite.email)) {
      throw new AuthError("Invite email does not match current account", 403);
    }
    const normalizedUserId = String(userId || "").trim();
    const now = nowIso();

    await this._withTransaction(async (client) => {
      await this._ensureMembershipTx(client, {
        userId: normalizedUserId,
        workspaceId: invite.workspace_id,
        role: normalizeWorkspaceRole(invite.role || "member"),
      });
      await client.query(
        `UPDATE workspace_invites SET status = 'accepted', accepted_by_user_id = $1, accepted_at = $2::timestamptz, updated_at = $3::timestamptz WHERE id = $4`,
        [normalizedUserId, now, now, invite.id]
      );
    });

    return this.getWorkspaceInviteById(invite.id);
  }

  async revokeWorkspaceInvite({ id, workspaceId } = {}) {
    const invite = await this._getWorkspaceInviteByIdRaw(id);
    if (!invite) throw new AuthError("Invite not found", 404);
    if (String(invite.workspace_id || "") !== String(workspaceId || "")) {
      throw new AuthError("Invite does not belong to this workspace", 403);
    }
    if (String(invite.status || "").toLowerCase() !== "pending") {
      return mapInviteRow(invite);
    }
    const now = nowIso();
    await this._query(
      `UPDATE workspace_invites SET status = 'revoked', revoked_at = $1::timestamptz, updated_at = $2::timestamptz WHERE id = $3`,
      [now, now, invite.id]
    );
    return this.getWorkspaceInviteById(invite.id);
  }

  async issueSession({ email, name = "", user = null } = {}) {
    const sessionUser = user || (await this.ensureUser({ email, name }));
    const actor = await this.buildActorForUser(sessionUser, { emailVerified: true });
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + config.authSessionTtlDays * 24 * 60 * 60 * 1000).toISOString();
    const token = `sess_${crypto.randomUUID()}`;
    await this._query(
      `INSERT INTO sessions (token, user_id, workspace_id, created_at, expires_at) VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)`,
      [token, actor.userId, actor.workspaceId, createdAt, expiresAt]
    );
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

  async signUpAndIssueSession({ email, name = "", password } = {}) {
    const user = await this.registerUser({ email, name, password });
    return this.issueSession({ user });
  }

  async loginAndIssueSession({ email, password } = {}) {
    const user = await this.authenticateUser({ email, password });
    return this.issueSession({ user });
  }

  async getUserById(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return null;
    const row = await this._getUserByIdRaw(normalizedUserId);
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

export function createPostgresAuthRepo(pool = undefined) {
  return new PostgresAuthRepository(pool);
}
