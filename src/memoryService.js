import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config, publicUploadPath } from "./config.js";
import { noteRepo } from "./storage/provider.js";
import { enrichmentQueue } from "./queue.js";
import {
  convertUploadToMarkdown,
  createEmbedding,
  createResponse,
  hasOpenAI,
  pseudoEmbedding,
  cosineSimilarity,
  heuristicSummary,
  heuristicTags,
} from "./openai.js";

/**
 * Simple LRU cache for query embeddings (avoids redundant OpenAI calls).
 * Max 128 entries, 5 minute TTL.
 */
class EmbeddingCache {
  constructor(maxSize = 128, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Delete oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }
}

const embeddingCache = new EmbeddingCache();

const SOURCE_TYPES = new Set(["text", "link", "image", "file"]);
const CONSOLIDATED_SECTIONS = [
  "Projects & Work",
  "People & Relationships",
  "Research & Learning",
  "Finance & Admin",
  "Travel & Logistics",
  "Health & Lifestyle",
  "Personal Life",
  "General",
];

function nowIso() {
  return new Date().toISOString();
}

function authenticationError(message = "Unauthorized") {
  const error = new Error(message);
  error.status = 401;
  return error;
}

function sanitizeIdForFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveActor(actor = null, { allowServiceActor = false } = {}) {
  const workspaceId = String(actor?.workspaceId || "").trim();
  if (!workspaceId) {
    throw authenticationError("Missing actor workspace id");
  }
  const userId = String(actor?.userId || "").trim();
  if (!userId && !allowServiceActor) {
    throw authenticationError("Missing actor user id");
  }
  const role = String(actor?.role || "member")
    .trim()
    .toLowerCase();
  return { workspaceId, userId: userId || null, role };
}

function authorizationError(message = "Forbidden") {
  const error = new Error(message);
  error.status = 403;
  return error;
}

function isWorkspaceManager(actorContext = null) {
  const role = String(actorContext?.role || "").toLowerCase();
  return role === "owner" || role === "admin";
}

function noteOwnerId(note = null) {
  if (!note) return "";
  const explicitOwner = String(note.ownerUserId || "").trim();
  if (explicitOwner) return explicitOwner;
  const creator = String(note.createdByUserId || "").trim();
  if (creator) return creator;
  const metadataActor = String(note.metadata?.actorUserId || "").trim();
  return metadataActor;
}

function canReadNote(note, actorContext = null) {
  if (!note || !actorContext) return false;
  if (isWorkspaceManager(actorContext)) return true;
  const userId = String(actorContext.userId || "").trim();
  if (!userId) return false;
  return noteOwnerId(note) === userId;
}

function assertCanReadNote(note, actorContext = null) {
  if (!canReadNote(note, actorContext)) {
    throw authorizationError("Forbidden: you do not have permission to access this item");
  }
}

function canMutateNote(note, actorContext = null) {
  if (!note || !actorContext) return false;
  if (isWorkspaceManager(actorContext)) return true;
  const userId = String(actorContext.userId || "").trim();
  if (!userId) return false;
  return noteOwnerId(note) === userId;
}

function assertCanMutateNote(note, actorContext = null) {
  if (!canMutateNote(note, actorContext)) {
    throw authorizationError("Forbidden: you do not have permission to modify this item");
  }
}

function assertWorkspaceManager(actorContext = null) {
  if (!isWorkspaceManager(actorContext)) {
    throw authorizationError("Forbidden: this operation requires workspace owner/admin privileges");
  }
}

async function listVisibleNotesForActor({
  actorContext,
  project = "",
  limit = 200,
  offset = 0,
} = {}) {
  const normalizedProject = String(project || "").trim();
  const boundedLimit = clampInt(limit, 1, 10000, 200);
  const boundedOffset = clampInt(offset, 0, 100000, 0);
  if (isWorkspaceManager(actorContext)) {
    return noteRepo.listByProject(
      normalizedProject || null,
      boundedLimit,
      boundedOffset,
      actorContext.workspaceId
    );
  }
  return noteRepo.listByProjectForUser(
    normalizedProject || null,
    boundedLimit,
    boundedOffset,
    actorContext.workspaceId,
    actorContext.userId
  );
}

async function listSearchCandidatesForActor(actorContext, normalizedProject = "", maxCandidates = 500) {
  if (isWorkspaceManager(actorContext)) {
    return noteRepo.listByProject(
      normalizedProject || null,
      maxCandidates,
      0,
      actorContext.workspaceId
    );
  }
  return noteRepo.listByProjectForUser(
    normalizedProject || null,
    maxCandidates,
    0,
    actorContext.workspaceId,
    actorContext.userId
  );
}

function getConsolidatedMemoryFilePath(workspaceId = config.defaultWorkspaceId) {
  const normalizedWorkspaceId = String(workspaceId || config.defaultWorkspaceId || "").trim();
  const basePath = config.consolidatedMemoryMarkdownFile;
  if (!normalizedWorkspaceId || normalizedWorkspaceId === config.defaultWorkspaceId) {
    return basePath;
  }

  const safeWorkspaceId = sanitizeIdForFileName(normalizedWorkspaceId) || "workspace";
  const ext = path.extname(basePath) || ".md";
  const name = path.basename(basePath, ext);
  const dir = path.dirname(basePath);
  return path.join(dir, `${name}-${safeWorkspaceId}${ext}`);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizeSourceType(sourceType) {
  if (!sourceType) return "text";
  const normalized = String(sourceType).toLowerCase().trim();
  return SOURCE_TYPES.has(normalized) ? normalized : "text";
}

function buildProjectFallback(sourceUrl, tags) {
  if (sourceUrl) {
    try {
      const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
      return host.split(".")[0] || "General";
    } catch {
      // no-op
    }
  }
  if (Array.isArray(tags) && tags.length > 0) {
    return tags[0];
  }
  return "General";
}

function parseJsonObject(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function textOnlyFromHtml(html) {
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLinkTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHtmlMetaContent(html, key, attribute = "property") {
  if (!html || !key) return "";
  const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\s+[^>]*${attribute}\\s*=\\s*["']${escapedKey}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta\\s+[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*${attribute}\\s*=\\s*["']${escapedKey}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match?.[1]) {
      return normalizeLinkTitle(match[1]);
    }
  }
  return "";
}

function titleCaseWords(input) {
  return String(input || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function inferEntityTitleFromUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .map((segment) => normalizeLinkTitle(segment))
      .filter(Boolean);
    const generic = new Set([
      "us",
      "en",
      "restaurant",
      "restaurants",
      "guide",
      "city",
      "hotel",
      "hotels",
      "review",
      "reviews",
    ]);

    // Prefer a slug after /restaurant/ (common entity page pattern).
    const restaurantIdx = segments.findIndex((segment) => segment.toLowerCase() === "restaurant");
    if (restaurantIdx >= 0 && segments[restaurantIdx + 1]) {
      const slug = segments[restaurantIdx + 1].replace(/[-_]+/g, " ");
      const candidate = titleCaseWords(normalizeLinkTitle(slug));
      if (candidate && !generic.has(candidate.toLowerCase())) {
        return candidate;
      }
    }

    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const value = segments[i];
      if (!value) continue;
      const lower = value.toLowerCase();
      if (generic.has(lower)) continue;
      const candidate = titleCaseWords(normalizeLinkTitle(value.replace(/[-_]+/g, " ")));
      if (candidate) {
        return candidate;
      }
    }

    return normalizeLinkTitle(parsed.hostname.replace(/^www\./, ""));
  } catch {
    return "";
  }
}

function isUrlLikeTitle(value) {
  const normalized = normalizeLinkTitle(value);
  if (!normalized) return false;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(normalized)) return true;
  return false;
}

function isMichelinRestaurantUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    return /(^|\.)guide\.michelin\.com$/i.test(parsed.hostname) && /\/restaurant(\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isGenericListingTitle(title) {
  const normalized = normalizeLinkTitle(title).toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("restaurants in ") ||
    normalized.includes("michelin guide") ||
    normalized.includes("page not found") ||
    normalized.includes("not found") ||
    normalized === "restaurants" ||
    normalized === "restaurant"
  );
}

async function inferLinkTitleWithOpenAI({ sourceUrl, linkPreview }) {
  const previewTitle = normalizeLinkTitle(linkPreview?.title || "");
  const fallbackTitle = previewTitle || inferEntityTitleFromUrl(sourceUrl) || "Saved link";
  if (!hasOpenAI()) {
    return fallbackTitle;
  }

  try {
    const inputText = [
      `url: ${sourceUrl || ""}`,
      previewTitle ? `preview_title: ${previewTitle}` : "",
      linkPreview?.excerpt ? `preview_excerpt:\n${String(linkPreview.excerpt).slice(0, 2000)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const { text } = await createResponse({
      instructions:
        "Extract the best concise title for this webpage. Output JSON only: {\"title\":\"...\"}. Prefer the primary entity name for entity pages (for restaurants, return the restaurant name only). Max 90 chars.",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: inputText }],
        },
      ],
      temperature: 0,
    });

    const parsed = parseJsonObject(text);
    let candidate = normalizeLinkTitle(parsed?.title || "");
    const michelinRestaurantUrl = isMichelinRestaurantUrl(sourceUrl);

    if (michelinRestaurantUrl && isGenericListingTitle(candidate) && linkPreview?.excerpt) {
      const targeted = await createResponse({
        instructions:
          "This is a Michelin restaurant page or listing. Extract ONE specific restaurant name from the text. Output JSON only: {\"title\":\"restaurant name\"}. Never return generic titles like 'MICHELIN Guide' or 'Restaurants in ...'.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `url: ${sourceUrl}\n\npage_text:\n${String(linkPreview.excerpt).slice(0, 4000)}`,
              },
            ],
          },
        ],
        temperature: 0,
      });
      const targetedParsed = parseJsonObject(targeted.text);
      const targetedCandidate = normalizeLinkTitle(targetedParsed?.title || "");
      if (targetedCandidate && !isGenericListingTitle(targetedCandidate) && !isUrlLikeTitle(targetedCandidate)) {
        candidate = targetedCandidate;
      }
    }

    if (!candidate || isUrlLikeTitle(candidate)) {
      return fallbackTitle;
    }
    return candidate.slice(0, 90);
  } catch {
    return fallbackTitle;
  }
}

async function fetchLinkPreview(urlString) {
  if (!urlString) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(urlString, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "ProjectMemoryBot/0.1",
      },
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("text/html")) {
      return null;
    }

    const html = await response.text();
    const ogTitle =
      extractHtmlMetaContent(html, "og:title", "property") ||
      extractHtmlMetaContent(html, "og:title", "name");
    const twitterTitle =
      extractHtmlMetaContent(html, "twitter:title", "name") ||
      extractHtmlMetaContent(html, "twitter:title", "property");
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const body = textOnlyFromHtml(html);
    const ogImage =
      extractHtmlMetaContent(html, "og:image", "property") ||
      extractHtmlMetaContent(html, "og:image", "name") ||
      extractHtmlMetaContent(html, "twitter:image", "name") ||
      extractHtmlMetaContent(html, "twitter:image", "property") ||
      "";
    return {
      title: normalizeLinkTitle(ogTitle || twitterTitle || (titleMatch ? titleMatch[1] : "")),
      excerpt: body.slice(0, 1600),
      ogImage: ogImage || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  return {
    mime: match[1],
    base64: match[2],
    bytes: Buffer.from(match[2], "base64"),
  };
}

function mimeToExt(mime) {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

async function saveImageDataUrl(dataUrl) {
  const { mime, bytes } = parseDataUrl(dataUrl);
  const extension = mimeToExt(mime);
  const fileName = `${crypto.randomUUID()}.${extension}`;
  const absolutePath = path.join(config.uploadDir, fileName);

  await fs.writeFile(absolutePath, bytes);

  return {
    imagePath: publicUploadPath(fileName),
    imageAbsolutePath: absolutePath,
    imageMime: mime,
    imageSize: bytes.length,
  };
}

function parseGenericDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid file data URL");
  }
  return {
    mime: match[1],
    base64: match[2],
    bytes: Buffer.from(match[2], "base64"),
  };
}

function inferMimeFromFileName(fileName = "") {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".json")) return "application/json";
  return "";
}

function maybeDecodeTextUpload(dataUrl, mime, fileName = "") {
  const normalizedMime = String(mime || "").toLowerCase();
  const isTextLikeMime =
    normalizedMime.startsWith("text/") ||
    [
      "application/json",
      "application/xml",
      "application/javascript",
      "application/x-javascript",
      "application/x-yaml",
      "application/yaml",
      "application/csv",
    ].includes(normalizedMime);
  const isTextLikeExt = /\.(txt|md|markdown|json|csv|log|xml|yaml|yml|js|ts)$/i.test(String(fileName || ""));

  if (!isTextLikeMime && !isTextLikeExt) {
    return "";
  }

  try {
    const parsed = parseGenericDataUrl(dataUrl);
    return String(parsed.bytes.toString("utf8"))
      .replace(/\u0000/g, "")
      .trim();
  } catch {
    return "";
  }
}

async function imagePathToDataUrl(imagePath) {
  if (!imagePath) return null;
  const fileName = path.basename(imagePath);
  const absolutePath = path.join(config.uploadDir, fileName);

  try {
    const bytes = await fs.readFile(absolutePath);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/png";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function noteTextForEmbedding(note, linkPreview) {
  const compact = (text, max = 2500) => String(text || "").slice(0, max);
  const parts = [
    compact(note.content, 2000),
    compact(note.rawContent, 2500),
    compact(note.markdownContent, 2500),
    compact(note.fileName, 200),
    compact(note.fileMime, 120),
    compact(note.summary, 300),
    Array.isArray(note.tags) ? note.tags.join(" ") : "",
    compact(note.project, 120),
    compact(note.sourceUrl, 300),
    compact(linkPreview?.title, 300),
    compact(linkPreview?.excerpt, 1000),
  ];
  return parts.filter(Boolean).join("\n\n");
}

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function buildBm25Index(docs, textSelector) {
  const docTokens = docs.map((doc) => tokenize(textSelector(doc)));
  const docLengths = docTokens.map((tokens) => tokens.length);
  const avgDocLength = docLengths.length ? docLengths.reduce((sum, len) => sum + len, 0) / docLengths.length : 0;

  const termFreqs = docTokens.map((tokens) => {
    const tf = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    return tf;
  });

  const docFreq = new Map();
  for (const tf of termFreqs) {
    for (const token of tf.keys()) {
      docFreq.set(token, (docFreq.get(token) || 0) + 1);
    }
  }

  return {
    N: docs.length,
    avgDocLength: avgDocLength || 1,
    docLengths,
    termFreqs,
    docFreq,
  };
}

function bm25ScoreFromIndex(index, docIndex, queryTokens, k1 = 1.2, b = 0.75) {
  const tf = index.termFreqs[docIndex];
  const docLen = index.docLengths[docIndex] || 0;
  if (!tf || !queryTokens.length || !docLen) return 0;

  let score = 0;
  const uniqueQueryTerms = new Set(queryTokens);
  for (const token of uniqueQueryTerms) {
    const f = tf.get(token) || 0;
    if (!f) continue;

    const n = index.docFreq.get(token) || 0;
    const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
    const denom = f + k1 * (1 - b + (b * docLen) / index.avgDocLength);
    score += idf * ((f * (k1 + 1)) / (denom || 1));
  }

  return Number.isFinite(score) ? score : 0;
}

function normalizeScores(items, scoreSelector) {
  if (!items.length) return new Map();
  let max = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    max = Math.max(max, Number(scoreSelector(item)) || 0);
  }
  const divisor = max > 0 ? max : 1;
  const out = new Map();
  for (const item of items) {
    const value = Number(scoreSelector(item)) || 0;
    out.set(item, value / divisor);
  }
  return out;
}

export function lexicalScore(note, queryTokens) {
  if (queryTokens.length === 0) return 0;
  const noteTokens = new Set(
    tokenize(
      `${note.content} ${note.rawContent || ""} ${note.markdownContent || ""} ${note.summary} ${(note.tags || []).join(" ")} ${note.project || ""} ${note.fileName || ""}`
    )
  );
  let overlap = 0;
  for (const token of queryTokens) {
    if (noteTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / queryTokens.length;
}

async function buildEnrichment(note, linkPreview = null, precomputed = null) {
  const fallbackSummary = heuristicSummary(note.content);
  const fallbackTags = heuristicTags(`${note.content} ${linkPreview?.title || ""}`);
  const fallbackProject = note.project || buildProjectFallback(note.sourceUrl, fallbackTags);

  if (precomputed && (precomputed.summary || (Array.isArray(precomputed.tags) && precomputed.tags.length) || precomputed.project)) {
    return {
      summary: String(precomputed.summary || fallbackSummary).trim().slice(0, 220) || fallbackSummary,
      tags: Array.isArray(precomputed.tags) && precomputed.tags.length ? precomputed.tags.slice(0, 8) : fallbackTags,
      project: String(precomputed.project || fallbackProject).trim().slice(0, 80) || fallbackProject,
      enrichmentSource: "openai-upload",
    };
  }

  if (!hasOpenAI()) {
    return {
      summary: fallbackSummary,
      tags: fallbackTags,
      project: fallbackProject,
      enrichmentSource: "heuristic",
    };
  }

  try {
    const userText = [
      `source_type: ${note.sourceType}`,
      note.sourceUrl ? `source_url: ${note.sourceUrl}` : "",
      note.fileName ? `file_name: ${note.fileName}` : "",
      note.fileMime ? `file_mime: ${note.fileMime}` : "",
      note.content ? `content:\n${note.content}` : "",
      note.rawContent ? `raw_content:\n${note.rawContent.slice(0, 8000)}` : "",
      note.markdownContent ? `markdown_content:\n${note.markdownContent.slice(0, 8000)}` : "",
      linkPreview?.title ? `link_title: ${linkPreview.title}` : "",
      linkPreview?.excerpt ? `link_excerpt: ${linkPreview.excerpt}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const content = [{ type: "input_text", text: userText }];
    if (note.sourceType === "image" && note.imagePath) {
      const imageDataUrl = await imagePathToDataUrl(note.imagePath);
      if (imageDataUrl) {
        content.push({
          type: "input_image",
          image_url: imageDataUrl,
        });
      }
    }

    const { text } = await createResponse({
      instructions:
        "You are extracting memory metadata for a single-user project notebook. Output JSON only with keys: summary (<=180 chars), tags (array of 3-8 short lowercase tags), project (2-4 words).",
      input: [
        {
          role: "user",
          content,
        },
      ],
      temperature: 0.1,
    });

    const parsed = parseJsonObject(text);
    const summary = typeof parsed?.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 220) : fallbackSummary;
    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags
          .map((tag) => String(tag).toLowerCase().trim())
          .filter(Boolean)
          .slice(0, 8)
      : fallbackTags;
    const project = typeof parsed?.project === "string" && parsed.project.trim() ? parsed.project.trim().slice(0, 80) : fallbackProject;

    return {
      summary,
      tags,
      project,
      enrichmentSource: "openai",
    };
  } catch {
    return {
      summary: fallbackSummary,
      tags: fallbackTags,
      project: fallbackProject,
      enrichmentSource: "heuristic",
    };
  }
}

