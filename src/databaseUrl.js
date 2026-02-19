function normalize(value) {
  return String(value || "").trim();
}

export function resolveDatabaseUrl(env = process.env) {
  const direct = normalize(env.DATABASE_URL);
  if (direct) return direct;
  return normalize(env.NEON_DATABASE_URL);
}

export function resolveDatabaseUrlSource(env = process.env) {
  if (normalize(env.DATABASE_URL)) return "DATABASE_URL";
  if (normalize(env.NEON_DATABASE_URL)) return "NEON_DATABASE_URL";
  return "";
}
