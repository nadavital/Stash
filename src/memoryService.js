import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config, publicUploadPath } from "./config.js";
import {
  noteRepo,
  versionRepo,
  enrichmentJobRepo,
  folderRepo,
  authRepo,
  collaborationRepo,
} from "./storage/provider.js";
import { enrichmentQueue } from "./queue.js";
import { logger } from "./logger.js";
import { publishActivity } from "./activityBus.js";
import {
  buildWebSearchTool,
  convertUploadToMarkdown,
  createEmbedding,
  createResponse,
  extractDomainFromUrl,
  extractDomainsFromText,
  extractOutputUrlCitations,
  hasOpenAI,
  pseudoEmbedding,
  cosineSimilarity,
  heuristicSummary,
  heuristicTags,
} from "./openai.js";
import { createMemoryChatOps } from "./memory/chatMemoryOps.js";
import { createCollaborationMemoryOps } from "./memory/collaborationMemoryOps.js";
import { createMemoryMutationOps } from "./memory/mutationMemoryOps.js";
import { createMemoryQueryOps } from "./memory/queryMemoryOps.js";
import { createMemoryAccessOps } from "./memory/accessMemoryOps.js";
import { createVisibilityMemoryOps } from "./memory/visibilityMemoryOps.js";
import { createMemoryEnrichmentOps } from "./memory/enrichmentMemoryOps.js";

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
const MEMORY_SCOPES = new Set(["all", "workspace", "user", "project", "item"]);
const FOLDER_ROLE_RANK = Object.freeze({
  viewer: 1,
  editor: 2,
  manager: 3,
});
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

function normalizeBaseRevision(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("baseRevision must be a positive integer");
  }
  return Math.floor(parsed);
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
  return {
    workspaceId,
    userId: userId || null,
    role,
    userName: String(actor?.userName || actor?.name || "").trim(),
    userEmail: String(actor?.userEmail || actor?.email || "").trim(),
  };
}

function authorizationError(message = "Forbidden") {
  const error = new Error(message);
  error.status = 403;
  return error;
}

const memoryAccessOps = createMemoryAccessOps({
  config,
  folderRepo,
  collaborationRepo,
  logger,
  publishActivity,
  authorizationError,
  folderRoleRank: FOLDER_ROLE_RANK,
});

const {
  isWorkspaceManager,
  noteOwnerId,
  normalizeFolderMemberRole,
  roleAtLeast,
  buildFolderAccessContext,
  canReadNote,
  assertCanReadNote,
  canMutateNote,
  assertCanMutateNote,
  assertWorkspaceManager,
  resolveFolderByIdOrName,
  resolveCanonicalProjectName,
  assertCanViewFolder,
  assertCanManageFolder,
  emitWorkspaceActivity,
  noteDisplayTitle,
  emitNoteActivity,
  buildActivityMessage,
} = memoryAccessOps;

function normalizeMemoryScope(value) {
  const normalized = String(value || "all")
    .trim()
    .toLowerCase();
  return MEMORY_SCOPES.has(normalized) ? normalized : "all";
}

function normalizeWorkingSetIds(rawValue, max = 50) {
  const values = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === "string"
      ? rawValue.split(/[,\n]/)
      : [];
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
    if (unique.length >= max) break;
  }
  return unique;
}

const memoryVisibilityOps = createVisibilityMemoryOps({
  normalizeMemoryScope,
  normalizeWorkingSetIds,
  clampInt,
  noteRepo,
  buildFolderAccessContext,
  canReadNote,
  isWorkspaceManager,
});

const {
  loadWorkingSetNotesForActor,
  listVisibleNotesForActor,
  listSearchCandidatesForActor,
} = memoryVisibilityOps;

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

function normalizeInlineTitleText(value, maxLen = 180) {
  let text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/g, "")
    .replace(/^\s*[-*+]\s+/g, "")
    .replace(/^\s*\d+[.)]\s+/g, "")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length > maxLen) {
    text = `${text.slice(0, maxLen - 1).trim()}...`;
  }
  return text;
}

