const TASK_SPEC_VERSION = "1";

const OUTPUT_MODE_SINGLE_NOTE = "single_note";
const OUTPUT_MODE_PER_ITEM_NOTES = "per_item_notes";

function asText(value = "", { max = 300, fallback = "" } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, max);
}

function normalizeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

function normalizePositiveInt(value, fallback, { min = 1, max = 1000 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function normalizeStringArray(values, { maxItems = 20, maxLen = 120 } = {}) {
  const source = Array.isArray(values) ? values : [];
  const output = [];
  const seen = new Set();
  for (const item of source) {
    const normalized = asText(item, { max: maxLen });
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= maxItems) break;
  }
  return output;
}

function inferIntent({ title = "", prompt = "" } = {}) {
  const text = `${asText(title, { max: 200 })}\n${asText(prompt, { max: 1000 })}`.toLowerCase();
  if (/(digest|headline|news|top stories|roundup)/i.test(text)) return "news_digest";
  if (/(cleanup|archive|dedupe|remove duplicates)/i.test(text)) return "cleanup";
  if (/(sync|mirror|import|ingest)/i.test(text)) return "sync";
  return "generic";
}

function inferNewsLikeSpec({ title = "", prompt = "" } = {}) {
  const text = `${asText(title, { max: 200 })}\n${asText(prompt, { max: 1000 })}`.toLowerCase();
  return /(digest|headline|news|top stories|roundup|the verge|reuters|bloomberg|techcrunch)/i.test(text);
}

function normalizeIntent(value, fallback = "generic") {
  const normalized = asText(value, { max: 64 }).toLowerCase().replace(/[^a-z0-9_:-]/g, "_");
  return normalized || fallback;
}

function normalizeSourceMode(value, fallback = "workspace") {
  const normalized = asText(value, { max: 32 }).toLowerCase();
  if (normalized === "workspace" || normalized === "web" || normalized === "mixed") return normalized;
  return fallback;
}

function normalizeOutputMode(value, fallback = OUTPUT_MODE_SINGLE_NOTE) {
  const normalized = asText(value, { max: 32 }).toLowerCase();
  if (normalized === OUTPUT_MODE_SINGLE_NOTE || normalized === OUTPUT_MODE_PER_ITEM_NOTES) return normalized;
  return fallback;
}

function normalizeDedupeStrategy(value, fallback = "by_title_date") {
  const normalized = asText(value, { max: 32 }).toLowerCase();
  if (normalized === "by_url" || normalized === "by_title_date" || normalized === "none") return normalized;
  return fallback;
}

function normalizeDedupeScope(value, fallback = "folder") {
  const normalized = asText(value, { max: 32 }).toLowerCase();
  if (normalized === "folder" || normalized === "workspace") return normalized;
  return fallback;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function buildDefaultTaskSpec(context = {}) {
  const title = asText(context.title, { max: 180 });
  const prompt = asText(context.prompt, { max: 2000 });
  const scopeFolder = asText(context.scopeFolder || context.project, { max: 120 });
  const inferredIntent = inferIntent({ title, prompt });
  const isNewsLike = inferNewsLikeSpec({ title, prompt });
  const outputMode = isNewsLike ? OUTPUT_MODE_PER_ITEM_NOTES : OUTPUT_MODE_SINGLE_NOTE;
  const sourceMode = isNewsLike ? "web" : "workspace";
  const dedupeStrategy = sourceMode === "web" ? "by_url" : "by_title_date";

  return {
    version: TASK_SPEC_VERSION,
    intent: inferredIntent,
    source: {
      mode: sourceMode,
      query: "",
      domains: [],
      lookbackHours: isNewsLike ? 24 : null,
    },
    output: {
      mode: outputMode,
      maxItems: isNewsLike ? 12 : 8,
      includeDigestIndex: isNewsLike,
      summarySentences: 2,
    },
    destination: {
      folder: scopeFolder,
      namingPattern: "",
    },
    dedupe: {
      enabled: true,
      strategy: dedupeStrategy,
      scope: scopeFolder ? "folder" : "workspace",
    },
  };
}

export function normalizeTaskSpec(rawSpec = null, context = {}) {
  const defaults = buildDefaultTaskSpec(context);
  if (!isPlainObject(rawSpec)) {
    return defaults;
  }

  const source = isPlainObject(rawSpec.source) ? rawSpec.source : {};
  const output = isPlainObject(rawSpec.output) ? rawSpec.output : {};
  const destination = isPlainObject(rawSpec.destination) ? rawSpec.destination : {};
  const dedupe = isPlainObject(rawSpec.dedupe) ? rawSpec.dedupe : {};

  const outputMode = normalizeOutputMode(output.mode, defaults.output.mode);
  const destinationFolder = asText(
    destination.folder !== undefined ? destination.folder : defaults.destination.folder,
    { max: 120, fallback: defaults.destination.folder },
  );

  return {
    version: TASK_SPEC_VERSION,
    intent: normalizeIntent(rawSpec.intent, defaults.intent),
    source: {
      mode: normalizeSourceMode(source.mode, defaults.source.mode),
      query: asText(source.query, { max: 400 }),
      domains: normalizeStringArray(source.domains, { maxItems: 30, maxLen: 120 }),
      lookbackHours: normalizePositiveInt(source.lookbackHours, defaults.source.lookbackHours, { min: 1, max: 24 * 30 }),
    },
    output: {
      mode: outputMode,
      maxItems: normalizePositiveInt(output.maxItems, defaults.output.maxItems, { min: 1, max: 50 }),
      includeDigestIndex: normalizeBool(
        output.includeDigestIndex,
        outputMode === OUTPUT_MODE_PER_ITEM_NOTES ? true : defaults.output.includeDigestIndex,
      ),
      summarySentences: normalizePositiveInt(output.summarySentences, defaults.output.summarySentences, { min: 1, max: 6 }),
    },
    destination: {
      folder: destinationFolder,
      namingPattern: asText(destination.namingPattern, { max: 160 }),
    },
    dedupe: {
      enabled: normalizeBool(dedupe.enabled, defaults.dedupe.enabled),
      strategy: normalizeDedupeStrategy(dedupe.strategy, defaults.dedupe.strategy),
      scope: normalizeDedupeScope(dedupe.scope, destinationFolder ? "folder" : defaults.dedupe.scope),
    },
  };
}

export function taskSpecPrefersPerItemNotes(spec = null) {
  const normalized = normalizeTaskSpec(spec);
  return normalized.output.mode === OUTPUT_MODE_PER_ITEM_NOTES;
}

export const TASK_SPEC_OUTPUT_MODES = Object.freeze({
  singleNote: OUTPUT_MODE_SINGLE_NOTE,
  perItemNotes: OUTPUT_MODE_PER_ITEM_NOTES,
});

export const TASK_SPEC_VERSION_V1 = TASK_SPEC_VERSION;
