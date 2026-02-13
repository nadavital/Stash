import fs from "node:fs";
import path from "node:path";
import { config, ROOT_DIR } from "./config.js";

const IDENTITY_TOOLKIT_BASE_URL = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_BASE_URL = "https://securetoken.googleapis.com/v1";
const FIREBASE_ADMIN_IMPORT_TIMEOUT_MS = Math.max(
  250,
  Number(process.env.FIREBASE_ADMIN_IMPORT_TIMEOUT_MS || 1500) || 1500
);

class FirebaseAuthError extends Error {
  constructor(message, status = 400, code = "firebase/auth-error") {
    super(message);
    this.name = "FirebaseAuthError";
    this.status = status;
    this.code = code;
  }
}

function withTimeout(promise, ms, message, code = "firebase/admin-timeout") {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new FirebaseAuthError(message, 500, code)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function parseServiceAccount() {
  const rawJson = String(config.firebaseServiceAccountJson || "").trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      throw new FirebaseAuthError("Invalid FIREBASE_SERVICE_ACCOUNT_JSON", 500, "firebase/invalid-config");
    }
  }

  const rawPath = String(config.firebaseServiceAccountPath || "").trim();
  if (!rawPath) return null;

  const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(ROOT_DIR, rawPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new FirebaseAuthError("FIREBASE_SERVICE_ACCOUNT_PATH file not found", 500, "firebase/missing-config");
  }

  try {
    return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch {
    throw new FirebaseAuthError("Could not parse FIREBASE_SERVICE_ACCOUNT_PATH JSON", 500, "firebase/invalid-config");
  }
}

let cachedFirebaseAdminAuthClientPromise = null;

async function createFirebaseAdminAuthClient() {
  if (config.authProvider !== "firebase") return null;

  const [{ applicationDefault, cert, getApps, initializeApp }, { getAuth }] = await withTimeout(
    Promise.all([import("firebase-admin/app"), import("firebase-admin/auth")]),
    FIREBASE_ADMIN_IMPORT_TIMEOUT_MS,
    "Firebase Admin SDK import timed out",
    "firebase/admin-import-timeout"
  );

  const existing = getApps()[0];
  if (existing) return getAuth(existing);

  const serviceAccount = parseServiceAccount();
  const app = initializeApp({
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
    projectId: config.firebaseProjectId || undefined,
  });

  return getAuth(app);
}

async function getFirebaseAdminAuthClient({ optional = false } = {}) {
  if (config.authProvider !== "firebase") return null;
  if (!cachedFirebaseAdminAuthClientPromise) {
    cachedFirebaseAdminAuthClientPromise = createFirebaseAdminAuthClient();
  }
  try {
    return await cachedFirebaseAdminAuthClientPromise;
  } catch (error) {
    if (optional) {
      cachedFirebaseAdminAuthClientPromise = null;
      return null;
    }
    throw error;
  }
}

function assertFirebaseWebApiKey() {
  if (!config.firebaseWebApiKey) {
    throw new FirebaseAuthError(
      "FIREBASE_WEB_API_KEY is required for Firebase email/password auth",
      500,
      "firebase/missing-config"
    );
  }
}

function getFirebaseErrorMessage(code = "") {
  const normalized = String(code || "").trim();
  switch (normalized) {
    case "EMAIL_EXISTS":
      return "An account with that email already exists";
    case "EMAIL_NOT_FOUND":
    case "INVALID_PASSWORD":
    case "INVALID_LOGIN_CREDENTIALS":
      return "Invalid email or password";
    case "USER_DISABLED":
      return "This account is disabled";
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
      return "Too many attempts. Try again later";
    case "WEAK_PASSWORD : Password should be at least 6 characters":
    case "WEAK_PASSWORD":
      return "Password must be at least 6 characters";
    case "INVALID_ID_TOKEN":
      return "Invalid or expired session";
    case "TOKEN_EXPIRED":
      return "Session expired. Please sign in again";
    case "INVALID_REFRESH_TOKEN":
      return "Invalid refresh token";
    default:
      return normalized ? normalized.replace(/_/g, " ").toLowerCase() : "Firebase auth request failed";
  }
}

function getFirebaseErrorStatus(code = "") {
  const normalized = String(code || "").trim();
  if (["EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS"].includes(normalized)) {
    return 401;
  }
  if (["INVALID_ID_TOKEN", "TOKEN_EXPIRED", "INVALID_REFRESH_TOKEN", "USER_DISABLED"].includes(normalized)) {
    return 401;
  }
  if (normalized === "EMAIL_EXISTS") return 409;
  if (normalized.startsWith("WEAK_PASSWORD")) return 400;
  if (normalized === "TOO_MANY_ATTEMPTS_TRY_LATER") return 429;
  return 400;
}

