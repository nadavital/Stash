import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "./config.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_JWKS_TIMEOUT_MS = 5000;
const DEFAULT_JWKS_COOLDOWN_MS = 30000;

const jwksByUrl = new Map();

export class NeonAuthError extends Error {
  constructor(message, status = 401, code = "neon/auth-error") {
    super(message);
    this.name = "NeonAuthError";
    this.status = status;
    this.code = code;
  }
}

function validHttpStatus(value, fallback = 400) {
  const status = Number(value);
  if (Number.isFinite(status) && status >= 400 && status <= 599) return status;
  return fallback;
}

function extractErrorMessage(error, fallback = "Neon auth request failed") {
  if (!error) return fallback;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
  return fallback;
}

function extractErrorCode(error, fallback = "neon/request-failed") {
  const code = String(error?.code || "").trim();
  return code || fallback;
}

function normalizeBaseUrl(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return "";
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
    url.hash = "";
    const normalized = url.toString();
    return normalized.endsWith("/") && url.pathname === "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return "";
  }
}

function normalizeOriginUrl(value = "") {
  const normalizedBase = normalizeBaseUrl(value);
  if (!normalizedBase) return "";
  try {
    return new URL(normalizedBase).origin;
  } catch {
    return "";
  }
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  return fallback;
}

function getJwksForUrl(jwksUrl) {
  if (jwksByUrl.has(jwksUrl)) return jwksByUrl.get(jwksUrl);
  const jwks = createRemoteJWKSet(new URL(jwksUrl), {
    timeoutDuration: DEFAULT_JWKS_TIMEOUT_MS,
    cooldownDuration: DEFAULT_JWKS_COOLDOWN_MS,
  });
  jwksByUrl.set(jwksUrl, jwks);
  return jwks;
}

export function getNeonAuthRuntimeConfig(overrides = {}) {
  const baseUrl = normalizeBaseUrl(overrides.baseUrl ?? config.neonAuthBaseUrl);
  const defaultOrigin = normalizeOriginUrl(baseUrl);
  const issuer = normalizeOriginUrl(overrides.issuer ?? config.neonAuthIssuer ?? defaultOrigin) || defaultOrigin;
  const audience =
    normalizeOriginUrl(overrides.audience ?? config.neonAuthAudience ?? defaultOrigin) || defaultOrigin;
  const jwksUrl = baseUrl ? `${baseUrl}/.well-known/jwks.json` : "";
  return {
    baseUrl,
    issuer: issuer || baseUrl,
    audience: audience || baseUrl,
    jwksUrl,
  };
}

export function isNeonConfigured(overrides = {}) {
  const runtime = getNeonAuthRuntimeConfig(overrides);
  return Boolean(runtime.baseUrl && runtime.jwksUrl);
}

export function mapNeonClaimsToIdentity(claims = {}) {
  const subject = String(claims.sub || claims.user_id || claims.uid || "").trim();
  const email = normalizeEmail(claims.email || "");
  const name = String(
    claims.name || claims.display_name || claims.displayName || claims.preferred_username || claims.nickname || ""
  ).trim();
  const emailVerified = parseBoolean(claims.email_verified, true);

  if (!subject) {
    throw new NeonAuthError("Invalid Neon token: missing subject", 401, "neon/missing-subject");
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new NeonAuthError("Neon account must include a valid email", 401, "neon/missing-email");
  }

  return {
    provider: "neon",
    subject,
    email,
    name,
    emailVerified,
  };
}

function normalizeOrigin(origin = "") {
  const trimmed = String(origin || "").trim();
  if (trimmed) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // fall through to default
    }
  }
  return `http://localhost:${Number(config.port) || 8787}`;
}

function ensureRuntimeConfigured() {
  const runtime = getNeonAuthRuntimeConfig();
  if (!runtime.baseUrl) {
    throw new NeonAuthError(
      "Neon auth is not configured. Set NEON_AUTH_BASE_URL first.",
      500,
      "neon/missing-config"
    );
  }
  return runtime;
}

function extractNeonSessionCookie(setCookieHeader = "") {
  const raw = String(setCookieHeader || "").trim();
  if (!raw) return "";
  const cookieCandidates = raw.split(/,(?=\s*(?:__Secure-)?neon-auth\.session_token=)/i);
  for (const candidate of cookieCandidates) {
    const firstPair = String(candidate || "").split(";")[0].trim();
    if (/^(?:__Secure-)?neon-auth\.session_token=/i.test(firstPair)) {
      return firstPair;
    }
  }
  return "";
}

