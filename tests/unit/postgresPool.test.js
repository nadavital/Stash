import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPostgresPool } from "../../src/postgres/pool.js";

const TEST_DB_URL = "postgres://user:pass@localhost:5432/stash_test";

async function withTempEnv(updates, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(updates || {})) {
    previous.set(key, process.env[key]);
    if (value === null || value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe("createPostgresPool SSL config", () => {
  it("enables SSL for PG_SSL_MODE=require", async () => {
    await withTempEnv({ PG_SSL_MODE: "require", PGSSLMODE: null, PG_SSL: null }, async () => {
      const pool = createPostgresPool({ databaseUrl: TEST_DB_URL });
      try {
        assert.equal(pool.options.ssl?.rejectUnauthorized, false);
      } finally {
        await pool.end();
      }
    });
  });

  it("enables strict verification for PG_SSL_MODE=verify-full", async () => {
    await withTempEnv({ PG_SSL_MODE: "verify-full", PGSSLMODE: null, PG_SSL: null }, async () => {
      const pool = createPostgresPool({ databaseUrl: TEST_DB_URL });
      try {
        assert.equal(pool.options.ssl?.rejectUnauthorized, true);
      } finally {
        await pool.end();
      }
    });
  });

  it("infers SSL from DATABASE_URL sslmode=require", async () => {
    await withTempEnv({ PG_SSL_MODE: null, PGSSLMODE: null, PG_SSL: null }, async () => {
      const pool = createPostgresPool({
        databaseUrl: "postgres://user:pass@db.example.com:5432/stash_test?sslmode=require",
      });
      try {
        assert.equal(pool.options.ssl?.rejectUnauthorized, false);
      } finally {
        await pool.end();
      }
    });
  });

  it("disables SSL when PG_SSL_MODE=disable", async () => {
    await withTempEnv({ PG_SSL_MODE: "disable", PGSSLMODE: null, PG_SSL: null }, async () => {
      const pool = createPostgresPool({
        databaseUrl: "postgres://user:pass@db.example.com:5432/stash_test?sslmode=require",
      });
      try {
        assert.equal(pool.options.ssl, undefined);
      } finally {
        await pool.end();
      }
    });
  });
});
