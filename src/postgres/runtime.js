import { getPostgresPool } from "./pool.js";
import { migratePostgresFromDisk } from "./migrate.js";

let initPromise = null;

export function resetPostgresRuntimeForTests() {
  initPromise = null;
}

export async function ensurePostgresReady() {
  if (!initPromise) {
    initPromise = (async () => {
      const pool = getPostgresPool();
      const client = await pool.connect();
      try {
        await migratePostgresFromDisk({ client });
      } finally {
        client.release();
      }
    })();
  }
  return initPromise;
}
