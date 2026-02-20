function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstString(candidates, fallback = "") {
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return fallback;
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeDate(value) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return "";
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  return [];
}

function normalizeNoteStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "pending" || normalized === "enriching" || normalized === "ready" || normalized === "failed") {
    return normalized;
  }
  return "";
}

function isGenericFilePlaceholder(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith("file:") || normalized.startsWith("uploaded file:");
}

export function normalizeSourceType(value) {
  const normalized = String(value || "text").toLowerCase().trim();
  return ["text", "link", "image", "file"].includes(normalized) ? normalized : "text";
}

export function normalizeCitationLabel(value) {
  if (!value) return null;
  const match = String(value)
    .trim()
    .toUpperCase()
    .match(/^N(\d+)$/);
  if (!match) return null;

  const index = Number(match[1]);
  if (!Number.isFinite(index) || index < 1) return null;
  return `N${index}`;
}

export function snippet(text, limit = 180) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
}

function pickPayloadArray(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  for (const key of keys) {
    const nested = payload[key];
    if (isRecord(nested) && Array.isArray(nested.items)) {
      return nested.items;
    }
  }

  return [];
}

export function normalizeNote(raw, index = 0) {
  const source = isRecord(raw) ? raw : {};
  const rawContent = firstString([source.rawContent, source.raw_content], "");
  const markdownContent = firstString([source.markdownContent, source.markdown_content], "");
  const fileName = firstString([source.fileName, source.file_name], "");
  const fileMime = firstString([source.fileMime, source.file_mime], "");
  const fileSize = toFiniteNumber(source.fileSize ?? source.file_size, 0);
  const metadata = isRecord(source.metadata)
    ? source.metadata
    : isRecord(source.metadata_json)
      ? source.metadata_json
      : {};
  const content = firstString([source.content, source.text, source.body, source.noteContent], "");
  const title = firstString(
    [
      source.title,
      source.noteTitle,
      source.note_title,
      source.documentTitle,
      source.document_title,
      source.name,
      metadata.title,
      metadata.linkTitle,
      metadata.link_title,
    ],
    ""
  );
  const sourceUrl = firstString([source.sourceUrl, source.source_url, source.url, source.link], "");
  const summary = firstString(
    [source.summary, source.aiSummary, source.excerpt, source.preview],
    snippet(rawContent || markdownContent || content || sourceUrl, 160) || "(no summary)"
  );

  return {
    id: firstString([source.id, source.noteId, source.note_id], `note-${Date.now()}-${index}`),
    title,
    content: content || sourceUrl || "",
    sourceType: normalizeSourceType(source.sourceType || source.source_type || source.kind),
    sourceUrl,
    imagePath: firstString([source.imagePath, source.image_path, source.imageUrl, source.image_url], ""),
    summary,
    tags: normalizeTags(source.tags ?? source.tagList ?? source.keywords ?? source.labels),
    project: firstString([source.project, source.projectName, source.workspace], "General"),
    fileName,
    fileMime,
    fileSize,
    rawContent,
    markdownContent,
    metadata,
    revision: Math.max(1, Math.floor(toFiniteNumber(source.revision ?? source.rev ?? source.versionRevision, 1))),
    status: normalizeNoteStatus(source.status || source.processingStatus || source.processing_status),
    createdAt: normalizeDate(source.createdAt ?? source.created_at ?? source.timestamp ?? source.time),
    updatedAt: normalizeDate(source.updatedAt ?? source.updated_at ?? source.modifiedAt ?? source.modified_at),
  };
}

export function normalizeCitation(raw, index = 0) {
  const source = isRecord(raw) ? raw : {};
  const rank = Math.max(1, Math.floor(toFiniteNumber(source.rank ?? source.position, index + 1)));
  const label = normalizeCitationLabel(source.label) || `N${rank}`;
  const notePayload = source.note || source.memory || source.item || source.document || source;

  return {
    rank,
    label,
    score: toFiniteNumber(source.score ?? source.similarity ?? source.relevance ?? source.confidence, 0),
    note: normalizeNote(notePayload, index),
  };
}

