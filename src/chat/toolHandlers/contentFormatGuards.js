function toText(value = "") {
  return String(value || "");
}

function cleanWhitespace(value = "") {
  return toText(value)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripInternalCitationArtifacts(value = "") {
  return cleanWhitespace(
    toText(value)
      // Remove transport/meta tokens emitted by model providers (private-use Unicode).
      .replace(/\S*[\uE000-\uF8FF]\S*/g, "")
      // Remove internal citation aliases like [N1], [S2], or (N3, N4) that
      // should not leak into persisted user-facing note content.
      .replace(/\[(?:[A-Z]\d+(?:\s*,\s*[A-Z]\d+)*)\]/g, "")
      .replace(/\((?:[A-Z]\d+(?:\s*,\s*[A-Z]\d+)*)\)/g, "")
  );
}

function normalizeMime(value = "") {
  return toText(value).trim().toLowerCase();
}

function normalizeFileName(value = "") {
  return toText(value).trim().toLowerCase();
}

function detectFormat({ sourceType = "", fileMime = "", fileName = "" } = {}) {
  const normalizedSourceType = toText(sourceType).trim().toLowerCase();
  const normalizedMime = normalizeMime(fileMime);
  const normalizedFileName = normalizeFileName(fileName);

  if (normalizedMime.includes("json") || normalizedFileName.endsWith(".json")) {
    return "json";
  }
  if (
    normalizedMime.includes("markdown") ||
    normalizedFileName.endsWith(".md") ||
    normalizedFileName.endsWith(".markdown")
  ) {
    return "markdown";
  }
  if (normalizedMime.startsWith("text/") || normalizedSourceType === "text" || !normalizedMime) {
    return "markdown";
  }
  return "text";
}

function sanitizeForJson(value = "", fieldName = "content") {
  const cleaned = stripInternalCitationArtifacts(value);
  if (!cleaned) return cleaned;
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    throw new Error(`${fieldName} must be valid JSON for this file type`);
  }
}

function sanitizeField(value, format, fieldName) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (format === "json") {
    return sanitizeForJson(value, fieldName);
  }
  return stripInternalCitationArtifacts(value);
}

export function sanitizeUpdateFields(fields = {}, snapshot = null) {
  const format = detectFormat({
    sourceType: snapshot?.sourceType,
    fileMime: snapshot?.fileMime,
    fileName: snapshot?.fileName,
  });
  return {
    title: sanitizeField(fields.title, "text", "title"),
    summary: sanitizeField(fields.summary, "text", "summary"),
    content: sanitizeField(fields.content, format, "content"),
    rawContent: sanitizeField(fields.rawContent, format, "rawContent"),
    markdownContent: sanitizeField(fields.markdownContent, format, "markdownContent"),
  };
}

export function sanitizeCreateFields(fields = {}, context = null) {
  const format = detectFormat({
    sourceType: context?.sourceType,
    fileMime: context?.fileMime,
    fileName: context?.fileName,
  });
  return {
    title: sanitizeField(fields.title, "text", "title"),
    summary: sanitizeField(fields.summary, "text", "summary"),
    content: sanitizeField(fields.content, format, "content"),
  };
}