function materializeCitation(note, score, rank) {
  return {
    rank,
    score,
    note: {
      id: note.id,
      content: note.content,
      sourceType: note.sourceType,
      sourceUrl: note.sourceUrl,
      imagePath: note.imagePath,
      fileName: note.fileName,
      fileMime: note.fileMime,
      fileSize: note.fileSize,
      rawContent: note.rawContent,
      markdownContent: note.markdownContent,
      summary: note.summary,
      tags: note.tags || [],
      project: note.project,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    },
  };
}

function makeExcerpt(text, query, maxLen = 320) {
  const normalizedText = String(text || "");
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedText) return "";
  if (!normalizedQuery) return normalizedText.slice(0, maxLen);

  const lower = normalizedText.toLowerCase();
  const idx = lower.indexOf(normalizedQuery);
  if (idx === -1) return normalizedText.slice(0, maxLen);

  const start = Math.max(0, idx - Math.floor(maxLen * 0.3));
  const end = Math.min(normalizedText.length, start + maxLen);
  return normalizedText.slice(start, end);
}

function makeConsolidatedTemplate(lastUpdatedIso = nowIso()) {
  const sectionBlocks = CONSOLIDATED_SECTIONS.map((section) => `## ${section}\n\n_No entries yet._`).join("\n\n");
  return [
    "# Consolidated User Memory",
    "",
    "**Purpose:** Single evolving memory file across user uploads.",
    `**Last Updated:** ${lastUpdatedIso}`,
    "",
    sectionBlocks,
    "",
  ].join("\n");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classifyMemorySection(note) {
  const text = `${note.project || ""} ${(note.tags || []).join(" ")} ${note.fileName || ""} ${note.summary || ""} ${note.content || ""}`.toLowerCase();
  if (/\b(message|call|follow up|landlord|mom|ashna|friend|family|team)\b/.test(text)) return "People & Relationships";
  if (/\b(research|paper|study|analysis|learn|deep research|interview)\b/.test(text)) return "Research & Learning";
  if (/\b(receipt|invoice|tax|w2|1099|payment|credit card|expense|bank)\b/.test(text)) return "Finance & Admin";
  if (/\b(flight|travel|trip|itinerary|hotel|airbnb|uber|lyft)\b/.test(text)) return "Travel & Logistics";
  if (/\b(health|medical|doctor|surgery|gym|fitness|diet)\b/.test(text)) return "Health & Lifestyle";
  if (note.project && note.project.trim()) return "Projects & Work";
  if (/\b(home|personal|grocery|meal|weekend)\b/.test(text)) return "Personal Life";
  return "General";
}

function buildConsolidatedEntry(note) {
  const timestamp = note.createdAt || nowIso();
  const title = note.summary || note.fileName || heuristicSummary(note.content, 120);
  const markdownExcerpt = String(note.markdownContent || "").slice(0, 2200).trim();
  const rawExcerpt = String(note.rawContent || "").slice(0, 1200).trim();
  const tags = Array.isArray(note.tags) && note.tags.length ? note.tags.join(", ") : "none";

  const parts = [
    `### ${timestamp} | ${title}`,
    `- note_id: ${note.id}`,
    `- project: ${note.project || "General"}`,
    `- source_type: ${note.sourceType || "text"}`,
    `- tags: ${tags}`,
  ];

  if (markdownExcerpt) {
    parts.push("", "#### Markdown Extract", "```md", markdownExcerpt, "```");
  }
  if (rawExcerpt && rawExcerpt !== markdownExcerpt) {
    parts.push("", "#### Raw Extract", "```text", rawExcerpt, "```");
  }

  return parts.join("\n");
}

async function updateConsolidatedMemoryFile(note, workspaceId = config.defaultWorkspaceId) {
  const filePath = getConsolidatedMemoryFilePath(workspaceId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      content = makeConsolidatedTemplate();
    } else {
      throw error;
    }
  }

  if (content.includes(`note_id: ${note.id}`)) {
    return;
  }

  const section = classifyMemorySection(note);
  if (!content.includes(`## ${section}\n`)) {
    content = `${content.trimEnd()}\n\n## ${section}\n\n_No entries yet._\n`;
  }

  const entry = buildConsolidatedEntry(note);
  const sectionPattern = new RegExp(`(^## ${escapeRegExp(section)}\\n)([\\s\\S]*?)(?=\\n## |$)`, "m");
  content = content.replace(sectionPattern, (full, header, body) => {
    const trimmed = String(body || "").trim();
    const base = !trimmed || trimmed === "_No entries yet._" ? "" : `${trimmed}\n\n`;
    return `${header}${base}${entry}\n`;
  });

  content = content.replace(/\*\*Last Updated:\*\* .*/, `**Last Updated:** ${nowIso()}`);
  await fs.writeFile(filePath, content, "utf8");

  // Archive if over 512KB
  const fileSize = Buffer.byteLength(content, "utf8");
  if (fileSize > 512 * 1024) {
    const timestamp = nowIso().replace(/[:.]/g, "-");
    const archivePath = path.join(
      path.dirname(filePath),
      `consolidated-memory-archive-${timestamp}.md`
    );
    await fs.copyFile(filePath, archivePath);
    await fs.writeFile(filePath, makeConsolidatedTemplate(), "utf8");
  }
}

