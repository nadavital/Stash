import {
  handleAuthLogin,
  handleAuthPasswordReset,
  handleAuthRefresh,
  handleAuthSignup,
} from "./publicAuthRouteHandlers.js";

const AUTH_WRITE_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/password-reset",
  "/api/auth/password-change",
  "/api/auth/email-verification/send",
]);

export async function handlePublicAuthRoutes(req, res, url, context) {
  const { requestIp, sendJson, checkAuthRate, getAuthFailureStatus } = context;

  if (req.method === "POST" && AUTH_WRITE_PATHS.has(url.pathname)) {
    const strictRate = checkAuthRate(req);
    if (!strictRate.allowed) {
      sendJson(res, 429, {
        error: "Too many authentication requests",
        retryAfter: strictRate.retryAfter,
        captchaRequired: true,
      });
      return true;
    }

    const failureStatus = getAuthFailureStatus(requestIp);
    if (failureStatus.requiresCaptcha) {
      sendJson(res, 429, {
        error: "Additional verification required before more auth attempts",
        captchaRequired: true,
      });
      return true;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    await handleAuthLogin(req, res, context);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    await handleAuthSignup(req, res, context);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-reset") {
    await handleAuthPasswordReset(req, res, context);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
    await handleAuthRefresh(req, res, context);
    return true;
  }

  return false;
}
