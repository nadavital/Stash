import { config } from "./config.js";

let firebaseAuthModulePromise = null;

async function loadFirebaseAuthModule() {
  if (!firebaseAuthModulePromise) {
    firebaseAuthModulePromise = import("./firebaseAuth.js");
  }
  return firebaseAuthModulePromise;
}

export async function isFirebaseConfigured() {
  if (config.authProvider !== "firebase") return false;
  try {
    const mod = await loadFirebaseAuthModule();
    return mod.isFirebaseConfigured();
  } catch {
    return false;
  }
}

export async function verifyFirebaseIdToken(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.verifyFirebaseIdToken(...args);
}

export async function firebaseSignUpWithEmailPassword(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.firebaseSignUpWithEmailPassword(...args);
}

export async function firebaseSignInWithEmailPassword(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.firebaseSignInWithEmailPassword(...args);
}

export async function firebaseSendPasswordResetEmail(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.firebaseSendPasswordResetEmail(...args);
}

export async function firebaseSendEmailVerification(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.firebaseSendEmailVerification(...args);
}

export async function firebaseChangePassword(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.firebaseChangePassword(...args);
}

export async function firebaseRefreshIdToken(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.firebaseRefreshIdToken(...args);
}

export async function revokeFirebaseUserSessions(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.revokeFirebaseUserSessions(...args);
}

export async function deleteFirebaseUser(...args) {
  const mod = await loadFirebaseAuthModule();
  return mod.deleteFirebaseUser(...args);
}
