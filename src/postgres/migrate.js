import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPostgresPool, closePostgresPool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, "migrations");

export async function loadPostgresMigrations(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const migrations = [];
  for (const file of files) {
    const migrationPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(migrationPath, "utf8");
    migrations.push({ id: file, sql });
  }
  return migrations;
}

export async function runPostgresMigrations({ client, migrations }) {
  if (!client || typeof client.query !== "function") {
    throw new Error("runPostgresMigrations requires a PostgreSQL client with a query(sql, params) function");
  }

  const orderedMigrations = Array.isArray(migrations) ? migrations : [];

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  let applied = 0;
  let skipped = 0;

  for (const migration of orderedMigrations) {
    const migrationId = String(migration?.id || "").trim();
    const migrationSql = String(migration?.sql || "").trim();
    if (!migrationId || !migrationSql) {
      throw new Error("Invalid migration entry: expected { id, sql }");
    }

    const existing = await client.query("SELECT id FROM schema_migrations WHERE id = $1 LIMIT 1", [migrationId]);
    if (existing.rows.length > 0) {
      skipped += 1;
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(migrationSql);
      await client.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, NOW())", [migrationId]);
      await client.query("COMMIT");
      applied += 1;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  return {
    total: orderedMigrations.length,
    applied,
    skipped,
  };
}

export async function migratePostgresFromDisk({ client, migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  const migrations = await loadPostgresMigrations(migrationsDir);
  return runPostgresMigrations({ client, migrations });
}

async function runCli() {
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    const result = await migratePostgresFromDisk({ client });
    process.stdout.write(
      `applied migrations: ${result.applied} (skipped: ${result.skipped}, total: ${result.total})\n`
    );
  } finally {
    client.release();
    await closePostgresPool();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  runCli().catch(async (error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    await closePostgresPool().catch(() => {});
    process.exit(1);
  });
}