function collectCitationLabels(text, maxIndex) {
  const labels = [];
  const seen = new Set();
  for (const match of String(text || "").matchAll(/\[(N?\d+)\]/gi)) {
    const raw = String(match[1] || "").toUpperCase();
    const numeric = raw.startsWith("N") ? Number(raw.slice(1)) : Number(raw);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > maxIndex) continue;
    const label = `N${numeric}`;
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function adaptHealthResponse(payload) {
  const source = isRecord(payload) ? payload : {};
  const rawConfigured =
    source.openaiConfigured ??
    source.openai?.configured ??
    source.openai?.enabled ??
    source.features?.openai ??
    source.features?.openaiConfigured;

  let openaiConfigured = null;
  if (typeof rawConfigured === "boolean") {
    openaiConfigured = rawConfigured;
  } else if (rawConfigured === "true" || rawConfigured === "false") {
    openaiConfigured = rawConfigured === "true";
  }

  const queue = isRecord(source.queue) ? source.queue : {};
  return {
    ok: source.ok !== false,
    openaiConfigured,
    queue: {
      pending: Math.max(0, Math.floor(toFiniteNumber(queue.pending, 0))),
      running: Math.max(0, Math.floor(toFiniteNumber(queue.running, 0))),
      failed: Math.max(0, Math.floor(toFiniteNumber(queue.failed, 0))),
      queued: Math.max(0, Math.floor(toFiniteNumber(queue.queued, 0))),
      retry: Math.max(0, Math.floor(toFiniteNumber(queue.retry, 0))),
      completed: Math.max(0, Math.floor(toFiniteNumber(queue.completed, 0))),
      delayed: Math.max(0, Math.floor(toFiniteNumber(queue.delayed, 0))),
      total: Math.max(0, Math.floor(toFiniteNumber(queue.total, 0))),
    },
  };
}

export function adaptNotesResponse(payload) {
  const source = isRecord(payload) ? payload : {};
  const rawItems = pickPayloadArray(payload, ["items", "notes", "results", "data", "documents"]);
  const items = rawItems.map((entry, index) => normalizeCitation(entry, index));

  return {
    items,
    count: Math.max(0, Math.floor(toFiniteNumber(source.count ?? source.total ?? source.totalCount ?? source.meta?.count, items.length))),
    offset: Math.max(0, Math.floor(toFiniteNumber(source.offset, 0))),
    limit: Math.max(0, Math.floor(toFiniteNumber(source.limit, 20))),
    hasMore: typeof source.hasMore === "boolean" ? source.hasMore : false,
  };
}

export function adaptAnswerResponse(payload, kind = "chat") {
  const source = isRecord(payload) ? payload : {};
  let rawCitations = pickPayloadArray(payload, ["citations", "sources", "evidence", "items"]);
  if (!rawCitations.length) {
    rawCitations = pickPayloadArray(source.data, ["citations", "sources", "evidence", "items"]);
  }

  const citations = rawCitations.map((entry, index) => normalizeCitation(entry, index));

  const textCandidates =
    kind === "context"
      ? [source.context, source.answer, source.text, source.output, source.message, source.data?.context, source.data?.answer]
      : [source.answer, source.text, source.output, source.message, source.context, source.data?.answer, source.data?.text];

  const text = firstString(textCandidates, kind === "context" ? "No context generated" : "No answer");
  const providedLabels = Array.isArray(source.usedCitationLabels)
    ? source.usedCitationLabels
    : Array.isArray(source.used_citation_labels)
      ? source.used_citation_labels
      : [];

  const normalizedProvided = providedLabels.map((label) => normalizeCitationLabel(label)).filter(Boolean);
  const inferred = collectCitationLabels(text, citations.length);
  let rawWebSources = pickPayloadArray(payload, ["webSources", "web_sources"]);
  if (!rawWebSources.length) {
    rawWebSources = pickPayloadArray(source.data, ["webSources", "web_sources"]);
  }
  const webSources = rawWebSources
    .map((entry) => {
      const value = isRecord(entry) ? entry : {};
      const url = firstString([value.url, value.sourceUrl, value.source_url], "");
      const title = firstString([value.title, value.name], "");
      return url ? { url, title } : null;
    })
    .filter(Boolean)
    .slice(0, 16);

  return {
    text,
    citations,
    webSources,
    mode: firstString([source.mode, source.provider, source.strategy], "unknown"),
    usedCitationLabels: normalizedProvided.length ? normalizedProvided : inferred,
  };
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function guessTags(text, limit = 4) {
  const stopWords = new Set(["with", "this", "that", "from", "into", "have", "will", "your", "about", "project"]);
  const counts = new Map();

  tokenize(text).forEach((token) => {
    if (token.length < 4 || stopWords.has(token)) return;
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

export function createMockSeedNotes() {
  const now = Date.now();
  return [
    {
      id: "mock-launch-checklist",
      content: "Launch checklist drafted: pricing page copy, onboarding tour, and signup QA for the production web app.",
      summary: "Launch checklist includes pricing copy, onboarding, and signup QA.",
      tags: ["launch", "onboarding", "qa"],
      project: "launch",
      sourceType: "text",
      sourceUrl: "",
      imagePath: "",
      createdAt: new Date(now - 1000 * 60 * 50).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 50).toISOString(),
    },
    {
      id: "mock-mcp-sync",
      content: "Keep MCP and OpenClaw tools aligned with the same create/search/context behavior.",
      summary: "Tool surfaces should share one memory contract.",
      tags: ["mcp", "openclaw", "contract"],
      project: "platform",
      sourceType: "text",
      sourceUrl: "",
      imagePath: "",
      createdAt: new Date(now - 1000 * 60 * 120).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 120).toISOString(),
    },
    {
      id: "mock-ui-stream",
      content: "Stream cards should stay compact. Full details can open in a separate focused surface.",
      summary: "Use compact stream previews with on-demand detail.",
      tags: ["ui", "stream", "cards"],
      project: "frontend",
      sourceType: "text",
      sourceUrl: "",
      imagePath: "",
      createdAt: new Date(now - 1000 * 60 * 240).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 240).toISOString(),
    },
  ];
}

export function filterAndRankMockNotes(mockNotes, { query, project, limit = 40 } = {}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const normalizedProject = String(project || "").trim().toLowerCase();
  const queryTokens = tokenize(normalizedQuery);
  const list = Array.isArray(mockNotes) ? mockNotes : [];

  const scored = list
    .filter((note) => {
      if (!normalizedProject) return true;
      return String(note.project || "").toLowerCase().includes(normalizedProject);
    })
    .map((note) => {
      if (!normalizedQuery) {
        return { note, score: 1 };
      }

      const haystack = `${note.content} ${note.summary} ${(note.tags || []).join(" ")} ${note.project || ""}`.toLowerCase();
      let overlap = 0;
      queryTokens.forEach((token) => {
        if (haystack.includes(token)) overlap += 1;
      });

      if (overlap === 0) return null;
      return {
        note,
        score: overlap / Math.max(1, queryTokens.length),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const createdA = Date.parse(a.note.createdAt || "") || 0;
      const createdB = Date.parse(b.note.createdAt || "") || 0;
      if (b.score !== a.score) return b.score - a.score;
      return createdB - createdA;
    })
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 40)));

  return scored.map((entry, index) => ({
    rank: index + 1,
    label: `N${index + 1}`,
    score: entry.score,
    note: normalizeNote(entry.note, index),
  }));
}

