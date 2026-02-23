import crypto from "node:crypto";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;
const SCRYPT_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64,
  maxmem: 64 * 1024 * 1024,
});

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isEmailLike(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeDisplayName(name, email) {
  const normalized = String(name || "").trim();
  if (normalized) return normalized.slice(0, 120);
  const local = normalizeEmail(email).split("@")[0] || "user";
  return local.slice(0, 120);
}

export function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "workspace";
}

export function normalizePassword(password) {
  return String(password || "");
}

export function validatePassword(password) {
  const normalized = normalizePassword(password);
  if (!normalized || normalized.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, 400);
  }
  if (normalized.length > PASSWORD_MAX_LENGTH) {
    throw new AuthError(`Password must be ${PASSWORD_MAX_LENGTH} characters or fewer`, 400);
  }
  return normalized;
}

export function hashPassword(password) {
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

export function verifyPassword(password, encodedHash) {
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

export function mapSessionRow(row) {
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

export function normalizeProvider(provider) {
  const normalized = String(provider || "").trim().toLowerCase();
  return normalized || "local";
}

export function normalizeWorkspaceRole(role = "member") {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin" || normalized === "member") {
    return normalized;
  }
  return "member";
}

export function isUniqueConstraintError(error) {
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