function decodeJwtExpiryIso(token = "") {
  const jwt = String(token || "").trim();
  if (!jwt) return "";
  const parts = jwt.split(".");
  if (parts.length !== 3) return "";
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    const exp = Number(payload?.exp || 0);
    if (!Number.isFinite(exp) || exp <= 0) return "";
    return new Date(exp * 1000).toISOString();
  } catch {
    return "";
  }
}

async function neonAuthRequest(path, { method = "POST", body = null, origin = "", cookie = "" } = {}) {
  const runtime = ensureRuntimeConfigured();
  const url = `${runtime.baseUrl}${path}`;
  const headers = {
    origin: normalizeOrigin(origin),
  };
  if (cookie) {
    headers.cookie = String(cookie).trim();
  }
  let encodedBody;
  if (body !== null && body !== undefined) {
    headers["content-type"] = "application/json";
    encodedBody = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: encodedBody,
    });
  } catch (error) {
    throw new NeonAuthError(
      extractErrorMessage(error, "Could not reach Neon auth service"),
      502,
      "neon/network-error"
    );
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
  }

  if (!response.ok) {
    throw new NeonAuthError(
      extractErrorMessage(payload, `Neon auth request failed (${response.status})`),
      validHttpStatus(response.status, 400),
      extractErrorCode(payload)
    );
  }
  return { response, payload };
}

async function exchangeSessionCookieForJwt({ cookie, origin }) {
  const { payload } = await neonAuthRequest("/token", {
    method: "GET",
    origin,
    cookie,
  });
  const token = String(payload?.token || "").trim();
  if (!token || token.split(".").length !== 3) {
    throw new NeonAuthError(
      "Neon auth did not return a valid access token",
      401,
      "neon/jwt-missing"
    );
  }
  return token;
}

async function neonEmailPasswordFlow(path, { email, password, name = "", origin = "" } = {}) {
  const body = path === "/sign-up/email"
    ? {
        email: String(email || "").trim(),
        password: String(password || ""),
        name: String(name || "").trim(),
      }
    : {
        email: String(email || "").trim(),
        password: String(password || ""),
      };
  const { response, payload } = await neonAuthRequest(path, {
    method: "POST",
    body,
    origin,
  });
  const sessionCookie = extractNeonSessionCookie(response.headers.get("set-cookie") || "");
  if (!sessionCookie) {
    throw new NeonAuthError(
      "Neon auth did not return a session cookie",
      401,
      "neon/session-cookie-missing"
    );
  }
  const jwt = await exchangeSessionCookieForJwt({
    cookie: sessionCookie,
    origin,
  });
  const user = payload?.user || {};
  return {
    token: jwt,
    refreshToken: "",
    expiresAt: decodeJwtExpiryIso(jwt),
    userEmail: normalizeEmail(user?.email || ""),
    userName: String(user?.name || user?.displayName || "").trim(),
    emailVerified: parseBoolean(user?.emailVerified, true),
  };
}

export async function neonSignUpWithEmailPassword({ email, password, name = "", origin = "" } = {}) {
  return neonEmailPasswordFlow("/sign-up/email", { email, password, name, origin });
}

export async function neonSignInWithEmailPassword({ email, password, origin = "" } = {}) {
  return neonEmailPasswordFlow("/sign-in/email", { email, password, origin });
}

export async function neonSendPasswordResetEmail({ email, origin = "" } = {}) {
  await neonAuthRequest("/forget-password", {
    method: "POST",
    origin,
    body: {
      email: String(email || "").trim(),
      redirectTo: `${normalizeOrigin(origin)}/auth/reset-password`,
    },
  });
  return { ok: true };
}

export async function verifyNeonAccessToken(token, overrides = {}) {
  const runtime = getNeonAuthRuntimeConfig(overrides);
  if (!runtime.baseUrl || !runtime.jwksUrl) {
    throw new NeonAuthError(
      "Neon auth is not configured. Set NEON_AUTH_BASE_URL first.",
      500,
      "neon/missing-config"
    );
  }

  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new NeonAuthError("Missing auth token", 401, "neon/missing-token");
  }

  try {
    const { payload } = await jwtVerify(normalizedToken, getJwksForUrl(runtime.jwksUrl), {
      issuer: runtime.issuer,
      audience: runtime.audience,
    });
    return payload;
  } catch (error) {
    if (error instanceof NeonAuthError) {
      throw error;
    }
    throw new NeonAuthError("Invalid or expired Neon token", 401, "neon/invalid-token");
  }
}
