import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertStorageConfig } from "../../src/storage/selectProvider.js";

describe("Postgres cutover guardrails", () => {
  it("throws when postgres provider is selected without DATABASE_URL", () => {
    assert.throws(
      () =>
        assertStorageConfig({
          dbProvider: "postgres",
          databaseUrl: "",
        }),
      /DATABASE_URL/
    );
  });

  it("rejects sqlite provider fallback", () => {
    assert.throws(
      () =>
        assertStorageConfig({
          dbProvider: "sqlite",
          databaseUrl: "postgres://example:example@localhost:5432/stash",
        }),
      /SQLite support was removed/
    );
  });
});
