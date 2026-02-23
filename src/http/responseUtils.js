export function sendJson(res, statusCode, payload, extraHeaders = null) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    ...(extraHeaders && typeof extraHeaders === "object" ? extraHeaders : {}),
  });
  res.end(body);
}

export function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

export function sendUnauthorized(res, authProvider = "local") {
  let hint = "Sign in via POST /api/auth/login, then send Authorization: Bearer <token>";
  if (authProvider === "firebase") {
    hint = "Sign in via Firebase auth endpoint, then send Authorization: Bearer <id_token>";
  } else if (authProvider === "neon") {
    hint = "Sign in via POST /api/auth/login (Neon-backed), then send Authorization: Bearer <access_token>";
  }
  sendJson(res, 401, {
    error: "Unauthorized",
    hint,
  });
}

export function resolveErrorStatus(error, fallback = 400) {
  const candidate = Number(error?.status);
  return Number.isFinite(candidate) && candidate >= 400 && candidate <= 599 ? candidate : fallback;
}
