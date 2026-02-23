export function createHttpRequestHandler({
  checkRate,
  handleApi,
  requestLogger,
  config,
  PUBLIC_DIR,
  sanitizePath,
  sendText,
  serveFile,
  logger,
  sendJson,
}) {
  return async function requestHandler(req, res) {
    const reqStart = Date.now();
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

      if (url.pathname.startsWith("/api/") && req.method !== "OPTIONS") {
        const rate = checkRate(req);
        if (!rate.allowed) {
          res.writeHead(429, {
            "Content-Type": "application/json; charset=utf-8",
            "Retry-After": String(rate.retryAfter),
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ error: "Too many requests", retryAfter: rate.retryAfter }));
          requestLogger(req, res, reqStart);
          return;
        }
      }

      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        requestLogger(req, res, reqStart);
        return;
      }

      if (url.pathname.startsWith("/uploads/")) {
        const relative = url.pathname.replace(/^\/uploads\//, "");
        const absolutePath = sanitizePath(config.uploadDir, relative);
        if (!absolutePath) {
          sendText(res, 403, "Forbidden");
          return;
        }
        await serveFile(res, absolutePath);
        return;
      }

      const routePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const absolutePath = sanitizePath(PUBLIC_DIR, routePath);
      if (!absolutePath) {
        sendText(res, 403, "Forbidden");
        return;
      }

      await serveFile(res, absolutePath);
    } catch (error) {
      logger.error("request_error", {
        method: req.method,
        url: req.url,
        error: error instanceof Error ? error.message : String(error),
      });
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  };
}
