const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[String(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;

function emit(level, msg, data) {
  if (LEVELS[level] < currentLevel) return;
  const entry = { time: new Date().toISOString(), level, msg, ...data };
  const line = JSON.stringify(entry);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug(msg, data = {}) { emit("debug", msg, data); },
  info(msg, data = {}) { emit("info", msg, data); },
  warn(msg, data = {}) { emit("warn", msg, data); },
  error(msg, data = {}) { emit("error", msg, data); },
};

export function requestLogger(req, res, startTime) {
  const duration = Date.now() - startTime;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  logger.info("request", {
    method: req.method,
    path: url.pathname,
    status: res.statusCode,
    ms: duration,
  });
}
