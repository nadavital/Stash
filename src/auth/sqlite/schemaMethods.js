import crypto from "node:crypto";
import { config } from "../../config.js";
import { nowIso, slugify } from "./utils.js";

export const schemaMethods = {
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
  },

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
  },

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
  },

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
  },

  listWorkspaceMembers(workspaceId, { limit = 100 } = {}) {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return [];

    const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
    const rows = this.db
      .prepare(
        `SELECT
           u.id,
           u.email,
           u.display_name,
           m.role,
           m.created_at,
           m.updated_at
         FROM workspace_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ?
         ORDER BY
           CASE m.role
             WHEN 'owner' THEN 0
             WHEN 'admin' THEN 1
             ELSE 2
           END,
           datetime(m.created_at) ASC
         LIMIT ?`
      )
      .all(normalizedWorkspaceId, normalizedLimit);

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      role: row.role || "member",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },
};
