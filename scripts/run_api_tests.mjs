import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveDatabaseUrl } from "../src/databaseUrl.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Retry until timeout.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/health`);
}

async function stopProcess(child, timeoutMs = 3000) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");

  const deadline = Date.now() + timeoutMs;
  while (child.exitCode === null && Date.now() < deadline) {
    await sleep(100);
  }

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function ensureDatabaseUrl() {
  const databaseUrl = resolveDatabaseUrl(process.env);
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL (or NEON_DATABASE_URL) is required for API tests. Example: DATABASE_URL=postgres://user:pass@localhost:5432/stash npm test"
    );
  }
  process.env.DATABASE_URL = databaseUrl;
  return databaseUrl;
}

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const splitAt = trimmed.indexOf("=");
    if (splitAt === -1) continue;

    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadDotEnv();
  ensureDatabaseUrl();

  const port = Number(process.env.TEST_PORT || 0) || 8900 + Math.floor(Math.random() * 500);
  const baseUrl = process.env.TEST_BASE_URL || `http://127.0.0.1:${port}`;
  const serverEnv = {
    ...process.env,
    PORT: String(port),
    DB_PROVIDER: "postgres",
    AUTH_PROVIDER: "local",
  };

  const server = spawn("node", ["src/server.js"], {
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverLogs = "";
  server.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    serverLogs += text;
    process.stdout.write(text);
  });
  server.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    serverLogs += text;
    process.stderr.write(text);
  });

  let apiExitCode = 1;
  try {
    await waitForHealth(baseUrl);

    const apiTests = spawn(
      "node",
      ["--test", "tests/integration/api.test.js", "tests/integration/api.postgres.notes-tasks-folders.test.js"],
      {
        env: {
          ...process.env,
          TEST_BASE_URL: baseUrl,
          DB_PROVIDER: "postgres",
        },
        stdio: "inherit",
      }
    );

    apiExitCode = await new Promise((resolve, reject) => {
      apiTests.on("error", reject);
      apiTests.on("exit", (code) => resolve(Number(code ?? 1)));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (serverLogs.trim()) {
      process.stderr.write(`\nRecent server logs:\n${serverLogs}\n`);
    }
    apiExitCode = 1;
  } finally {
    await stopProcess(server);
  }

  process.exit(apiExitCode);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
