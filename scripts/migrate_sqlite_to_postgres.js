import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../src/config.js";
import { getPostgresPool, closePostgresPool } from "../src/postgres/pool.js";

function parseArgs(argv) {
  const args = {
    sqlitePath: config.dbPath,
    tasksSqlitePath: config.tasksDbPath,
    chunkSize: 500,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--sqlite" && argv[i + 1]) {
      args.sqlitePath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--tasks-sqlite" && argv[i + 1]) {
      args.tasksSqlitePath = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--chunk-size" && argv[i + 1]) {
      args.chunkSize = Math.max(1, Number.parseInt(argv[i + 1], 10) || 500);
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function quoteIdent(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

function readTableColumns(db, table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.map((row) => String(row.name));
}

function buildUpsertSql(table, columns, conflictKey) {
  const quotedColumns = columns.map((name) => quoteIdent(name));
  const placeholders = columns.map((_, idx) => `$${idx + 1}`);
  const updateColumns = columns.filter((column) => column !== conflictKey);
  const updateSet = updateColumns.map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
  return `
    INSERT INTO ${quoteIdent(table)} (${quotedColumns.join(", ")})
    VALUES (${placeholders.join(", ")})
    ON CONFLICT (${quoteIdent(conflictKey)}) DO UPDATE
    SET ${updateSet.join(", ")}
  `;
}

function normalizeValue(table, column, value) {
  if (value === undefined) return null;
  if (value === null) return null;

  const isJsonColumn =
    (table === "notes" && (column === "tags_json" || column === "embedding_json" || column === "metadata_json")) ||
    (table === "auth_events" && column === "metadata_json");
  if (!isJsonColumn) return value;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

async function copyTable({
  sqliteDb,
  pgClient,
  table,
  conflictKey,
  chunkSize,
  dryRun,
}) {
  const columns = readTableColumns(sqliteDb, table);
  if (columns.length === 0) {
    return { table, sourceCount: 0, copied: 0 };
  }

  const countRow = sqliteDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  const sourceCount = Number(countRow?.count || 0);
  if (sourceCount === 0 || dryRun) {
    return { table, sourceCount, copied: 0 };
  }

  const sql = buildUpsertSql(table, columns, conflictKey);
  const copyStmt = sqliteDb.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`);

  let copied = 0;
  for (let offset = 0; offset < sourceCount; offset += chunkSize) {
    const rows = copyStmt.all(chunkSize, offset);
    if (rows.length === 0) {
      continue;
    }
    for (const row of rows) {
      const values = columns.map((column) => normalizeValue(table, column, row[column]));
      await pgClient.query(sql, values);
      copied += 1;
    }
  }

  return { table, sourceCount, copied };
}

async function main() {
  const args = parseArgs(process.argv);
  const sqliteDb = new DatabaseSync(args.sqlitePath, { timeout: 5000, readOnly: true });
  const tasksDb = new DatabaseSync(args.tasksSqlitePath, { timeout: 5000, readOnly: true });
  const pool = getPostgresPool();
  const client = await pool.connect();

  const mainTables = [
    { table: "users", conflictKey: "id", db: sqliteDb },
    { table: "workspaces", conflictKey: "id", db: sqliteDb },
    { table: "workspace_memberships", conflictKey: "id", db: sqliteDb },
    { table: "notes", conflictKey: "id", db: sqliteDb },
    { table: "folders", conflictKey: "id", db: sqliteDb },
    { table: "tasks", conflictKey: "id", db: tasksDb },
    { table: "sessions", conflictKey: "token", db: sqliteDb },
    { table: "workspace_invites", conflictKey: "id", db: sqliteDb },
    { table: "auth_events", conflictKey: "id", db: sqliteDb },
  ];

  try {
    const totals = [];
    for (const tableConfig of mainTables) {
      const row = await copyTable({
        sqliteDb: tableConfig.db,
        pgClient: client,
        table: tableConfig.table,
        conflictKey: tableConfig.conflictKey,
        chunkSize: args.chunkSize,
        dryRun: args.dryRun,
      });
      totals.push(row);
      process.stdout.write(
        `${args.dryRun ? "planned" : "copied"} ${row.table}: source=${row.sourceCount}, written=${row.copied}\n`
      );
    }

    const copiedRows = totals.reduce((sum, row) => sum + row.copied, 0);
    const sourceRows = totals.reduce((sum, row) => sum + row.sourceCount, 0);
    process.stdout.write(`copied rows: ${copiedRows} (source rows: ${sourceRows}, dry-run: ${args.dryRun})\n`);
  } finally {
    client.release();
    sqliteDb.close();
    tasksDb.close();
    await closePostgresPool();
  }
}

main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  await closePostgresPool().catch(() => {});
  process.exit(1);
});
