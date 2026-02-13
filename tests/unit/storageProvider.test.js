import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertStorageConfig } from "../../src/storage/selectProvider.js";

describe("storage provider selection", () => {
  it("throws clear config error when DATABASE_URL is missing", () => {
    assert.throws(
      () =>
        assertStorageConfig({
          dbProvider: "postgres",
          databaseUrl: "",
        }),
      /DATABASE_URL/
    );
  });

  it("throws when sqlite is selected", () => {
    assert.throws(
      () =>
        assertStorageConfig({
          dbProvider: "sqlite",
          databaseUrl: "postgres://example:example@localhost:5432/stash",
        }),
      /SQLite support was removed/
    );
  });

  it("selects postgres provider when DATABASE_URL is set", () => {
    const result = assertStorageConfig({
      dbProvider: "postgres",
      databaseUrl: "postgres://example:example@localhost:5432/stash",
    });
    assert.equal(result.providerName, "postgres");
  });

  it("defaults to postgres when DB_PROVIDER is unset", () => {
    const result = assertStorageConfig({
      dbProvider: "",
      databaseUrl: "postgres://example:example@localhost:5432/stash",
    });
    assert.equal(result.providerName, "postgres");
  });
});
