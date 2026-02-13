import { getPostgresPool, closePostgresPool } from "../src/postgres/pool.js";

const REQUIRED_TABLES = [
  "schema_migrations",
  "notes",
  "tasks",
  "folders",
  "users",
  "workspaces",
  "workspace_memberships",
  "sessions",
  "workspace_invites",
  "auth_events",
];

const REQUIRED_INDEXES = [
  "idx_notes_workspace_created",
  "idx_tasks_workspace_status",
  "idx_folders_workspace_name",
  "idx_sessions_expires",
  "idx_workspace_invites_workspace",
  "idx_auth_events_workspace",
];

async function verifySchema() {
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    const tableRows = await client.query(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      `
    );
    const tableSet = new Set(tableRows.rows.map((row) => String(row.table_name || "")));
    const missingTables = REQUIRED_TABLES.filter((name) => !tableSet.has(name));

    const indexRows = await client.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      `
    );
    const indexSet = new Set(indexRows.rows.map((row) => String(row.indexname || "")));
    const missingIndexes = REQUIRED_INDEXES.filter((name) => !indexSet.has(name));

    if (missingTables.length > 0 || missingIndexes.length > 0) {
      const messages = [];
      if (missingTables.length > 0) {
        messages.push(`missing tables: ${missingTables.join(", ")}`);
      }
      if (missingIndexes.length > 0) {
        messages.push(`missing indexes: ${missingIndexes.join(", ")}`);
      }
      throw new Error(messages.join("; "));
    }

    process.stdout.write("schema verification: ok\n");
  } finally {
    client.release();
    await closePostgresPool();
  }
}

verifySchema().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  closePostgresPool().catch(() => {});
  process.exit(1);
});
