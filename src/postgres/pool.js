import fs from "node:fs";
import { Pool } from "pg";
import { config } from "../config.js";
import { logger } from "../logger.js";

let cachedPool = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizeSslMode(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (["disable", "disabled", "off"].includes(normalized)) return "disable";
  if (["require", "required", "allow", "prefer"].includes(normalized)) return "require";
  if (["no-verify", "no_verify", "insecure"].includes(normalized)) return "no-verify";
  if (["verify-ca", "verify_ca"].includes(normalized)) return "verify-ca";
  if (["verify-full", "verify_full"].includes(normalized)) return "verify-full";
  return "";
}

function inferSslModeFromConnectionString(connectionString = "") {
  try {
    const parsed = new URL(connectionString);
    return normalizeSslMode(parsed.searchParams.get("sslmode") || "");
  } catch {
    return "";
  }
}

function buildSslConfig(connectionString) {
  const envMode =
    normalizeSslMode(process.env.PG_SSL_MODE || "") ||
    normalizeSslMode(process.env.PGSSLMODE || "");
  const inferredMode = inferSslModeFromConnectionString(connectionString);
  const sslMode =
    envMode ||
    (parseBoolean(process.env.PG_SSL, false) ? "require" : "") ||
    inferredMode;

  if (!sslMode || sslMode === "disable") {
    return null;
  }

  const caPath = String(process.env.PG_SSL_CA_PATH || "").trim();
  const ssl = {
    rejectUnauthorized: sslMode === "verify-ca" || sslMode === "verify-full",
  };

  if (sslMode === "no-verify") {
    ssl.rejectUnauthorized = false;
  }

  if (caPath) {
    try {
      ssl.ca = fs.readFileSync(caPath, "utf8");
      ssl.rejectUnauthorized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PG_SSL_CA_PATH could not be read: ${message}`);
    }
  }

  return ssl;
}

export function createPostgresPool({
  databaseUrl = config.databaseUrl,
  max = Number(process.env.PG_POOL_MAX || 10),
  connectionTimeoutMs = Number(process.env.PG_CONNECT_TIMEOUT_MS || 5000),
  idleTimeoutMs = Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
} = {}) {
  const connectionString = String(databaseUrl || "").trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Postgres operations");
  }

  const sslConfig = buildSslConfig(connectionString);

  return new Pool({
    connectionString,
    ...(sslConfig ? { ssl: sslConfig } : {}),
    max: Number.isFinite(max) ? max : 10,
    connectionTimeoutMillis: Number.isFinite(connectionTimeoutMs) ? connectionTimeoutMs : 5000,
    idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30000,
  });
}

export function getPostgresPool(options = {}) {
  if (!cachedPool) {
    cachedPool = createPostgresPool(options);
  }
  return cachedPool;
}

export async function withPostgresClient(
  run,
  {
    pool = getPostgresPool(),
    maxRetries = Number(process.env.PG_QUERY_MAX_RETRIES || 2),
    retryDelayMs = Number(process.env.PG_QUERY_RETRY_DELAY_MS || 120),
  } = {}
) {
  let lastError = null;
  const retries = Number.isFinite(maxRetries) ? Math.max(0, maxRetries) : 0;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const client = await pool.connect();
    try {
      return await run(client);
    } catch (error) {
      lastError = error;
      const code = String(error?.code || "");
      const transient =
        code === "57P01" ||
        code === "57P03" ||
        code === "08006" ||
        code === "08001" ||
        code === "ECONNRESET";
      if (!transient || attempt >= retries) {
        throw error;
      }
      logger.warn("postgres_retry", {
        attempt: attempt + 1,
        maxRetries: retries + 1,
        code: code || null,
        message: String(error?.message || "Unknown postgres error"),
      });
      await sleep(Number.isFinite(retryDelayMs) ? retryDelayMs : 120);
    } finally {
      client.release();
    }
  }

  throw lastError || new Error("Postgres query failed");
}

export async function closePostgresPool() {
  if (!cachedPool) return;
  await cachedPool.end();
  cachedPool = null;
}