async function postFirebaseJson(pathname, payload) {
  assertFirebaseWebApiKey();

  const url = `${IDENTITY_TOOLKIT_BASE_URL}/${pathname}?key=${encodeURIComponent(config.firebaseWebApiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(body?.error?.message || "").trim();
    throw new FirebaseAuthError(getFirebaseErrorMessage(code), getFirebaseErrorStatus(code), code || "firebase/request-failed");
  }

  return body;
}

export function isFirebaseConfigured() {
  if (config.authProvider !== "firebase") return false;
  if (!config.firebaseWebApiKey) return false;

  try {
    if (config.firebaseServiceAccountJson || config.firebaseServiceAccountPath) {
      parseServiceAccount();
    }
    return true;
  } catch {
    return false;
  }
}

async function lookupFirebaseUserByIdToken(idToken) {
  const normalizedToken = String(idToken || "").trim();
  if (!normalizedToken) {
    throw new FirebaseAuthError("Missing auth token", 401, "firebase/missing-token");
  }
  const payload = await postFirebaseJson("accounts:lookup", {
    idToken: normalizedToken,
  });
  const user = Array.isArray(payload?.users) ? payload.users[0] : null;
  if (!user || !user.localId) {
    throw new FirebaseAuthError("Invalid or expired session", 401, "firebase/invalid-token");
  }
  return user;
}

export async function verifyFirebaseIdToken(idToken) {
  const user = await lookupFirebaseUserByIdToken(idToken);
  const uid = String(user.localId || "").trim();
  return {
    uid,
    user_id: uid,
    sub: uid,
    email: String(user.email || "").trim(),
    name: String(user.displayName || "").trim(),
    email_verified: Boolean(user.emailVerified),
    provider_id: "firebase",
  };
}

export async function firebaseSignUpWithEmailPassword({ email, password, name = "" }) {
  return postFirebaseJson("accounts:signUp", {
    email: String(email || "").trim(),
    password: String(password || ""),
    displayName: String(name || "").trim(),
    returnSecureToken: true,
  });
}

export async function firebaseSignInWithEmailPassword({ email, password }) {
  return postFirebaseJson("accounts:signInWithPassword", {
    email: String(email || "").trim(),
    password: String(password || ""),
    returnSecureToken: true,
  });
}

export async function firebaseSendPasswordResetEmail({ email }) {
  return postFirebaseJson("accounts:sendOobCode", {
    requestType: "PASSWORD_RESET",
    email: String(email || "").trim(),
  });
}

export async function firebaseSendEmailVerification({ idToken }) {
  return postFirebaseJson("accounts:sendOobCode", {
    requestType: "VERIFY_EMAIL",
    idToken: String(idToken || "").trim(),
  });
}

export async function firebaseChangePassword({ idToken, newPassword }) {
  const normalizedPassword = String(newPassword || "");
  if (!normalizedPassword || normalizedPassword.length < 8) {
    throw new FirebaseAuthError("Password must be at least 8 characters", 400, "firebase/weak-password");
  }

  return postFirebaseJson("accounts:update", {
    idToken: String(idToken || "").trim(),
    password: normalizedPassword,
    returnSecureToken: true,
  });
}

export async function firebaseRefreshIdToken(refreshToken) {
  assertFirebaseWebApiKey();
  const normalizedToken = String(refreshToken || "").trim();
  if (!normalizedToken) {
    throw new FirebaseAuthError("Missing refresh token", 400, "firebase/missing-refresh-token");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: normalizedToken,
  }).toString();

  const url = `${SECURE_TOKEN_BASE_URL}/token?key=${encodeURIComponent(config.firebaseWebApiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload?.error?.message || payload?.error || "").trim();
    throw new FirebaseAuthError(getFirebaseErrorMessage(code), getFirebaseErrorStatus(code), code || "firebase/refresh-failed");
  }

  return {
    idToken: String(payload.id_token || "").trim(),
    refreshToken: String(payload.refresh_token || "").trim(),
    expiresIn: Number(payload.expires_in || 0),
    userId: String(payload.user_id || "").trim(),
  };
}

export async function revokeFirebaseUserSessions(uid) {
  const normalizedUid = String(uid || "").trim();
  if (!normalizedUid) {
    throw new FirebaseAuthError("Missing user id", 400, "firebase/missing-user-id");
  }
  const auth = await getFirebaseAdminAuthClient({ optional: true });
  if (!auth) {
    return { ok: false, reason: "admin-sdk-unavailable" };
  }
  await auth.revokeRefreshTokens(normalizedUid);
  return { ok: true };
}

export async function deleteFirebaseUser(uid, { idToken = "" } = {}) {
  const normalizedUid = String(uid || "").trim();
  const auth = await getFirebaseAdminAuthClient({ optional: true });

  if (normalizedUid && auth) {
    await auth.deleteUser(normalizedUid);
    return { ok: true, via: "admin" };
  }

  const normalizedToken = String(idToken || "").trim();
  if (normalizedToken) {
    await postFirebaseJson("accounts:delete", { idToken: normalizedToken });
    return { ok: true, via: "id-token" };
  }

  if (!normalizedUid) {
    throw new FirebaseAuthError("Missing user id", 400, "firebase/missing-user-id");
  }
  throw new FirebaseAuthError(
    "Firebase Admin SDK unavailable and no id token provided for delete",
    501,
    "firebase/admin-unavailable"
  );
}

export { FirebaseAuthError };
