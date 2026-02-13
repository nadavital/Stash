import { describe, it } from "node:test";
import assert from "node:assert/strict";

class FakeClient {
  constructor() {
    this.hasMigrationsTable = false;
    this.applied = new Set();
    this.createdMigrationTable = 0;
  }

  async query(sql, params = []) {
    const normalized = String(sql).trim().toLowerCase();

    if (normalized.startsWith("create table if not exists schema_migrations")) {
      this.hasMigrationsTable = true;
      this.createdMigrationTable += 1;
      return { rows: [] };
    }

    if (normalized.startsWith("select id from schema_migrations")) {
      const id = String(params[0] || "");
      return { rows: this.applied.has(id) ? [{ id }] : [] };
    }

    if (normalized.startsWith("insert into schema_migrations")) {
      this.applied.add(String(params[0] || ""));
      return { rows: [] };
    }

    return { rows: [] };
  }
}

describe("runPostgresMigrations", () => {
  it("creates schema_migrations table", async () => {
    const client = new FakeClient();
    const mod = await import("../../src/postgres/migrate.js");

    await mod.runPostgresMigrations({
      client,
      migrations: [
        {
          id: "001_initial.sql",
          sql: "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY);",
        },
      ],
    });

    assert.equal(client.hasMigrationsTable, true);
    assert.equal(client.createdMigrationTable >= 1, true);
    assert.equal(client.applied.has("001_initial.sql"), true);
  });

  it("is idempotent when rerun", async () => {
    const client = new FakeClient();
    const mod = await import("../../src/postgres/migrate.js");
    const migrations = [
      { id: "001_initial.sql", sql: "CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY);" },
      { id: "002_tasks.sql", sql: "CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY);" },
    ];

    const first = await mod.runPostgresMigrations({ client, migrations });
    const second = await mod.runPostgresMigrations({ client, migrations });

    assert.equal(first.applied, 2);
    assert.equal(second.applied, 0);
    assert.equal(second.skipped, 2);
    assert.equal(client.applied.size, 2);
  });
});
