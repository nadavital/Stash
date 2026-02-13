import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const BASE = process.env.TEST_BASE_URL || "http://localhost:8787";

function jsonFetch(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

const hasPostgresConfig = String(process.env.DB_PROVIDER || "").toLowerCase() === "postgres" &&
  String(process.env.DATABASE_URL || "").trim().length > 0;

describe("Postgres notes/tasks/folders parity (requires running server)", () => {
  it("reports postgres provider in health when configured", async () => {
    if (!hasPostgresConfig) return;
    const { status, body } = await jsonFetch("/api/health");
    assert.equal(status, 200);
    assert.equal(body.dbProvider, "postgres");
    assert.equal(body.dbBridgeMode, "none");
  });
});
