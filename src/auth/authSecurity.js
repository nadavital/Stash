const AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_CAPTCHA_THRESHOLD = 8;

export function createAuthFailureTracker({
  windowMs = AUTH_FAILURE_WINDOW_MS,
  captchaThreshold = AUTH_CAPTCHA_THRESHOLD,
} = {}) {
  const authFailureByIp = new Map();

  function getAuthFailureStatus(ip) {
    const normalizedIp = String(ip || "unknown").trim() || "unknown";
    const now = Date.now();
    const entries = (authFailureByIp.get(normalizedIp) || []).filter((ts) => now - ts < windowMs);
    if (entries.length > 0) {
      authFailureByIp.set(normalizedIp, entries);
    } else {
      authFailureByIp.delete(normalizedIp);
    }
    return {
      count: entries.length,
      requiresCaptcha: entries.length >= captchaThreshold,
    };
  }

  function registerAuthFailure(ip) {
    const normalizedIp = String(ip || "unknown").trim() || "unknown";
    const now = Date.now();
    const entries = (authFailureByIp.get(normalizedIp) || []).filter((ts) => now - ts < windowMs);
    entries.push(now);
    authFailureByIp.set(normalizedIp, entries);
    return {
      count: entries.length,
      requiresCaptcha: entries.length >= captchaThreshold,
    };
  }

  function clearAuthFailures(ip) {
    const normalizedIp = String(ip || "unknown").trim() || "unknown";
    authFailureByIp.delete(normalizedIp);
  }

  return {
    getAuthFailureStatus,
    registerAuthFailure,
    clearAuthFailures,
  };
}