function extractNoteIdFromConsolidatedBlock(blockLines) {
  for (const line of blockLines) {
    const match = String(line).trim().match(/^- note_id:\s*(.+)$/);
    if (match && match[1]) {
      return String(match[1]).trim();
    }
  }
  return "";
}

async function removeConsolidatedMemoryEntries(noteIds = [], workspaceId = config.defaultWorkspaceId) {
  const idSet = new Set(
    (Array.isArray(noteIds) ? noteIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
  if (idSet.size === 0) return;

  const filePath = getConsolidatedMemoryFilePath(workspaceId);
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const isMissing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    if (isMissing) return;
    return;
  }

  const lines = content.split("\n");
  const kept = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.startsWith("### ")) {
      kept.push(line);
      cursor += 1;
      continue;
    }

    let end = cursor + 1;
    while (end < lines.length && !lines[end].startsWith("### ") && !lines[end].startsWith("## ")) {
      end += 1;
    }

    const block = lines.slice(cursor, end);
    const noteId = extractNoteIdFromConsolidatedBlock(block);
    if (!idSet.has(noteId)) {
      kept.push(...block);
    }
    cursor = end;
  }

  let next = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  if (!next) {
    next = makeConsolidatedTemplate();
  } else if (/\*\*Last Updated:\*\*/.test(next)) {
    next = next.replace(/\*\*Last Updated:\*\* .*/, `**Last Updated:** ${nowIso()}`);
  }
  if (!next.endsWith("\n")) {
    next += "\n";
  }

  try {
    await fs.writeFile(filePath, next, "utf8");
  } catch {
    // no-op: note deletion should not fail because markdown sync failed
  }
}

function imagePathToAbsoluteUploadPath(imagePath) {
  const normalized = String(imagePath || "").trim();
  if (!normalized) return "";
  const fileName = path.basename(normalized);
  if (!fileName) return "";
  return path.join(config.uploadDir, fileName);
}

async function cleanupDeletedNotesArtifacts(notes = [], workspaceId = config.defaultWorkspaceId) {
  const noteList = Array.isArray(notes) ? notes : [];
  if (!noteList.length) return;

  const noteIds = [];
  const uploadPaths = [];

  for (const note of noteList) {
    const noteId = String(note?.id || "").trim();
    if (noteId) {
      noteIds.push(noteId);
    }

    const uploadPath = imagePathToAbsoluteUploadPath(note?.imagePath);
    if (uploadPath) {
      uploadPaths.push(uploadPath);
    }
  }

  if (uploadPaths.length) {
    await Promise.allSettled(
      uploadPaths.map(async (uploadPath) => {
        try {
          await fs.unlink(uploadPath);
        } catch (error) {
          const isMissing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
          if (!isMissing) {
            // no-op: keep deletion flow resilient
          }
        }
      })
    );
  }

  await removeConsolidatedMemoryEntries(noteIds, workspaceId);
}

/**
 * Phase B: Background enrichment job for a note.
 * Loads the note, runs AI enrichment, generates embedding,
 * updates DB, updates consolidated memory, and emits SSE event.
 */
