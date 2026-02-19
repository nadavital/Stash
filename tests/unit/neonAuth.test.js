import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { isNeonConfigured, mapNeonClaimsToIdentity, verifyNeonAccessToken } from "../../src/neonAuth.js";

let privateKey;
let publicJwk;
let jwksServer;
let baseUrl = "";

async function issueToken(overrides = {}) {
  const claims = {
    email: "neon-user@example.com",
    email_verified: true,
    name: "Neon User",
    ...overrides.claims,
  };
  const token = await new SignJWT(claims)
    .setProtectedHeader({
      alg: "RS256",
      kid: String(publicJwk.kid || "test-key"),
      typ: "JWT",
    })
    .setIssuedAt()
    .setIssuer(overrides.issuer || baseUrl)
    .setAudience(overrides.audience || baseUrl)
    .setSubject(overrides.subject || "neon-user-1")
    .setExpirationTime("10m")
    .sign(privateKey);
  return token;
}

before(async () => {
  const keyPair = await generateKeyPair("RS256");
  privateKey = keyPair.privateKey;
  publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.kid = "test-key";
  publicJwk.use = "sig";
  publicJwk.alg = "RS256";

  jwksServer = http.createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      const body = JSON.stringify({ keys: [publicJwk] });
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise((resolve) => {
    jwksServer.listen(0, "127.0.0.1", resolve);
  });

  const address = jwksServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => {
    if (!jwksServer) {
      resolve();
      return;
    }
    jwksServer.close(() => resolve());
  });
});

describe("neon auth", () => {
  it("detects config from runtime overrides", () => {
    assert.equal(isNeonConfigured({ baseUrl }), true);
    assert.equal(isNeonConfigured({ baseUrl: "" }), false);
  });

  it("maps claims into provider identity", () => {
    const identity = mapNeonClaimsToIdentity({
      sub: "abc123",
      email: "USER@example.com",
      name: "Test User",
      email_verified: false,
    });
    assert.equal(identity.provider, "neon");
    assert.equal(identity.subject, "abc123");
    assert.equal(identity.email, "user@example.com");
    assert.equal(identity.name, "Test User");
    assert.equal(identity.emailVerified, false);
  });

  it("requires subject and email in claims", () => {
    assert.throws(
      () => mapNeonClaimsToIdentity({ email: "x@example.com" }),
      /missing subject/i
    );
    assert.throws(
      () => mapNeonClaimsToIdentity({ sub: "subject-only" }),
      /valid email/i
    );
  });

  it("verifies a valid neon access token", async () => {
    const token = await issueToken();
    const claims = await verifyNeonAccessToken(token, { baseUrl });
    assert.equal(claims.sub, "neon-user-1");
    assert.equal(claims.email, "neon-user@example.com");
  });

  it("rejects tokens with wrong audience", async () => {
    const token = await issueToken({ audience: "http://127.0.0.1:9" });
    await assert.rejects(
      () => verifyNeonAccessToken(token, { baseUrl }),
      /invalid or expired/i
    );
  });
});
