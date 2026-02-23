import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApiRuntime } from "../../src/serverRuntime/createApiRuntime.js";

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    ended: false,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end() {
      this.ended = true;
    },
  };
}

describe("createApiRuntime", () => {
  it("builds runtime contract for server bootstrap", () => {
    const runtime = createApiRuntime({
      startedAt: Date.now(),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    assert.equal(typeof runtime.handleApi, "function");
    assert.equal(typeof runtime.providerName, "string");
    assert.equal(typeof runtime.storageBridgeMode, "string");
    assert.equal(typeof runtime.hasOpenAI, "function");
    assert.equal(typeof runtime.enrichmentQueue.start, "function");
  });

  it("handles OPTIONS preflight through api handler", async () => {
    const runtime = createApiRuntime({
      startedAt: Date.now(),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    const req = { method: "OPTIONS", headers: {} };
    const res = createRes();
    const url = new URL("http://localhost/api/chat");

    await runtime.handleApi(req, res, url);
    assert.equal(res.statusCode, 204);
    assert.equal(res.ended, true);
  });
});
