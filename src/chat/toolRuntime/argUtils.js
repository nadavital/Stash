export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizeChatSourceType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return "";
  if (normalized === "url" || normalized === "link") return "link";
  if (normalized === "file" || normalized === "image") return normalized;
  if (normalized === "manual" || normalized === "text") return "text";
  return "";
}

export function normalizeStringArray(rawValue, max = 50) {
  const values = Array.isArray(rawValue) ? rawValue : [];
  const output = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    output.push(normalized);
    if (output.length >= max) break;
  }
  return output;
}

export function normalizeSingleSentence(value, maxLen = 140) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const firstQuestion = text.match(/[^?]{1,300}\?/);
  if (firstQuestion?.[0]) {
    return firstQuestion[0].trim().slice(0, maxLen);
  }
  const firstSentence = text.split(/[.!](?:\s|$)/)[0] || text;
  return firstSentence.trim().slice(0, maxLen);
}

const MEMORY_SCOPES = new Set(["all", "workspace", "user", "project", "item"]);

export function normalizeMemoryScope(value) {
  const normalized = normalizeText(value).toLowerCase();
  return MEMORY_SCOPES.has(normalized) ? normalized : "";
}

export function normalizeWorkingSetIds(rawValue, max = 50) {
  const values = Array.isArray(rawValue) ? rawValue : [];
  const ids = [];
  const seen = new Set();
  for (const value of values) {
    const id = normalizeText(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}

export const FOLDER_ROLES = new Set(["viewer", "editor", "manager"]);

export function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (!isPlainObject(value)) return JSON.stringify(String(value));

  const keys = Object.keys(value).sort();
  const parts = [];
  for (const key of keys) {
    parts.push(`${JSON.stringify(key)}:${stableStringify(value[key])}`);
  }
  return `{${parts.join(",")}}`;
}

export function parseRawArgs(rawArgs) {
  if (typeof rawArgs === "string") {
    const trimmed = rawArgs.trim();
    if (!trimmed) return {};
    const parsed = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      throw new Error("Tool arguments must be a JSON object");
    }
    return parsed;
  }
  if (isPlainObject(rawArgs)) {
    return rawArgs;
  }
  return {};
}