export function buildLocalFallbackNote(payload) {
  const now = new Date().toISOString();
  const content =
    String(payload.content || "").trim() ||
    (payload.fileName ? `File: ${payload.fileName}` : "") ||
    String(payload.sourceUrl || "").trim() ||
    "Image memory";
  const project = String(payload.project || "").trim() || "General";

  return {
    id: `local-${Date.now()}`,
    content,
    sourceType: normalizeSourceType(payload.sourceType),
    sourceUrl: String(payload.sourceUrl || "").trim(),
    imagePath: payload.sourceType === "image" ? String(payload.imageDataUrl || "") : "",
    summary: snippet(content, 160) || "Saved in local fallback mode",
    tags: guessTags(`${content} ${project}`),
    project,
    status: "ready",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildMockChatAnswer(mockNotes, question, project) {
  const citations = filterAndRankMockNotes(mockNotes, { query: question, project, limit: 6 });
  if (citations.length === 0) {
    return {
      text: "Not enough local memory yet. Save a few notes and retry your question.",
      citations: [],
      usedCitationLabels: [],
    };
  }

  const lines = citations.slice(0, 4).map((entry) => `- [${entry.label}] ${entry.note.summary || snippet(entry.note.content, 120)}`);

  return {
    text: ["Local fallback answer:", ...lines].join("\n"),
    citations,
    usedCitationLabels: citations.slice(0, 4).map((entry) => entry.label),
  };
}

export function buildMockContext(mockNotes, task, project) {
  const citations = filterAndRankMockNotes(mockNotes, { query: task || "recent", project, limit: 8 });
  if (citations.length === 0) {
    return {
      text: "No local context is available yet.",
      citations: [],
      usedCitationLabels: [],
    };
  }

  return {
    text: citations.map((entry) => `[${entry.label}] ${entry.note.summary || snippet(entry.note.content, 120)}`).join("\n"),
    citations,
    usedCitationLabels: citations.map((entry) => entry.label),
  };
}

export function conciseTechnicalError(error, contextLabel) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const compact = raw.replace(/\s+/g, " ").trim();

  if (!compact) return contextLabel;
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(compact)) {
    return `${contextLabel}: network request failed`;
  }

  return `${contextLabel}: ${compact.slice(0, 140)}`;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultilineText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function truncateText(text, maxChars = 180) {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}...`;
}

function stripMarkdownTitleSyntax(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownHeadingTitle(value) {
  const lines = String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match?.[1]) {
      const primaryHeading = String(match[1]).split(/\s#{1,6}\s+/)[0];
      const cleaned = stripMarkdownTitleSyntax(primaryHeading);
      if (cleaned) return cleaned;
    }
  }
  return "";
}

export function buildNoteTitle(note) {
  const contentRaw = String(note.content || "").trim();
  const content = normalizeText(contentRaw);
  const summaryRaw = String(note.summary || "").trim();
  const markdownRaw = String(note.markdownContent || "").trim();
  const rawContentRaw = String(note.rawContent || "").trim();
  const explicitTitle = stripMarkdownTitleSyntax(
    note.title || note.metadata?.title || note.metadata?.linkTitle || note.metadata?.documentTitle || note.metadata?.name || ""
  );
  const fallbackContent = summaryRaw || markdownRaw || rawContentRaw;
  const isFilePlaceholder = isGenericFilePlaceholder(content);
  const maxTitleLength = 84;

  // If the "title" is actually a URL, compact it instead of showing raw
  if (explicitTitle) {
    if (/^https?:\/\//i.test(explicitTitle)) {
      return compactUrl(explicitTitle, maxTitleLength) || explicitTitle;
    }
    return truncateText(explicitTitle, maxTitleLength);
  }

  if (!content && note.sourceType === "image") return "Image memory";
  if ((!content || isFilePlaceholder) && fallbackContent) {
    const headingCandidate = markdownHeadingTitle(fallbackContent);
    const cleanedFallback = stripMarkdownTitleSyntax(fallbackContent);
    const sentenceMatch = cleanedFallback.match(/^(.{10,130}?[.!?])(\s|$)/);
    const candidate = headingCandidate || (sentenceMatch ? sentenceMatch[1] : cleanedFallback);
    return truncateText(candidate, maxTitleLength);
  }
  if (!content && note.fileName) return truncateText(note.fileName, maxTitleLength);
  if (!content) return "Untitled memory";
  if (note.sourceType === "link") {
    const fallbackUrl = note.sourceUrl || content;
    return compactUrl(fallbackUrl, maxTitleLength) || "Saved link";
  }

  const headingCandidate = markdownHeadingTitle(contentRaw);
  const cleanedContent = stripMarkdownTitleSyntax(contentRaw);
  const sentenceMatch = cleanedContent.match(/^(.{10,130}?[.!?])(\s|$)/);
  const candidate = headingCandidate || (sentenceMatch ? sentenceMatch[1] : cleanedContent);
  return truncateText(candidate, maxTitleLength);
}

export function buildContentPreview(note) {
  const content = normalizeText(note.content);
  const summary = normalizeText(note.summary);
  const extracted = normalizeText(note.markdownContent || note.rawContent || "");
  const isFilePlaceholder = isGenericFilePlaceholder(content);
  const contentIsUrl = /^https?:\/\//i.test(content);
  const title = buildNoteTitle(note);

  function dedup(text) {
    // Don't return preview text that just repeats the title
    if (!text) return "";
    const t = normalizeText(text);
    if (t.toLowerCase() === title.toLowerCase()) return "";
    if (t.toLowerCase().startsWith(title.toLowerCase()) && t.length < title.length + 10) return "";
    return truncateText(t, 220);
  }

  // For links: prefer summary/extracted over showing raw URL as "preview"
  if (content && !isFilePlaceholder && !contentIsUrl) { const r = dedup(content); if (r) return r; }
  if (summary && summary.toLowerCase() !== "(no summary)" && !/^https?:\/\//i.test(summary)) { const r = dedup(summary); if (r) return r; }
  if (extracted) { const r = dedup(extracted); if (r) return r; }
  if (content && !contentIsUrl) { const r = dedup(content); if (r) return r; }
  if (note.fileName) return `File: ${truncateText(note.fileName, 180)}`;
  if (note.sourceType === "image") return "Image capture with no text description.";
  return "";
}

export function buildNoteDescription(note) {
  const summary = normalizeMultilineText(note.summary);
  const extracted = normalizeMultilineText(note.markdownContent || note.rawContent || "");
  const content = normalizeMultilineText(note.content);
  const sourceUrl = normalizeMultilineText(note.sourceUrl);
  const blocks = [];

  if (summary && summary.toLowerCase() !== "(no summary)") {
    blocks.push(summary);
  }
  if (extracted) {
    blocks.push(extracted);
  }
  if (content && !isGenericFilePlaceholder(content)) {
    blocks.push(content);
  }
  if (!blocks.length && sourceUrl) {
    blocks.push(sourceUrl);
  }

  const deduped = [];
  const seen = new Set();
  blocks.forEach((block) => {
    const key = normalizeText(block).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    deduped.push(block);
  });

  if (!deduped.length) {
    return "No AI description available yet.";
  }

  if (sourceUrl) {
    deduped.push(`Source: ${sourceUrl}`);
  }

  return deduped.join("\n\n");
}

export function buildSummaryPreview(note, maxChars = 180) {
  const summary = normalizeText(note.summary);
  if (!summary || summary.toLowerCase() === "(no summary)") {
    return "No AI notes yet.";
  }
  return truncateText(summary, maxChars);
}

export function formatScore(score) {
  if (typeof score !== "number") return "";
  return `score ${score.toFixed(3)}`;
}

export function formatMeta(note, detailed = false) {
  const parts = [];
  if (note.sourceType) parts.push(note.sourceType);
  if (note.project) parts.push(`project: ${note.project}`);
  if (note.createdAt) {
    const created = new Date(note.createdAt);
    if (!Number.isNaN(created.getTime())) {
      parts.push(detailed ? created.toLocaleString() : created.toLocaleDateString());
    }
  }
  if (detailed && note.updatedAt && note.updatedAt !== note.createdAt) {
    const updated = new Date(note.updatedAt);
    if (!Number.isNaN(updated.getTime())) {
      parts.push(`updated ${updated.toLocaleString()}`);
    }
  }
  return parts.join(" • ");
}

export function compactUrl(urlString, maxLen = 52) {
  if (!urlString) return "";
  try {
    const parsed = new URL(urlString);
    const normalized = `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "");
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, maxLen - 3)}...`;
  } catch {
    const normalized = String(urlString);
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, maxLen - 3)}...`;
  }
}

