import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDatabaseUrl, resolveDatabaseUrlSource } from "../../src/databaseUrl.js";

describe("database URL resolution", () => {
  it("prefers DATABASE_URL over NEON_DATABASE_URL", () => {
    const env = {
      DATABASE_URL: "postgres://primary",
      NEON_DATABASE_URL: "postgres://neon",
    };
    assert.equal(resolveDatabaseUrl(env), "postgres://primary");
    assert.equal(resolveDatabaseUrlSource(env), "DATABASE_URL");
  });

  it("uses NEON_DATABASE_URL when DATABASE_URL is missing", () => {
    const env = {
      NEON_DATABASE_URL: "postgres://neon-only",
    };
    assert.equal(resolveDatabaseUrl(env), "postgres://neon-only");
    assert.equal(resolveDatabaseUrlSource(env), "NEON_DATABASE_URL");
  });

  it("returns empty string when neither URL is set", () => {
    const env = {};
    assert.equal(resolveDatabaseUrl(env), "");
    assert.equal(resolveDatabaseUrlSource(env), "");
  });

  it("trims whitespace values", () => {
    const env = {
      DATABASE_URL: "   ",
      NEON_DATABASE_URL: "  postgres://trim-me  ",
    };
    assert.equal(resolveDatabaseUrl(env), "postgres://trim-me");
    assert.equal(resolveDatabaseUrlSource(env), "NEON_DATABASE_URL");
  });
});
