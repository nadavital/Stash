import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "../../src/rateLimit.js";

describe("createRateLimiter", () => {
  it("allows requests under the limit", () => {
    const checkRate = createRateLimiter({ windowMs: 1000, maxRequests: 5 });
    const req = { socket: { remoteAddress: "127.0.0.1" }, headers: {} };

    for (let i = 0; i < 5; i++) {
      const result = checkRate(req);
      assert.equal(result.allowed, true);
    }
  });

  it("blocks requests over the limit", () => {
    const checkRate = createRateLimiter({ windowMs: 60000, maxRequests: 3 });
    const req = { socket: { remoteAddress: "10.0.0.1" }, headers: {} };

    checkRate(req);
    checkRate(req);
    checkRate(req);
    const result = checkRate(req);
    assert.equal(result.allowed, false);
    assert.ok(result.retryAfter > 0);
  });

  it("tracks different IPs independently", () => {
    const checkRate = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    const req1 = { socket: { remoteAddress: "1.1.1.1" }, headers: {} };
    const req2 = { socket: { remoteAddress: "2.2.2.2" }, headers: {} };

    assert.equal(checkRate(req1).allowed, true);
    assert.equal(checkRate(req2).allowed, true);
    assert.equal(checkRate(req1).allowed, false);
    assert.equal(checkRate(req2).allowed, false);
  });

  it("uses x-forwarded-for header when available", () => {
    const checkRate = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    const req = {
      socket: { remoteAddress: "127.0.0.1" },
      headers: { "x-forwarded-for": "8.8.8.8, 10.0.0.1" },
    };

    assert.equal(checkRate(req).allowed, true);
    assert.equal(checkRate(req).allowed, false);
  });
});
