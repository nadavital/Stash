import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT_DIR, ".env");

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const splitAt = trimmed.indexOf("=");
    if (splitAt === -1) {
      continue;
    }
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

loadDotEnv(ENV_FILE);

const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const LEGACY_DB_PATH = path.join(DATA_DIR, "stash.db");
const LEGACY_TASKS_DB_PATH = path.join(DATA_DIR, "tasks.db");

function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseAuthProvider(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "firebase") return "firebase";
  return "local";
}

function parseDbProvider(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "postgres";
  if (normalized === "postgres") return "postgres";
  // Kept to emit a clear runtime error in storage selector.
  if (normalized === "sqlite") return "sqlite";
  return normalized;
}

function resolveDataPath(value, fallbackAbsolutePath) {
  if (!value) return fallbackAbsolutePath;
  return path.isAbsolute(value) ? value : path.resolve(ROOT_DIR, value);
}

export const config = {
  port: parsePort(process.env.PORT, 8787),
  openaiApiKey:
    process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your_key_here"
      ? process.env.OPENAI_API_KEY
      : "",
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  openaiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini",
  openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  dbProvider: parseDbProvider(process.env.DB_PROVIDER),
  databaseUrl: String(process.env.DATABASE_URL || "").trim(),
  // Legacy SQLite paths kept only for older modules/tests that are no longer primary runtime paths.
  dbPath: resolveDataPath(process.env.DB_PATH, LEGACY_DB_PATH),
  tasksDbPath: resolveDataPath(process.env.TASKS_DB_PATH, LEGACY_TASKS_DB_PATH),
  dataDir: DATA_DIR,
  uploadDir: UPLOAD_DIR,
  mcpServerName: process.env.MCP_SERVER_NAME || "stash",
  mcpServerVersion: process.env.MCP_SERVER_VERSION || "0.1.0",
  consolidatedMemoryMarkdownFile: resolveDataPath(
    process.env.CONSOLIDATED_MEMORY_MARKDOWN_FILE,
    path.join(DATA_DIR, "consolidated-memory.md")
  ),
  extractedMemoryMarkdownFile: resolveDataPath(
    process.env.EXTRACTED_MEMORY_MARKDOWN_FILE,
    path.join(DATA_DIR, "extracted-memory.md")
  ),
  defaultWorkspaceId: process.env.DEFAULT_WORKSPACE_ID || "ws_local_default",
  defaultWorkspaceName: process.env.DEFAULT_WORKSPACE_NAME || "Local Workspace",
  authSessionTtlDays: parsePort(process.env.AUTH_SESSION_TTL_DAYS, 30),
  authProvider: parseAuthProvider(process.env.AUTH_PROVIDER),
  authRequireEmailVerification: parseBool(process.env.AUTH_REQUIRE_EMAIL_VERIFICATION, true),
  firebaseProjectId: String(process.env.FIREBASE_PROJECT_ID || "").trim(),
  firebaseWebApiKey: String(process.env.FIREBASE_WEB_API_KEY || "").trim(),
  firebaseServiceAccountJson: String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim(),
  firebaseServiceAccountPath: String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim(),
};

export function publicUploadPath(fileName) {
  return `/uploads/${fileName}`;
}