async function processEnrichment({
  noteId,
  workspaceId,
  requestedProject,
  normalizedSourceType,
  normalizedSourceUrl,
  hasFileUpload,
  uploadEnrichment,
  fileDataUrl,
  fileName,
  fileMime,
}) {
  const tStart = Date.now();
  await noteRepo.updateStatus(noteId, "enriching", workspaceId);

  let note = await noteRepo.getNoteById(noteId, workspaceId);
  if (!note) throw new Error(`Note not found: ${noteId}`);

  // If file upload and OpenAI available, do full extraction now (background)
  if (hasFileUpload && fileDataUrl && hasOpenAI()) {
    try {
      const parsedUpload = await convertUploadToMarkdown({
        fileDataUrl,
        fileName: fileName || `upload.${(fileMime || "").split("/")[1] || "bin"}`,
        fileMimeType: fileMime || "application/octet-stream",
      });
      if (parsedUpload.rawContent || parsedUpload.markdownContent) {
        await noteRepo.updateEnrichment({
          id: noteId,
          summary: note.summary,
          tags: note.tags,
          project: note.project,
          embedding: null,
        metadata: {
          ...(note.metadata || {}),
          rawContent: parsedUpload.rawContent || null,
          markdownContent: parsedUpload.markdownContent || null,
        },
        updatedAt: nowIso(),
        workspaceId,
      });
        note = await noteRepo.getNoteById(noteId, workspaceId);
      }
      uploadEnrichment = {
        summary: parsedUpload.summary || "",
        tags: Array.isArray(parsedUpload.tags) ? parsedUpload.tags : [],
        project: parsedUpload.project || "",
      };
    } catch {
      // file conversion failed — continue with heuristic enrichment
    }
  }

  // For links, do full preview fetch + title inference in background
  let linkPreview = null;
  if (normalizedSourceType === "link" && normalizedSourceUrl) {
    linkPreview = await fetchLinkPreview(normalizedSourceUrl);
    const linkTitle = await inferLinkTitleWithOpenAI({
      sourceUrl: normalizedSourceUrl,
      linkPreview,
    });
    if (linkTitle || linkPreview?.ogImage) {
      await noteRepo.updateEnrichment({
        id: noteId,
        summary: note.summary,
        tags: note.tags,
        project: note.project,
        embedding: null,
        metadata: {
          ...(note.metadata || {}),
          ...(linkTitle ? { title: linkTitle, linkTitle } : {}),
          ...(linkPreview?.ogImage ? { ogImage: linkPreview.ogImage } : {}),
        },
        updatedAt: nowIso(),
        workspaceId,
      });
      note = await noteRepo.getNoteById(noteId, workspaceId);
    }
  }

  const enrichment = await buildEnrichment(note, linkPreview, uploadEnrichment);
  const finalProject =
    requestedProject || (normalizedSourceType === "file" ? "General" : enrichment.project);
  const embeddingText = noteTextForEmbedding(
    {
      ...note,
      summary: enrichment.summary,
      tags: enrichment.tags,
      project: finalProject,
    },
    linkPreview
  );

  let embedding;
  let embeddingSource = "openai";
  try {
    if (normalizedSourceType === "file" && embeddingText.length > 5000) {
      embedding = pseudoEmbedding(embeddingText);
      embeddingSource = "pseudo-large-upload";
    } else {
      embedding = await createEmbedding(embeddingText);
    }
  } catch {
    embedding = pseudoEmbedding(embeddingText);
    embeddingSource = "pseudo-fallback";
  }

  const enrichedNote = await noteRepo.updateEnrichment({
    id: noteId,
    summary: enrichment.summary,
    tags: enrichment.tags,
    project: finalProject,
    embedding,
    metadata: {
      ...(note.metadata || {}),
      enrichmentSource: enrichment.enrichmentSource,
      embeddingSource,
      processingMs: Date.now() - tStart,
      enrichedAt: nowIso(),
    },
    updatedAt: nowIso(),
    workspaceId,
  });

  await noteRepo.updateStatus(noteId, "ready", workspaceId);

  if (hasFileUpload) {
    await updateConsolidatedMemoryFile(enrichedNote, workspaceId);
  }

  return enrichedNote;
}

function enqueueEnrichmentJob(params) {
  enrichmentQueue.enqueue({
    id: params.noteId,
    workspaceId: params.workspaceId,
    visibilityUserId: String(params.visibilityUserId || "").trim() || null,
    fn: async () => {
      try {
        return await processEnrichment(params);
      } catch (error) {
        await noteRepo.updateStatus(params.noteId, "failed", params.workspaceId).catch(() => {});
        throw error;
      }
    },
  });
}

/**
 * Phase A: Synchronous note creation.
 * Saves the note instantly with heuristic enrichment, then enqueues
 * background AI enrichment. Returns the note immediately (<200ms).
 */
