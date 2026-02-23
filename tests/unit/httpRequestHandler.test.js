import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHttpRequestHandler } from "../../src/serverRuntime/httpRequestHandler.js";

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers || {};
    },
    end(chunk = "") {
      this.body = chunk;
    },
  };
}

function createBaseDeps() {
  return {
    checkRate: () => ({ allowed: true, retryAfter: 0 }),
    handleApi: async () => {},
    requestLogger: () => {},
    config: { uploadDir: "/tmp/uploads" },
    PUBLIC_DIR: "/tmp/public",
    sanitizePath: () => "/tmp/file",
    sendText: () => {},
    serveFile: async () => {},
    logger: { error: () => {} },
    sendJson: () => {},
  };
}

describe("createHttpRequestHandler", () => {
  it("delegates API requests and logs them", async () => {
    const calls = { api: 0, logs: 0 };
    const handler = createHttpRequestHandler({
      ...createBaseDeps(),
      handleApi: async (_req, _res, url) => {
        calls.api += 1;
        assert.equal(url.pathname, "/api/chat");
      },
      requestLogger: () => {
        calls.logs += 1;
      },
    });

    const req = { method: "GET", url: "/api/chat", headers: { host: "localhost:8787" } };
    const res = createRes();
    await handler(req, res);

    assert.equal(calls.api, 1);
    assert.equal(calls.logs, 1);
  });

  it("returns 429 when API rate limit is exceeded", async () => {
    const calls = { api: 0, logs: 0 };
    const handler = createHttpRequestHandler({
      ...createBaseDeps(),
      checkRate: () => ({ allowed: false, retryAfter: 12 }),
      handleApi: async () => {
        calls.api += 1;
      },
      requestLogger: () => {
        calls.logs += 1;
      },
    });

    const req = { method: "POST", url: "/api/chat", headers: { host: "localhost:8787" } };
    const res = createRes();
    await handler(req, res);

    assert.equal(calls.api, 0);
    assert.equal(calls.logs, 1);
    assert.equal(res.statusCode, 429);
    assert.match(String(res.body || ""), /Too many requests/);
  });

  it("rejects invalid uploads path", async () => {
    const calls = { text: 0 };
    const handler = createHttpRequestHandler({
      ...createBaseDeps(),
      sanitizePath: () => null,
      sendText: (_res, statusCode, text) => {
        calls.text += 1;
        assert.equal(statusCode, 403);
        assert.equal(text, "Forbidden");
      },
    });

    const req = { method: "GET", url: "/uploads/private", headers: { host: "localhost:8787" } };
    const res = createRes();
    await handler(req, res);

    assert.equal(calls.text, 1);
  });

  it("serves upload file when sanitized path is valid", async () => {
    const calls = { served: 0 };
    const handler = createHttpRequestHandler({
      ...createBaseDeps(),
      sanitizePath: (_base, rel) => `/tmp/uploads/${rel}`,
      serveFile: async (_res, absolutePath) => {
        calls.served += 1;
        assert.equal(absolutePath, "/tmp/uploads/file.txt");
      },
    });

    const req = { method: "GET", url: "/uploads/file.txt", headers: { host: "localhost:8787" } };
    await handler(req, createRes());
    assert.equal(calls.served, 1);
  });

  it("serves index.html for root path", async () => {
    const calls = { sanitized: null, served: null };
    const handler = createHttpRequestHandler({
      ...createBaseDeps(),
      sanitizePath: (base, rel) => {
        calls.sanitized = { base, rel };
        return "/tmp/public/index.html";
      },
      serveFile: async (_res, absolutePath) => {
        calls.served = absolutePath;
      },
    });

    const req = { method: "GET", url: "/", headers: { host: "localhost:8787" } };
    await handler(req, createRes());

    assert.deepEqual(calls.sanitized, { base: "/tmp/public", rel: "index.html" });
    assert.equal(calls.served, "/tmp/public/index.html");
  });

  it("returns 500 when request handling throws", async () => {
    const calls = { json: 0, logs: 0 };
    const handler = createHttpRequestHandler({
      ...createBaseDeps(),
      handleApi: async () => {
        throw new Error("boom");
      },
      logger: {
        error: () => {
          calls.logs += 1;
        },
      },
      sendJson: (_res, statusCode, payload) => {
        calls.json += 1;
        assert.equal(statusCode, 500);
        assert.equal(payload.error, "boom");
      },
    });

    const req = { method: "GET", url: "/api/health", headers: { host: "localhost:8787" } };
    const res = createRes();
    await handler(req, res);

    assert.equal(calls.logs, 1);
    assert.equal(calls.json, 1);
  });
});