function extractAutoTitleFromMarkdownishText(value, maxLen = 180) {
  const source = String(value || "").replace(/\r\n/g, "\n");
  if (!source.trim()) return "";
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading?.[1]) {
      const cleaned = normalizeInlineTitleText(heading[1], maxLen);
      if (cleaned) return cleaned;
    }
  }

  for (const line of lines) {
    if (line.startsWith("```")) continue;
    const cleaned = normalizeInlineTitleText(line, maxLen);
    if (cleaned) return cleaned;
  }

  return "";
}

function deriveMemoryTitle({
  explicitTitle = "",
  sourceType = "text",
  content = "",
  markdownContent = "",
  rawContent = "",
  fileName = "",
} = {}) {
  const normalizedExplicit = normalizeInlineTitleText(explicitTitle, 180);
  if (normalizedExplicit) return normalizedExplicit;

  const normalizedType = normalizeSourceType(sourceType);
  if (normalizedType === "link") return "";

  const fromText = extractAutoTitleFromMarkdownishText(
    [content, markdownContent, rawContent].filter(Boolean).join("\n"),
    180
  );
  if (fromText && !/^https?:\/\//i.test(fromText)) return fromText;

  const cleanedFileName = normalizeInlineTitleText(String(fileName || "").replace(/\.[^.]+$/, ""), 180);
  if (cleanedFileName) return cleanedFileName;

  return "";
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

const memoryEnrichmentOps = createMemoryEnrichmentOps({
  config,
  publicUploadPath,
  fs,
  path,
  crypto,
  hasOpenAI,
  createResponse,
  convertUploadToMarkdown,
  createEmbedding,
  pseudoEmbedding,
  heuristicSummary,
  heuristicTags,
  noteRepo,
  enrichmentQueue,
  logger,
  nowIso,
  getConsolidatedMemoryFilePath,
  makeConsolidatedTemplate,
  consolidatedSections: CONSOLIDATED_SECTIONS,
});

const {
  inferEntityTitleFromUrl: inferEntityTitleFromUrlOp,
  parseGenericDataUrl: parseGenericDataUrlOp,
  inferMimeFromFileName: inferMimeFromFileNameOp,
  maybeDecodeTextUpload: maybeDecodeTextUploadOp,
  saveImageDataUrl: saveImageDataUrlOp,
  mimeToExt: mimeToExtOp,
  updateConsolidatedMemoryFile: updateConsolidatedMemoryFileOp,
  cleanupDeletedNotesArtifacts: cleanupDeletedNotesArtifactsOp,
  cleanupReplacedImageArtifact: cleanupReplacedImageArtifactOp,
  buildEnrichmentJobParamsFromNote: buildEnrichmentJobParamsFromNoteOp,
  enqueueEnrichmentJob: enqueueEnrichmentJobOp,
} = memoryEnrichmentOps;

export function resolveEnrichmentProject(params = {}) {
  return memoryEnrichmentOps.resolveEnrichmentProject(params);
}

const memoryMutationOps = createMemoryMutationOps({
  resolveActor,
  normalizeSourceType,
  inferEntityTitleFromUrl: inferEntityTitleFromUrlOp,
  resolveCanonicalProjectName,
  parseGenericDataUrl: parseGenericDataUrlOp,
  inferMimeFromFileName: inferMimeFromFileNameOp,
  maybeDecodeTextUpload: maybeDecodeTextUploadOp,
  saveImageDataUrl: saveImageDataUrlOp,
  mimeToExt: mimeToExtOp,
  deriveMemoryTitle,
  heuristicSummary,
  heuristicTags,
  noteRepo,
  versionRepo,
  enrichmentJobRepo,
  enrichmentQueue,
  noteOwnerId,
  enqueueEnrichmentJob: enqueueEnrichmentJobOp,
  buildEnrichmentJobParamsFromNote: buildEnrichmentJobParamsFromNoteOp,
  emitNoteActivity,
  emitWorkspaceActivity,
  updateConsolidatedMemoryFile: updateConsolidatedMemoryFileOp,
  cleanupReplacedImageArtifact: cleanupReplacedImageArtifactOp,
  cleanupDeletedNotesArtifacts: cleanupDeletedNotesArtifactsOp,
  assertCanMutateNote,
  assertCanReadNote,
  buildFolderAccessContext,
  canMutateNote,
  authorizationError,
  normalizeBaseRevision,
  nowIso,
  assertWorkspaceManager,
  clampInt,
});

/**
 * Phase A: Synchronous note creation.
 * Saves the note instantly with heuristic enrichment, then enqueues
 * background AI enrichment. Returns the note immediately (<200ms).
 */
export async function createMemory(params = {}) {
  return memoryMutationOps.createMemory(params);
}

export async function updateMemory(params = {}) {
  return memoryMutationOps.updateMemory(params);
}

export async function updateMemoryAttachment(params = {}) {
  return memoryMutationOps.updateMemoryAttachment(params);
}

export async function updateMemoryExtractedContent(params = {}) {
  return memoryMutationOps.updateMemoryExtractedContent(params);
}

export async function listMemoryVersions(params = {}) {
  return memoryMutationOps.listMemoryVersions(params);
}

export async function restoreMemoryVersion(params = {}) {
  return memoryMutationOps.restoreMemoryVersion(params);
}

export async function retryMemoryEnrichment(params = {}) {
  return memoryMutationOps.retryMemoryEnrichment(params);
}

export async function getEnrichmentQueueStats(params = {}) {
  return memoryMutationOps.getEnrichmentQueueStats(params);
}

export async function addMemoryComment(params = {}) {
  return memoryMutationOps.addMemoryComment(params);
}

export async function deleteMemory(params = {}) {
  return memoryMutationOps.deleteMemory(params);
}

export async function deleteProjectMemories(params = {}) {
  return memoryMutationOps.deleteProjectMemories(params);
}

export async function batchCreateMemories(params = {}) {
  return memoryMutationOps.batchCreateMemories(params);
}

export async function batchDeleteMemories(params = {}) {
  return memoryMutationOps.batchDeleteMemories(params);
}

export async function batchMoveMemories(params = {}) {
  return memoryMutationOps.batchMoveMemories(params);
}

export async function getMemoryById(params = {}) {
  return memoryMutationOps.getMemoryById(params);
}

const memoryCollaborationOps = createCollaborationMemoryOps({
  resolveActor,
  folderRepo,
  collaborationRepo,
  authRepo,
  emitWorkspaceActivity,
  resolveFolderByIdOrName,
  buildFolderAccessContext,
  assertCanViewFolder,
  assertCanManageFolder,
  normalizeFolderMemberRole,
  isWorkspaceManager,
  buildActivityMessage,
});

export async function createWorkspaceFolder({
  name,
  description = "",
  color = "green",
  symbol = "DOC",
  parentId = null,
  actor = null,
} = {}) {
  return memoryCollaborationOps.createWorkspaceFolder({
    name,
    description,
    color,
    symbol,
    parentId,
    actor,
  });
}

export async function updateWorkspaceFolder({
  id,
  patch = {},
  actor = null,
} = {}) {
  return memoryCollaborationOps.updateWorkspaceFolder({
    id,
    patch,
    actor,
  });
}

export async function deleteWorkspaceFolder({
  id,
  actor = null,
} = {}) {
  return memoryCollaborationOps.deleteWorkspaceFolder({
    id,
    actor,
  });
}

export async function listFolderCollaborators({
  folderId,
  actor = null,
} = {}) {
  return memoryCollaborationOps.listFolderCollaborators({
    folderId,
    actor,
  });
}

export async function setFolderCollaboratorRole({
  folderId,
  userId,
  role = "viewer",
  actor = null,
} = {}) {
  return memoryCollaborationOps.setFolderCollaboratorRole({
    folderId,
    userId,
    role,
    actor,
  });
}

export async function removeFolderCollaborator({
  folderId,
  userId,
  actor = null,
} = {}) {
  return memoryCollaborationOps.removeFolderCollaborator({
    folderId,
    userId,
    actor,
  });
}

export async function listWorkspaceActivity({
  actor = null,
  folderId = "",
  noteId = "",
  limit = 60,
} = {}) {
  return memoryCollaborationOps.listWorkspaceActivity({
    actor,
    folderId,
    noteId,
    limit,
  });
}

const memoryQueryOps = createMemoryQueryOps({
  resolveActor,
  listVisibleNotesForActor,
  clampInt,
  noteRepo,
  assertCanReadNote,
  listSearchCandidatesForActor,
  tokenize,
  buildBm25Index,
  bm25ScoreFromIndex,
  lexicalScore,
  normalizeScores,
  makeExcerpt,
  getConsolidatedMemoryFilePath,
  makeConsolidatedTemplate,
  fs,
  isWorkspaceManager,
  collaborationRepo,
  folderRepo,
  normalizeFolderMemberRole,
  roleAtLeast,
  materializeCitation,
  normalizeMemoryScope,
  normalizeWorkingSetIds,
  createEmbedding,
  embeddingCache,
  pseudoEmbedding,
  cosineSimilarity,
});

export async function listRecentMemories(limit = 20, offset = 0, actor = null, options = {}) {
  return memoryQueryOps.listRecentMemories(limit, offset, actor, options);
}

export async function getMemoryRawContent(params = {}) {
  return memoryQueryOps.getMemoryRawContent(params);
}

export async function searchRawMemories(params = {}) {
  return memoryQueryOps.searchRawMemories(params);
}

export async function readExtractedMarkdownMemory(params = {}) {
  return memoryQueryOps.readExtractedMarkdownMemory(params);
}

export async function listProjects(actor = null) {
  return memoryQueryOps.listProjects(actor);
}

export async function searchNotesBm25(params = {}) {
  return memoryQueryOps.searchNotesBm25(params);
}

export async function searchMemories(params = {}) {
  return memoryQueryOps.searchMemories(params);
}

export async function listTags(actor = null) {
  return memoryQueryOps.listTags(actor);
}

export async function getMemoryStats(actor = null) {
  return memoryQueryOps.getMemoryStats(actor);
}

export async function exportMemories(params = {}) {
  return memoryQueryOps.exportMemories(params);
}

const memoryChatOps = createMemoryChatOps({
  searchMemories,
  resolveActor,
  noteRepo,
  buildFolderAccessContext,
  canReadNote,
  materializeCitation,
  listSearchCandidatesForActor,
  pseudoEmbedding,
  cosineSimilarity,
  extractDomainFromUrl,
  extractDomainsFromText,
  hasOpenAI,
  config,
  buildWebSearchTool,
  createResponse,
  extractOutputUrlCitations,
  heuristicSummary,
  noteDisplayTitle,
});

export function buildCitationBlock(citations) {
  return memoryChatOps.buildCitationBlock(citations);
}

export async function findRelatedMemories({
  id,
  limit = 5,
  actor = null,
  scope = "all",
  workingSetIds = [],
} = {}) {
  return memoryChatOps.findRelatedMemories({
    id,
    limit,
    actor,
    scope,
    workingSetIds,
  });
}

export async function askMemories({
  question,
  project = "",
  limit = 6,
  contextNoteId = "",
  actor = null,
  scope = "all",
  workingSetIds = [],
}) {
  return memoryChatOps.askMemories({
    question,
    project,
    limit,
    contextNoteId,
    actor,
    scope,
    workingSetIds,
  });
}

export async function buildProjectContext({
  task,
  project = "",
  limit = 8,
  actor = null,
  scope = "all",
  workingSetIds = [],
  contextNoteId = "",
}) {
  return memoryChatOps.buildProjectContext({
    task,
    project,
    limit,
    actor,
    scope,
    workingSetIds,
    contextNoteId,
  });
}