export async function createMemory({
  content = "",
  sourceType = "text",
  sourceUrl = "",
  imageDataUrl = null,
  fileDataUrl = null,
  fileName = "",
  fileMimeType = "",
  project = "",
  metadata = {},
  actor = null,
}) {
  const actorContext = resolveActor(actor);
  const requestedSourceType = normalizeSourceType(sourceType);
  const requestedProject = String(project || "").trim();
  const normalizedSourceUrl = String(sourceUrl || "").trim();
  let normalizedContent = String(content || "").trim();
  const normalizedFileDataUrl = String(fileDataUrl || imageDataUrl || "").trim() || null;
  const normalizedFileName = String(fileName || "").trim();
  const normalizedFileMimeType = String(fileMimeType || "").trim().toLowerCase();

  let uploadMime = normalizedFileMimeType || null;
  let uploadSize = null;
  if (normalizedFileDataUrl) {
    const parsedData = parseGenericDataUrl(normalizedFileDataUrl);
    uploadMime = uploadMime || parsedData.mime;
    uploadSize = parsedData.bytes.length;
  }
  if (!uploadMime || uploadMime === "application/octet-stream") {
    const inferred = inferMimeFromFileName(normalizedFileName);
    if (inferred) {
      uploadMime = inferred;
    }
  }

  const normalizedSourceType =
    normalizedFileDataUrl && uploadMime
      ? uploadMime.startsWith("image/")
        ? "image"
        : "file"
      : requestedSourceType;

  if (!normalizedContent && normalizedSourceUrl) {
    normalizedContent = normalizedSourceUrl;
  }

  let imageData = null;
  if (normalizedFileDataUrl && uploadMime?.startsWith("image/")) {
    imageData = await saveImageDataUrl(normalizedFileDataUrl);
  }

  // For file uploads, attempt text extraction synchronously (fast path)
  let rawContent = null;
  let markdownContent = null;
  let uploadEnrichment = null;
  let uploadParsingError = "";
  if (normalizedFileDataUrl) {
    // Try OpenAI-based upload conversion in background instead
    // For sync path, only do lightweight text extraction
    if (!rawContent && !markdownContent) {
      const textExtract = maybeDecodeTextUpload(normalizedFileDataUrl, uploadMime, normalizedFileName);
      if (textExtract) {
        rawContent = textExtract;
        markdownContent = textExtract;
      }
    }
  }

  if (!normalizedContent && markdownContent) {
    normalizedContent = markdownContent.slice(0, 12000).trim();
  }
  if (!normalizedContent && rawContent) {
    normalizedContent = rawContent.slice(0, 12000).trim();
  }
  if (!normalizedContent && normalizedFileDataUrl) {
    normalizedContent = normalizedFileName ? `Uploaded file: ${normalizedFileName}` : "Uploaded file";
  }

  if (!normalizedContent && !normalizedFileDataUrl && !imageData) {
    throw new Error("Missing content");
  }

  // For links, infer a quick title from URL (no network calls in sync path)
  let linkTitle = "";
  if (normalizedSourceType === "link" && normalizedSourceUrl) {
    linkTitle = inferEntityTitleFromUrl(normalizedSourceUrl) || "Saved link";
    normalizedContent = normalizedSourceUrl;
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const seedTags = heuristicTags(`${normalizedContent} ${normalizedSourceUrl}`);
  const note = await noteRepo.createNote({
    id,
    workspaceId: actorContext.workspaceId,
    ownerUserId: actorContext.userId,
    createdByUserId: actorContext.userId,
    content: normalizedContent,
    sourceType: normalizedSourceType,
    sourceUrl: normalizedSourceUrl || null,
    imagePath: imageData?.imagePath || null,
    fileName: normalizedFileName || null,
    fileMime: uploadMime || null,
    fileSize: uploadSize,
    rawContent,
    markdownContent,
    summary: heuristicSummary(normalizedContent),
    tags: seedTags,
    project: requestedProject || null,
    createdAt,
    updatedAt: createdAt,
    embedding: null,
    metadata: {
      ...metadata,
      title: linkTitle || null,
      imageMime: imageData?.imageMime || null,
      imageSize: imageData?.imageSize || null,
      fileMime: uploadMime || null,
      fileSize: uploadSize,
      uploadParsingError: uploadParsingError || null,
      linkTitle: linkTitle || null,
    },
    status: "pending",
  });

  // Enqueue background enrichment
  enqueueEnrichmentJob({
    noteId: note.id,
    workspaceId: actorContext.workspaceId,
    visibilityUserId: actorContext.userId,
    requestedProject,
    normalizedSourceType,
    normalizedSourceUrl,
    hasFileUpload: Boolean(normalizedFileDataUrl),
    uploadEnrichment,
    fileDataUrl: normalizedFileDataUrl,
    fileName: normalizedFileName,
    fileMime: uploadMime,
  });

  return note;
}

export async function updateMemory({ id, content, summary, tags, project, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Missing id");

  const existing = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
  if (!existing) throw new Error(`Memory not found: ${normalizedId}`);
  assertCanMutateNote(existing, actorContext);

  const newContent = content !== undefined ? String(content) : existing.content;
  const contentChanged = content !== undefined && newContent !== existing.content;

  const updatedNote = await noteRepo.updateNote({
    id: normalizedId,
    content: newContent,
    summary: summary !== undefined ? String(summary) : existing.summary,
    tags: tags !== undefined ? tags : existing.tags,
    project: project !== undefined ? String(project) : existing.project,
    workspaceId: actorContext.workspaceId,
  });

  // Re-enrich if content changed
  if (contentChanged) {
    await noteRepo.updateStatus(normalizedId, "pending", actorContext.workspaceId);
    enqueueEnrichmentJob({
      noteId: normalizedId,
      workspaceId: actorContext.workspaceId,
      visibilityUserId: noteOwnerId(existing) || actorContext.userId,
      requestedProject: updatedNote.project || "",
      normalizedSourceType: updatedNote.sourceType || "text",
      normalizedSourceUrl: updatedNote.sourceUrl || "",
      hasFileUpload: false,
      uploadEnrichment: null,
      fileDataUrl: null,
      fileName: updatedNote.fileName || "",
      fileMime: updatedNote.fileMime || "",
    });
  } else {
    // Sync consolidated file even without re-enrichment
    await updateConsolidatedMemoryFile(updatedNote, actorContext.workspaceId);
  }

  return updatedNote;
}

function normalizeNoteComments(rawComments = []) {
  return (Array.isArray(rawComments) ? rawComments : [])
    .map((entry) => ({
      id: String(entry?.id || "").trim(),
      text: String(entry?.text || "").trim(),
      createdAt: String(entry?.createdAt || "").trim(),
      authorUserId: String(entry?.authorUserId || "").trim() || null,
    }))
    .filter((entry) => entry.text);
}

export async function addMemoryComment({ id, text, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Missing id");

  const normalizedText = String(text || "").trim();
  if (!normalizedText) throw new Error("Missing comment text");
  if (normalizedText.length > 2000) throw new Error("Comment is too long (max 2000 chars)");

  const existing = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
  if (!existing) throw new Error(`Memory not found: ${normalizedId}`);
  assertCanMutateNote(existing, actorContext);

  const comment = {
    id: crypto.randomUUID(),
    text: normalizedText,
    createdAt: nowIso(),
    authorUserId: actorContext.userId,
  };

  const existingComments = normalizeNoteComments(existing.metadata?.comments);
  const nextComments = [...existingComments, comment].slice(-200);
  const nextMetadata = {
    ...(existing.metadata || {}),
    comments: nextComments,
  };

  const updatedNote = await noteRepo.updateEnrichment({
    id: normalizedId,
    summary: existing.summary || "",
    tags: Array.isArray(existing.tags) ? existing.tags : [],
    project: existing.project || "General",
    embedding: existing.embedding || null,
    metadata: nextMetadata,
    updatedAt: nowIso(),
    workspaceId: actorContext.workspaceId,
  });

  await updateConsolidatedMemoryFile(updatedNote, actorContext.workspaceId);
  return {
    note: updatedNote,
    comment,
  };
}

export async function deleteMemory({ id, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Missing id");
  }

  const note = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
  if (!note) {
    return {
      id: normalizedId,
      deleted: false,
    };
  }

  assertCanMutateNote(note, actorContext);
  await noteRepo.deleteNote(normalizedId, actorContext.workspaceId);
  await cleanupDeletedNotesArtifacts([note], actorContext.workspaceId);
  return {
    id: normalizedId,
    deleted: true,
  };
}

export async function deleteProjectMemories({ project, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  assertWorkspaceManager(actorContext);
  const normalizedProject = String(project || "").trim();
  if (!normalizedProject) {
    throw new Error("Missing project");
  }

  const notes = await noteRepo.listByExactProject(normalizedProject, actorContext.workspaceId);
  if (!notes.length) {
    return {
      project: normalizedProject,
      deletedCount: 0,
      deletedIds: [],
    };
  }

  const deletedCount = await noteRepo.deleteByProject(normalizedProject, actorContext.workspaceId);
  await cleanupDeletedNotesArtifacts(notes, actorContext.workspaceId);
  return {
    project: normalizedProject,
    deletedCount,
    deletedIds: notes.map((note) => note.id),
  };
}

export async function batchDeleteMemories({ ids, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedIds = Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
  if (!normalizedIds.length) return { deleted: 0 };

  // Fetch notes before deleting so we can clean up artifacts
  const notes = (await Promise.all(
    normalizedIds.map((id) => noteRepo.getNoteById(id, actorContext.workspaceId))
  )).filter(Boolean);

  for (const note of notes) {
    assertCanMutateNote(note, actorContext);
  }

  const deleted = await noteRepo.batchDelete(normalizedIds, actorContext.workspaceId);
  await cleanupDeletedNotesArtifacts(notes, actorContext.workspaceId);
  return { deleted };
}

export async function batchMoveMemories({ ids, project = "", actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedIds = Array.isArray(ids) ? ids.map((id) => String(id || "").trim()).filter(Boolean) : [];
  if (!normalizedIds.length) return { moved: 0 };

  const notes = (await Promise.all(
    normalizedIds.map((id) => noteRepo.getNoteById(id, actorContext.workspaceId))
  )).filter(Boolean);

  for (const note of notes) {
    assertCanMutateNote(note, actorContext);
  }

  const moved = await noteRepo.batchMove(normalizedIds, String(project || ""), actorContext.workspaceId);
  return { moved };
}

export async function listRecentMemories(limit = 20, offset = 0, actor = null) {
  const actorContext = resolveActor(actor);
  return await listVisibleNotesForActor({
    actorContext,
    limit: clampInt(limit, 1, 200, 20),
    offset: clampInt(offset, 0, 100000, 0),
  });
}

export async function getMemoryRawContent({ id, includeMarkdown = true, maxChars = 12000, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedId = String(id || "").trim();
  if (!normalizedId) {
    throw new Error("Missing id");
  }

  const note = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
  if (!note) {
    throw new Error(`Memory not found: ${normalizedId}`);
  }
  assertCanReadNote(note, actorContext);

  const boundedMax = clampInt(maxChars, 200, 200000, 12000);
  return {
    id: note.id,
    sourceType: note.sourceType,
    fileName: note.fileName,
    fileMime: note.fileMime,
    project: note.project,
    createdAt: note.createdAt,
    rawContent: String(note.rawContent || "").slice(0, boundedMax),
    markdownContent: includeMarkdown ? String(note.markdownContent || "").slice(0, boundedMax) : undefined,
  };
}

export async function searchRawMemories({ query = "", project = "", limit = 8, includeMarkdown = true, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    throw new Error("Missing query");
  }

  const boundedLimit = clampInt(limit, 1, 100, 8);
  const normalizedProject = String(project || "").trim();
  const candidates = await listSearchCandidatesForActor(actorContext, normalizedProject, 500);
  const tokenizedQuery = tokenize(normalizedQuery);
  const bm25Index = buildBm25Index(candidates, (note) => `${note.rawContent || ""}\n${note.markdownContent || ""}\n${note.content || ""}`);
  const scored = candidates
    .map((note, docIndex) => {
      const searchableText = `${note.rawContent || ""}\n${note.markdownContent || ""}\n${note.content || ""}`;
      const bm25 = bm25ScoreFromIndex(bm25Index, docIndex, tokenizedQuery);
      const lexical = lexicalScore(
        {
          ...note,
          content: searchableText,
          rawContent: note.rawContent || "",
          markdownContent: note.markdownContent || "",
        },
        tokenizedQuery
      );
      const phraseBoost = searchableText.toLowerCase().includes(normalizedQuery.toLowerCase()) ? 0.15 : 0;
      const score = bm25 * 0.85 + lexical * 0.15 + phraseBoost;
      return { note, score, bm25, lexical };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, boundedLimit * 3);

  const normalized = normalizeScores(scored, (entry) => entry.score);
  const ranked = scored
    .map((entry) => ({ ...entry, score: normalized.get(entry) || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, boundedLimit)
    .map((entry, index) => ({
      rank: index + 1,
      score: entry.score,
      note: {
        id: entry.note.id,
        project: entry.note.project,
        sourceType: entry.note.sourceType,
        fileName: entry.note.fileName,
        fileMime: entry.note.fileMime,
        createdAt: entry.note.createdAt,
        summary: entry.note.summary,
        excerpt: makeExcerpt(entry.note.rawContent || entry.note.markdownContent || entry.note.content || "", normalizedQuery),
        rawContent: String(entry.note.rawContent || ""),
        markdownContent: includeMarkdown ? String(entry.note.markdownContent || "") : undefined,
      },
    }));

  return ranked;
}

export async function readExtractedMarkdownMemory({ filePath = "", maxChars = 30000, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  assertWorkspaceManager(actorContext);
  const boundedMax = clampInt(maxChars, 200, 500000, 30000);
  const requestedPath = String(filePath || "").trim();
  const resolvedFilePath = requestedPath || getConsolidatedMemoryFilePath(actorContext.workspaceId);
  let content;
  try {
    content = await fs.readFile(resolvedFilePath, "utf8");
  } catch (error) {
    const isMissing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    if (isMissing && !requestedPath) {
      content = makeConsolidatedTemplate();
      await fs.writeFile(resolvedFilePath, content, "utf8");
    } else if (isMissing) {
      throw new Error(`Consolidated markdown memory file not found: ${resolvedFilePath}`);
    } else {
      throw error;
    }
  }

  return {
    filePath: resolvedFilePath,
    bytes: Buffer.byteLength(content, "utf8"),
    content: content.slice(0, boundedMax),
    truncated: content.length > boundedMax,
  };
}

export async function listProjects(actor = null) {
  const actorContext = resolveActor(actor);
  if (isWorkspaceManager(actorContext)) {
    return noteRepo.listProjects(actorContext.workspaceId);
  }
  return noteRepo.listProjectsForUser(actorContext.workspaceId, actorContext.userId);
}

export async function searchNotesBm25({ query = "", project = "", limit = 8, includeMarkdown = false, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    throw new Error("Missing query");
  }

  const boundedLimit = clampInt(limit, 1, 100, 8);
  const normalizedProject = String(project || "").trim();
  const notes = await listSearchCandidatesForActor(actorContext, normalizedProject, 500);
  if (notes.length === 0) return [];

  const queryTokens = tokenize(normalizedQuery);
  const bm25Index = buildBm25Index(
    notes,
    (note) =>
      `${note.content || ""}\n${note.rawContent || ""}\n${note.markdownContent || ""}\n${note.summary || ""}\n${(note.tags || []).join(" ")}\n${note.project || ""}\n${note.fileName || ""}`
  );

  const scored = notes
    .map((note, docIndex) => ({
      note,
      bm25: bm25ScoreFromIndex(bm25Index, docIndex, queryTokens),
    }))
    .filter((entry) => entry.bm25 > 0)
    .sort((a, b) => b.bm25 - a.bm25)
    .slice(0, boundedLimit);

  const normalizedScores = normalizeScores(scored, (entry) => entry.bm25);
  return scored.map((entry, index) => ({
    rank: index + 1,
    score: normalizedScores.get(entry) || 0,
    note: {
      id: entry.note.id,
      content: entry.note.content,
      sourceType: entry.note.sourceType,
      sourceUrl: entry.note.sourceUrl,
      fileName: entry.note.fileName,
      fileMime: entry.note.fileMime,
      summary: entry.note.summary,
      tags: entry.note.tags || [],
      project: entry.note.project,
      createdAt: entry.note.createdAt,
      excerpt: makeExcerpt(entry.note.rawContent || entry.note.markdownContent || entry.note.content || "", normalizedQuery),
      rawContent: String(entry.note.rawContent || ""),
      markdownContent: includeMarkdown ? String(entry.note.markdownContent || "") : undefined,
    },
  }));
}

export async function searchMemories({ query = "", project = "", limit = 15, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const boundedLimit = clampInt(limit, 1, 100, 15);
  const normalizedQuery = String(query || "").trim();
  const normalizedProject = String(project || "").trim();

  if (!normalizedQuery) {
    const notes = await listVisibleNotesForActor({
      actorContext,
      project: normalizedProject,
      limit: boundedLimit,
      offset: 0,
    });
    return notes.map((note, index) => materializeCitation(note, 1 - index * 0.001, index + 1));
  }

  const notes = await listSearchCandidatesForActor(actorContext, normalizedProject, 500);
  if (notes.length === 0) return [];

  const queryTokens = tokenize(normalizedQuery);
  const bm25Index = buildBm25Index(
    notes,
    (note) =>
      `${note.content || ""}\n${note.rawContent || ""}\n${note.markdownContent || ""}\n${note.summary || ""}\n${(note.tags || []).join(" ")}\n${note.project || ""}\n${note.fileName || ""}`
  );
  let queryEmbedding = embeddingCache.get(normalizedQuery);
  if (!queryEmbedding) {
    try {
      queryEmbedding = await createEmbedding(normalizedQuery);
    } catch {
      queryEmbedding = pseudoEmbedding(normalizedQuery);
    }
    embeddingCache.set(normalizedQuery, queryEmbedding);
  }

  const ranked = notes.map((note, docIndex) => {
    const noteEmbedding = Array.isArray(note.embedding) ? note.embedding : pseudoEmbedding(`${note.content}\n${note.summary}`);
    const semantic = cosineSimilarity(queryEmbedding, noteEmbedding);
    const lexical = lexicalScore(note, queryTokens);
    const bm25 = bm25ScoreFromIndex(bm25Index, docIndex, queryTokens);
    const phraseBoost = `${note.content || ""}\n${note.rawContent || ""}\n${note.markdownContent || ""}`.toLowerCase().includes(normalizedQuery.toLowerCase()) ? 0.05 : 0;
    const freshnessBoost = Math.max(0, 1 - (Date.now() - new Date(note.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)) * 0.05;
    return { note, semantic, lexical, bm25, phraseBoost, freshnessBoost };
  });

  const semanticNormalized = normalizeScores(ranked, (item) => item.semantic);
  const bm25Normalized = normalizeScores(ranked, (item) => item.bm25);

  const combined = ranked.map((item) => ({
    ...item,
    score:
      (semanticNormalized.get(item) || 0) * 0.3 +
      (bm25Normalized.get(item) || 0) * 0.5 +
      item.lexical * 0.15 +
      item.phraseBoost +
      item.freshnessBoost * 0.4,
  }));

  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, boundedLimit).map((item, index) => materializeCitation(item.note, item.score, index + 1));
}

function serializeNotesAsMarkdown(notes = []) {
  return (Array.isArray(notes) ? notes : [])
    .map((note) => {
      const title = note.summary || note.content?.slice(0, 80) || "(untitled)";
      const tags = (note.tags || []).map((tag) => `\`${tag}\``).join(" ");
      const body = note.markdownContent || note.rawContent || note.content || "";
      return `## ${title}\n\n${tags ? `Tags: ${tags}\n\n` : ""}${body}\n\n---\n`;
    })
    .join("\n");
}

export async function listTags(actor = null) {
  const actorContext = resolveActor(actor);
  if (isWorkspaceManager(actorContext)) {
    return noteRepo.listTags(actorContext.workspaceId);
  }
  return noteRepo.listTagsForUser(actorContext.workspaceId, actorContext.userId);
}

export async function getMemoryStats(actor = null) {
  const actorContext = resolveActor(actor);
  if (isWorkspaceManager(actorContext)) {
    return noteRepo.getStats(actorContext.workspaceId);
  }
  return noteRepo.getStatsForUser(actorContext.workspaceId, actorContext.userId);
}

export async function exportMemories({ project = null, format = "json", actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedProject = String(project || "").trim();

  const notes = await listVisibleNotesForActor({
    actorContext,
    project: normalizedProject,
    limit: 10000,
    offset: 0,
  });

  if (String(format || "").toLowerCase() === "markdown") {
    return serializeNotesAsMarkdown(notes);
  }

  return JSON.stringify(notes, null, 2);
}

export function buildCitationBlock(citations) {
  return citations
    .map((entry, idx) => {
      const label = `N${idx + 1}`;
      const note = entry.note;
      return [
        `[${label}] note_id=${note.id}`,
        `summary: ${note.summary || ""}`,
        `project: ${note.project || ""}`,
        `source_url: ${note.sourceUrl || ""}`,
        `content: ${note.content || ""}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export async function findRelatedMemories({ id, limit = 5, actor = null } = {}) {
  const actorContext = resolveActor(actor);
  const normalizedId = String(id || "").trim();
  if (!normalizedId) throw new Error("Missing id");

  const boundedLimit = clampInt(limit, 1, 20, 5);
  const sourceNote = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
  if (!sourceNote) throw new Error(`Memory not found: ${normalizedId}`);
  assertCanReadNote(sourceNote, actorContext);

  const candidates = await listSearchCandidatesForActor(actorContext, "", 500);
  if (candidates.length <= 1) return [];

  const sourceEmbedding = Array.isArray(sourceNote.embedding)
    ? sourceNote.embedding
    : pseudoEmbedding(`${sourceNote.content}\n${sourceNote.summary}`);

  const scored = candidates
    .filter((note) => note.id !== normalizedId)
    .map((note) => {
      const noteEmbedding = Array.isArray(note.embedding)
        ? note.embedding
        : pseudoEmbedding(`${note.content}\n${note.summary}`);
      const score = cosineSimilarity(sourceEmbedding, noteEmbedding);
      return { note, score };
    })
    .filter((entry) => entry.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, boundedLimit);

  return scored.map((entry, index) => materializeCitation(entry.note, entry.score, index + 1));
}

export async function askMemories({ question, project = "", limit = 6, contextNoteId = "", actor = null }) {
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) {
    throw new Error("Missing question");
  }

  let citations = await searchMemories({ query: normalizedQuestion, project, limit, actor });

  // If contextNoteId provided, prepend that note as primary citation
  const normalizedContextId = String(contextNoteId || "").trim();
  if (normalizedContextId) {
    const actorContext = resolveActor(actor);
    try {
      const contextNote = await noteRepo.getNoteById(normalizedContextId, actorContext.workspaceId);
      if (contextNote && canReadNote(contextNote, actorContext)) {
        const contextCitation = materializeCitation(contextNote, 1.0, 0);
        // Deduplicate if note already in results
        citations = citations.filter((c) => c.note?.id !== normalizedContextId);
        citations = [contextCitation, ...citations].slice(0, limit);
        // Re-number ranks
        citations = citations.map((c, i) => ({ ...c, rank: i + 1 }));
      }
    } catch {
      // Context note fetch failed, proceed with normal citations
    }
  }

  if (citations.length === 0) {
    return {
      answer: "No relevant memory found yet. Save a few notes first.",
      citations: [],
      mode: "empty",
    };
  }

  if (!hasOpenAI()) {
    const answer = [
      "Based on your saved notes:",
      ...citations.slice(0, 4).map((entry, idx) => `- [N${idx + 1}] ${entry.note.summary || heuristicSummary(entry.note.content, 120)}`),
    ].join("\n");
    return {
      answer,
      citations,
      mode: "heuristic",
    };
  }

  try {
    const context = buildCitationBlock(citations);
    const { text } = await createResponse({
      instructions:
        "Answer ONLY using the provided memory snippets. Be concise. Every factual claim must cite at least one snippet using [N1], [N2], etc. If uncertain, say what is missing.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Question: ${normalizedQuestion}\n\nMemory snippets:\n${context}`,
            },
          ],
        },
      ],
      temperature: 0.2,
    });

    return {
      answer: text || "I could not generate an answer.",
      citations,
      mode: "openai",
    };
  } catch {
    const answer = [
      "I could not call the model, but these notes look relevant:",
      ...citations.slice(0, 4).map((entry, idx) => `- [N${idx + 1}] ${entry.note.summary || heuristicSummary(entry.note.content, 120)}`),
    ].join("\n");
    return {
      answer,
      citations,
      mode: "fallback",
    };
  }
}

export async function buildProjectContext({ task, project = "", limit = 8, actor = null }) {
  const normalizedTask = String(task || "").trim();
  const citations = await searchMemories({ query: normalizedTask || project || "recent", project, limit, actor });
  if (citations.length === 0) {
    return {
      context: "No project context found yet.",
      citations: [],
      mode: "empty",
    };
  }

  if (!hasOpenAI()) {
    return {
      context: citations
        .map((entry, idx) => `[N${idx + 1}] ${entry.note.summary || heuristicSummary(entry.note.content, 120)}`)
        .join("\n"),
      citations,
      mode: "heuristic",
    };
  }

  try {
    const contextBlock = buildCitationBlock(citations);
    const { text } = await createResponse({
      instructions:
        "Build a short project context brief (decisions, open questions, next actions) from the notes. Cite snippets as [N1], [N2], etc.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Task: ${normalizedTask || "Build project context"}\n\nSnippets:\n${contextBlock}`,
            },
          ],
        },
      ],
      temperature: 0.2,
    });

    return {
      context: text || "No context generated.",
      citations,
      mode: "openai",
    };
  } catch {
    return {
      context: citations
        .map((entry, idx) => `[N${idx + 1}] ${entry.note.summary || heuristicSummary(entry.note.content, 120)}`)
        .join("\n"),
      citations,
      mode: "fallback",
    };
  }
}
