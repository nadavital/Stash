const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MAX_REQUESTS = 60;

export function createRateLimiter({
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
} = {}) {
  const clients = new Map();

  // Cleanup stale entries every 2 minutes
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of clients) {
      const filtered = timestamps.filter((t) => now - t < windowMs);
      if (filtered.length === 0) {
        clients.delete(ip);
      } else {
        clients.set(ip, filtered);
      }
    }
  }, 2 * 60 * 1000);
  cleanup.unref();

  return function checkRate(req) {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";

    const now = Date.now();
    let timestamps = clients.get(ip);
    if (!timestamps) {
      timestamps = [];
      clients.set(ip, timestamps);
    }

    // Remove entries outside the window
    while (timestamps.length > 0 && now - timestamps[0] >= windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= maxRequests) {
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    timestamps.push(now);
    return { allowed: true };
  };
}
