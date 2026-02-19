import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveDatabaseUrl, resolveDatabaseUrlSource } from "../src/databaseUrl.js";

function formatConnectionLabel(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname || "unknown-host";
    const db = parsed.pathname?.replace(/^\//, "") || "postgres";
    return `${host}/${db}`;
  } catch {
    return "(invalid url)";
  }
}

function shouldDefaultSslRequire(databaseUrl = "", source = "") {
  if (source === "NEON_DATABASE_URL") return true;
  try {
    const parsed = new URL(databaseUrl);
    const host = String(parsed.hostname || "").toLowerCase();
    if (!host) return false;
    if (host.includes("neon.tech")) return true;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    return false;
  } catch {
    return false;
  }
}

function runNodeScript(scriptPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath], {
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} failed with exit code ${code}`));
    });
  });
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

  const databaseUrl = resolveDatabaseUrl(process.env);
  const source = resolveDatabaseUrlSource(process.env);
  if (!databaseUrl) {
    throw new Error("Missing DB URL. Set NEON_DATABASE_URL or DATABASE_URL before running db:setup:neon.");
  }

  const explicitSslMode = String(process.env.PG_SSL_MODE || "").trim();
  const defaultSslMode = shouldDefaultSslRequire(databaseUrl, source) ? "require" : "";

  const env = {
    ...process.env,
    DB_PROVIDER: "postgres",
    DATABASE_URL: databaseUrl,
    ...(explicitSslMode ? { PG_SSL_MODE: explicitSslMode } : {}),
    ...(defaultSslMode ? { PG_SSL_MODE: defaultSslMode } : {}),
  };

  process.stdout.write(
    `Using ${source || "DATABASE_URL"} for Neon setup: ${formatConnectionLabel(databaseUrl)}\n`
  );
  if (!explicitSslMode && defaultSslMode) {
    process.stdout.write("PG_SSL_MODE not set, defaulting to require for cloud Postgres.\n");
  }

  await runNodeScript("src/postgres/migrate.js", env);
  await runNodeScript("scripts/verify_postgres_schema.js", env);
  process.stdout.write("Neon setup complete.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
