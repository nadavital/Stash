import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../src/config.js";
import { getPostgresPool, closePostgresPool } from "../src/postgres/pool.js";

function parseArgs(argv) {
  const args = {
    sqlitePath: config.dbPath,
    tasksSqlitePath: config.tasksDbPath,
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
    }
  }
  return args;
}

async function readPostgresCount(client, table) {
  const result = await client.query(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
  return Number(result.rows[0]?.count || 0);
}

function readSqliteCount(db, table) {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
  return Number(row?.count || 0);
}

async function main() {
  const args = parseArgs(process.argv);
  const sqliteDb = new DatabaseSync(args.sqlitePath, { timeout: 5000, readOnly: true });
  const tasksDb = new DatabaseSync(args.tasksSqlitePath, { timeout: 5000, readOnly: true });
  const pool = getPostgresPool();
  const client = await pool.connect();

  const checks = [
    { table: "users", sourceDb: sqliteDb },
    { table: "workspaces", sourceDb: sqliteDb },
    { table: "workspace_memberships", sourceDb: sqliteDb },
    { table: "notes", sourceDb: sqliteDb },
    { table: "folders", sourceDb: sqliteDb },
    { table: "tasks", sourceDb: tasksDb },
    { table: "sessions", sourceDb: sqliteDb },
    { table: "workspace_invites", sourceDb: sqliteDb },
    { table: "auth_events", sourceDb: sqliteDb },
  ];

  const mismatches = [];
  try {
    for (const check of checks) {
      const sqliteCount = readSqliteCount(check.sourceDb, check.table);
      const postgresCount = await readPostgresCount(client, check.table);
      if (sqliteCount !== postgresCount) {
        mismatches.push({
          table: check.table,
          sqliteCount,
          postgresCount,
        });
      }
      process.stdout.write(`count ${check.table}: sqlite=${sqliteCount} postgres=${postgresCount}\n`);
    }

    process.stdout.write(`parity mismatches: ${mismatches.length}\n`);
    if (mismatches.length > 0) {
      for (const mismatch of mismatches) {
        process.stdout.write(
          `mismatch ${mismatch.table}: sqlite=${mismatch.sqliteCount} postgres=${mismatch.postgresCount}\n`
        );
      }
      process.exitCode = 1;
    }
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
