import { Pool } from "pg";
import { config } from "../config.js";
import { logger } from "../logger.js";

let cachedPool = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  return new Pool({
    connectionString,
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