export function formatSourceText(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return truncateText(`${parsed.hostname}${parsed.pathname}`, 90);
  } catch {
    return truncateText(url, 90);
  }
}

export function extractStandaloneUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s]+/i);
  if (!match) return "";
  try {
    return new URL(match[0]).toString();
  } catch {
    return "";
  }
}

function noteIconType(note) {
  if (note.sourceType === "image") return "image";
  if (note.sourceType === "link") return "link";
  if ((note.sourceType || "").toLowerCase() === "file") return "file";
  return "text";
}

export function applySortFilter(items, { sortMode = "newest", filterType = "all" } = {}) {
  if (!Array.isArray(items)) return [];
  let filtered = items;
  if (filterType !== "all") {
    filtered = items.filter((entry, index) => {
      const note = normalizeCitation(entry, index).note;
      return noteIconType(note) === filterType;
    });
  }
  if (sortMode === "oldest") {
    filtered = [...filtered].sort((a, b) => {
      const na = normalizeCitation(a, 0).note;
      const nb = normalizeCitation(b, 0).note;
      return (na.createdAt || "").localeCompare(nb.createdAt || "");
    });
  } else if (sortMode === "az") {
    filtered = [...filtered].sort((a, b) => {
      const na = normalizeCitation(a, 0).note;
      const nb = normalizeCitation(b, 0).note;
      return buildNoteTitle(na).localeCompare(buildNoteTitle(nb));
    });
  } else if (sortMode === "za") {
    filtered = [...filtered].sort((a, b) => {
      const na = normalizeCitation(a, 0).note;
      const nb = normalizeCitation(b, 0).note;
      return buildNoteTitle(nb).localeCompare(buildNoteTitle(na));
    });
  }
  return filtered;
}

export function inferCaptureType(content, imageDataUrl) {
  if (imageDataUrl) {
    return { sourceType: "image", sourceUrl: "" };
  }

  const trimmed = String(content || "").trim();
  const url = extractStandaloneUrl(trimmed);
  if (!url) {
    return { sourceType: "text", sourceUrl: "" };
  }

  const remainder = trimmed.replace(url, "").trim();
  if (!remainder) {
    return { sourceType: "link", sourceUrl: url };
  }

  return { sourceType: "text", sourceUrl: "" };
}
