export function normalizeProviderName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "postgres";
  if (normalized === "postgres") return "postgres";
  if (normalized === "sqlite") return "sqlite";
  return normalized;
}

export function assertStorageConfig({ dbProvider = "postgres", databaseUrl = "" } = {}) {
  const providerName = normalizeProviderName(dbProvider);
  const normalizedDatabaseUrl = String(databaseUrl || "").trim();

  if (providerName !== "postgres") {
    throw new Error("Invalid storage config: SQLite support was removed; set DB_PROVIDER=postgres");
  }

  if (!normalizedDatabaseUrl) {
    throw new Error("Invalid storage config: DATABASE_URL is required");
  }

  return {
    providerName,
    databaseUrl: normalizedDatabaseUrl,
  };
}
