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
