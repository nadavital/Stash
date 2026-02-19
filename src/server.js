import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, ROOT_DIR } from "./config.js";
import { hasOpenAI } from "./openai.js";
import {
  askMemories,
  batchMoveMemories,
  batchDeleteMemories,
  addMemoryComment,
  buildCitationBlock,
  buildProjectContext,
  createMemory,
  deleteMemory,
  deleteProjectMemories,
  exportMemories,
  findRelatedMemories,
  getMemoryById,
  getMemoryStats,
  getEnrichmentQueueStats,
  getMemoryRawContent,
  listMemoryVersions,
  listProjects,
  listRecentMemories,
  listWorkspaceActivity,
  listFolderCollaborators,
  listTags,
  retryMemoryEnrichment,
  setFolderCollaboratorRole,
  removeFolderCollaborator,
  restoreMemoryVersion,
  searchMemories,
  createWorkspaceFolder,
  updateWorkspaceFolder,
  deleteWorkspaceFolder,
  updateMemory,
  updateMemoryAttachment,
  updateMemoryExtractedContent,
} from "./memoryService.js";
import {
  createCitationNoteAliasMap,
  createCitationNoteNameAliasMap,
  resolveAgentToolArgs,
} from "./chatToolArgs.js";
import { createStreamingResponse } from "./openai.js";
import {
  noteRepo,
  taskRepo,
  folderRepo,
  authRepo,
  collaborationRepo,
  providerName,
  storageBridgeMode,
} from "./storage/provider.js";
import { enrichmentQueue } from "./queue.js";
import { createAgentToolHarness } from "./agentHarness.js";
import { logger, requestLogger } from "./logger.js";
import { createRateLimiter } from "./rateLimit.js";
import { validateNotePayload, validateBatchPayload } from "./validate.js";
import { extractSessionTokenFromHeaders } from "./authHeaders.js";
import { subscribeActivity } from "./activityBus.js";
import {
  deleteFirebaseUser,
  firebaseChangePassword,
  firebaseSendEmailVerification,
  firebaseRefreshIdToken,
  firebaseSendPasswordResetEmail,
  firebaseSignInWithEmailPassword,
  firebaseSignUpWithEmailPassword,
  isFirebaseConfigured,
  revokeFirebaseUserSessions,
  verifyFirebaseIdToken,
} from "./firebaseAuthLazy.js";
import {
  isNeonConfigured,
  mapNeonClaimsToIdentity,
  neonSendPasswordResetEmail,
  neonSignInWithEmailPassword,
  neonSignUpWithEmailPassword,
  verifyNeonAccessToken,
} from "./neonAuth.js";

const checkRate = createRateLimiter();
const checkAuthRate = createRateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 50 });
const startedAt = Date.now();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function sendUnauthorized(res) {
  let hint = "Sign in via POST /api/auth/login, then send Authorization: Bearer <token>";
  if (config.authProvider === "firebase") {
    hint = "Sign in via Firebase auth endpoint, then send Authorization: Bearer <id_token>";
  } else if (config.authProvider === "neon") {
    hint = "Sign in via POST /api/auth/login (Neon-backed), then send Authorization: Bearer <access_token>";
  }
  sendJson(res, 401, {
    error: "Unauthorized",
    hint,
  });
}

function resolveErrorStatus(error, fallback = 400) {
  const candidate = Number(error?.status);
  return Number.isFinite(candidate) && candidate >= 400 && candidate <= 599 ? candidate : fallback;
}

function isWorkspaceManager(actor = null) {
  const role = String(actor?.role || "").toLowerCase();
  return role === "owner" || role === "admin";
}

function getRequestIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function getRequestOrigin(req) {
  const explicitOrigin = String(req.headers.origin || "").trim();
  if (explicitOrigin) return explicitOrigin;
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

const AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_CAPTCHA_THRESHOLD = 8;
const authFailureByIp = new Map();

function getAuthFailureStatus(ip) {
  const normalizedIp = String(ip || "unknown").trim() || "unknown";
  const now = Date.now();
  const entries = (authFailureByIp.get(normalizedIp) || []).filter((ts) => now - ts < AUTH_FAILURE_WINDOW_MS);
  if (entries.length > 0) {
    authFailureByIp.set(normalizedIp, entries);
  } else {
    authFailureByIp.delete(normalizedIp);
  }
  return {
    count: entries.length,
    requiresCaptcha: entries.length >= AUTH_CAPTCHA_THRESHOLD,
  };
}

function registerAuthFailure(ip) {
  const normalizedIp = String(ip || "unknown").trim() || "unknown";
  const now = Date.now();
  const entries = (authFailureByIp.get(normalizedIp) || []).filter((ts) => now - ts < AUTH_FAILURE_WINDOW_MS);
  entries.push(now);
  authFailureByIp.set(normalizedIp, entries);
  return {
    count: entries.length,
    requiresCaptcha: entries.length >= AUTH_CAPTCHA_THRESHOLD,
  };
}

function clearAuthFailures(ip) {
  const normalizedIp = String(ip || "unknown").trim() || "unknown";
  authFailureByIp.delete(normalizedIp);
}

function recordAuthEvent(event = {}) {
  const outcome = String(event.outcome || "unknown").toLowerCase();
  const logPayload = {
    eventType: event.eventType || "auth.unknown",
    outcome,
    provider: event.provider || "",
    userId: event.userId || "",
    workspaceId: event.workspaceId || "",
    email: event.email || "",
    ip: event.ip || "",
    reason: event.reason || "",
    metadata: event.metadata || null,
  };
  Promise.resolve(authRepo.recordAuthEvent(logPayload)).catch((error) => {
    logger.warn("auth_event_write_failed", {
      eventType: logPayload.eventType,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  if (outcome === "failure") {
    logger.warn("auth_event", logPayload);
  } else {
    logger.info("auth_event", logPayload);
  }
}

function buildSessionResponseFromActor({
  actor,
  token,
  refreshToken = "",
  createdAt = "",
  expiresAt = "",
  provider = "local",
}) {
  return {
    token,
    refreshToken: String(refreshToken || "").trim(),
    user: {
      id: actor.userId,
      email: actor.userEmail,
      displayName: actor.userName || "",
      emailVerified: actor.emailVerified !== false,
    },
    workspace: {
      id: actor.workspaceId,
      slug: actor.workspaceSlug || "",
      name: actor.workspaceName,
    },
    role: actor.role || "member",
    createdAt: createdAt || new Date().toISOString(),
    expiresAt: expiresAt || "",
    provider,
  };
}

function buildFirebaseSessionPayload(firebaseAuthResult, actor) {
  const expiresInSeconds = Number(firebaseAuthResult?.expiresIn || 0);
  const expiresAt = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : "";

  return buildSessionResponseFromActor({
    actor,
    token: String(firebaseAuthResult?.idToken || "").trim(),
    refreshToken: String(firebaseAuthResult?.refreshToken || "").trim(),
    createdAt: new Date().toISOString(),
    expiresAt,
    provider: "firebase",
  });
}

function buildNeonSessionPayload(neonAuthResult, actor) {
  return buildSessionResponseFromActor({
    actor,
    token: String(neonAuthResult?.token || "").trim(),
    refreshToken: String(neonAuthResult?.refreshToken || "").trim(),
    createdAt: new Date().toISOString(),
    expiresAt: String(neonAuthResult?.expiresAt || "").trim(),
    provider: "neon",
  });
}

async function resolveNeonActorFromToken(token, { preferredWorkspaceId = "" } = {}) {
  const claims = await verifyNeonAccessToken(token);
  const identity = mapNeonClaimsToIdentity(claims);
  const user = await authRepo.upsertProviderUser({
    provider: "neon",
    subject: identity.subject,
    email: identity.email,
    name: identity.name,
  });
  return authRepo.buildActorForUser(user, {
    preferredWorkspaceId,
    emailVerified: identity.emailVerified,
  });
}

async function buildActorFromRequest(req, { url = null, allowQueryToken = false } = {}) {
  const token = extractSessionTokenFromHeaders(req.headers);
  const tokenFromQuery = allowQueryToken ? url?.searchParams?.get("sessionToken") || "" : "";
  const finalToken = token || String(tokenFromQuery).trim();
  if (!finalToken) return null;
  const preferredWorkspaceId =
    String(req.headers["x-workspace-id"] || "").trim() ||
    String(url?.searchParams?.get("workspaceId") || "").trim();

  if (config.authProvider === "firebase") {
    try {
      const claims = await verifyFirebaseIdToken(finalToken);
      const actor = await authRepo.resolveFirebaseActorFromClaims(claims, { preferredWorkspaceId });
      return {
        token: finalToken,
        provider: "firebase",
        ...actor,
      };
    } catch {
      return null;
    }
  }
  if (config.authProvider === "neon") {
    try {
      const actor = await resolveNeonActorFromToken(finalToken, { preferredWorkspaceId });
      return {
        token: finalToken,
        provider: "neon",
        ...actor,
      };
    } catch {
      return null;
    }
  }

  const session = await authRepo.getSession(finalToken);
  if (!session) return null;
  try {
    const actor = await authRepo.buildActorForUserId(session.user.id, {
      preferredWorkspaceId,
      emailVerified: true,
    });
    return {
      token: finalToken,
      provider: "local",
      ...actor,
    };
  } catch {
    return null;
  }
}

async function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) {
      throw new Error("Request too large");
    }
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function parseWorkingSetIds(rawValue, max = 50) {
  const inputValues = Array.isArray(rawValue) ? rawValue : [rawValue];
  const values = [];
  const seen = new Set();
  for (const rawEntry of inputValues) {
    const parts = String(rawEntry || "").split(/[,\n]/);
    for (const part of parts) {
      const normalized = String(part || "").trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      values.push(normalized);
      if (values.length >= max) return values;
    }
  }
  return values;
}

function sanitizePath(baseDir, requestedPath) {
  const normalized = path.normalize(requestedPath).replace(/^([/\\])+/, "");
  const resolved = path.resolve(baseDir, normalized);
  if (!resolved.startsWith(baseDir)) {
    return null;
  }
  return resolved;
}

async function serveFile(res, absolutePath) {
  try {
    const stat = await fsp.stat(absolutePath);
    if (!stat.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(absolutePath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function queueEventNoteOwnerId(event = null) {
  const note = event?.result;
  if (!note || typeof note !== "object") return "";
  const explicitOwner = String(note.ownerUserId || "").trim();
  if (explicitOwner) return explicitOwner;
  const creator = String(note.createdByUserId || "").trim();
  if (creator) return creator;
  return String(note?.metadata?.actorUserId || "").trim();
}

function canActorReceiveQueueEvent(actor = null, event = null) {
  if (!actor || !event) return false;
  if (isWorkspaceManager(actor)) return true;
  const actorUserId = String(actor.userId || "").trim();
  if (!actorUserId) return false;

  const visibilityUserId = String(event.visibilityUserId || "").trim();
  if (visibilityUserId) {
    return visibilityUserId === actorUserId;
  }

  const ownerUserId = queueEventNoteOwnerId(event);
  if (ownerUserId) {
    return ownerUserId === actorUserId;
  }

  return false;
}

function sanitizeQueueEventForStream(event = null) {
  if (!event || typeof event !== "object") return null;
  const payload = { ...event };
  delete payload.visibilityUserId;
  return payload;
}

async function canActorReceiveActivityEvent(actor = null, event = null) {
  if (!actor || !event) return false;
  if (String(event.workspaceId || "").trim() !== String(actor.workspaceId || "").trim()) {
    return false;
  }
  if (isWorkspaceManager(actor)) return true;
  const actorUserId = String(actor.userId || "").trim();
  if (!actorUserId) return false;

  const visibilityUserId = String(event.visibilityUserId || "").trim();
  if (visibilityUserId) {
    return visibilityUserId === actorUserId;
  }

  const folderId = String(event.folderId || "").trim();
  if (folderId) {
    const role = await collaborationRepo.getFolderMemberRole({
      workspaceId: actor.workspaceId,
      folderId,
      userId: actorUserId,
    });
    return Boolean(role);
  }
  return true;
}

function handleSSE(req, res, actor) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

  // Keepalive ping every 30s
  const keepalive = setInterval(() => {
    res.write(`: keepalive ${new Date().toISOString()}\n\n`);
  }, 30000);

  // Subscribe to queue events
  const unsubscribe = enrichmentQueue.subscribe((event) => {
    const eventWorkspaceId =
      event?.workspaceId || event?.result?.workspaceId || event?.result?.note?.workspaceId || null;
    if (!eventWorkspaceId || eventWorkspaceId !== actor.workspaceId) {
      return;
    }
    if (!canActorReceiveQueueEvent(actor, event)) {
      return;
    }
    const payload = sanitizeQueueEventForStream(event);
    if (!payload) {
      return;
    }
    const eventType = payload.type || "message";
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
  });

  const unsubscribeActivity = subscribeActivity((event) => {
    Promise.resolve(canActorReceiveActivityEvent(actor, event))
      .then((allowed) => {
        if (!allowed) return;
        if (!event || typeof event !== "object") return;
        const payload = { ...event };
        delete payload.visibilityUserId;
        res.write(`event: activity\ndata: ${JSON.stringify(payload)}\n\n`);
      })
      .catch(() => {});
  });

  // Cleanup on client disconnect
  req.on("close", () => {
    clearInterval(keepalive);
    unsubscribe();
    unsubscribeActivity();
  });
}

const FOLDER_MEMBER_ROLES = new Set(["viewer", "editor", "manager"]);

function normalizeFolderMemberRole(role = "viewer") {
  const normalized = String(role || "").trim().toLowerCase();
  return FOLDER_MEMBER_ROLES.has(normalized) ? normalized : "viewer";
}

async function resolveWorkspaceMemberForAgent(actor, { userId = "", email = "" } = {}) {
  const normalizedUserId = String(userId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedUserId && !normalizedEmail) {
    throw new Error("Missing collaborator identifier");
  }
  const members = await authRepo.listWorkspaceMembers(actor.workspaceId, { limit: 1000 });
  const resolved = members.find((member) => {
    const memberUserId = String(member.userId || "").trim();
    const memberEmail = String(member.email || "").trim().toLowerCase();
    if (normalizedUserId && memberUserId === normalizedUserId) return true;
    if (normalizedEmail && memberEmail === normalizedEmail) return true;
    return false;
  });
  if (!resolved) {
    throw new Error("Workspace member not found");
  }
  return resolved;
}

function buildAgentNoteTitle(note = null, fallback = "Untitled item") {
  function cleanTitleCandidate(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
      .replace(/[*_~]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (!note || typeof note !== "object") return fallback;
  const explicit = cleanTitleCandidate(note?.metadata?.title || "");
  if (explicit) return explicit.slice(0, 140);
  const summary = cleanTitleCandidate(note.summary || "");
  if (summary) return summary.slice(0, 140);
  const fileName = cleanTitleCandidate(note.fileName || "");
  if (fileName) return fileName.slice(0, 140);
  const content = cleanTitleCandidate(note.content || "");
  if (content) return content.slice(0, 140);
  return fallback;
}

async function resolveFolderNameForAgent(folderRef, workspaceId) {
  const normalized = String(folderRef || "").trim();
  if (!normalized) return "";
  let folder = await folderRepo.getFolder(normalized, workspaceId);
  if (!folder) {
    folder = await folderRepo.getFolderByName(normalized, workspaceId);
  }
  return String(folder?.name || normalized);
}

const CHAT_TOOLS = [
  {
    type: "function",
    name: "create_note",
    description:
      "Save a new note, link, image, or file-backed item. Use when the user wants to save content or an attachment.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The note content or URL to save (optional when attachment is present)" },
        title: { type: "string", description: "Preferred item title (optional, plain language)." },
        project: { type: "string", description: "Folder to save into (optional)" },
        sourceType: { type: "string", enum: ["url", "link", "text", "manual", "file", "image"], description: "Type of content" },
        sourceUrl: { type: "string", description: "Optional source URL" },
        imageDataUrl: { type: "string", description: "Optional image data URL" },
        fileDataUrl: { type: "string", description: "Optional file data URL" },
        fileName: { type: "string", description: "Optional file name for attachment uploads" },
        fileMimeType: { type: "string", description: "Optional mime type for attachment uploads" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "create_folder",
    description: "Create a new folder/collection. Use when the user wants to organize items into a new group.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Folder name" },
        description: { type: "string", description: "Optional description" },
        color: { type: "string", description: "Color: green, blue, purple, orange, pink, red, yellow" },
      },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "list_workspace_members",
    description: "List workspace members so you can pick collaborators by id/email.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional filter against name/email/id" },
        limit: { type: "number", description: "Optional max members to return (default 50)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "list_folder_collaborators",
    description: "List collaborators for a folder, including their roles.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Folder id or folder name" },
      },
      required: ["folderId"],
    },
  },
  {
    type: "function",
    name: "set_folder_collaborator",
    description: "Share a folder by setting a collaborator role (viewer/editor/manager).",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Folder id or folder name" },
        userId: { type: "string", description: "Workspace user id (preferred)" },
        email: { type: "string", description: "Workspace member email (fallback)" },
        role: { type: "string", enum: ["viewer", "editor", "manager"], description: "Collaborator role" },
      },
      required: ["folderId"],
    },
  },
  {
    type: "function",
    name: "remove_folder_collaborator",
    description: "Unshare a folder by removing a collaborator.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Folder id or folder name" },
        userId: { type: "string", description: "Workspace user id (preferred)" },
        email: { type: "string", description: "Workspace member email (fallback)" },
      },
      required: ["folderId"],
    },
  },
  {
    type: "function",
    name: "list_activity",
    description: "List recent workspace activity, optionally filtered to a folder or note.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Optional folder id or name filter" },
        noteId: { type: "string", description: "Optional note id filter" },
        limit: { type: "number", description: "Optional max events to return (default 30)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "search_notes",
    description: "Search through saved notes. Use when the user asks about their saved content.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        project: { type: "string", description: "Filter to specific folder (optional)" },
        scope: { type: "string", enum: ["all", "workspace", "user", "project", "item"], description: "Memory scope" },
        workingSetIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional note ids for focused search context",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_note_raw_content",
    description: "Read extracted raw and markdown content for a note.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        includeMarkdown: { type: "boolean", description: "Include markdownContent in response" },
        maxChars: { type: "number", description: "Maximum characters to return" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "update_note",
    description: "Update note title/content/summary/tags/folder.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        title: { type: "string", description: "User-facing title for the note" },
        content: { type: "string", description: "Updated note content" },
        summary: { type: "string", description: "Updated summary" },
        tags: { type: "array", items: { type: "string" }, description: "Updated tags" },
        project: { type: "string", description: "Updated folder name" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "update_note_attachment",
    description: "Replace a note attachment (file/image) and re-run enrichment.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        fileDataUrl: { type: "string", description: "Optional file data URL" },
        imageDataUrl: { type: "string", description: "Optional image data URL" },
        fileName: { type: "string", description: "Optional file name for attachment" },
        fileMimeType: { type: "string", description: "Optional mime type for attachment" },
        content: { type: "string", description: "Optional note content override" },
        requeueEnrichment: { type: "boolean", description: "Requeue enrichment after attachment update" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "update_note_markdown",
    description: "Update extracted raw/markdown content on a note, with optional re-enrichment.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        content: { type: "string", description: "Optional top-level content override" },
        rawContent: { type: "string", description: "Updated extracted raw text" },
        markdownContent: { type: "string", description: "Updated extracted markdown text" },
        requeueEnrichment: { type: "boolean", description: "Requeue enrichment after edit" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "add_note_comment",
    description: "Add a contextual comment to a note.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        text: { type: "string", description: "Comment text" },
      },
      required: ["id", "text"],
    },
  },
  {
    type: "function",
    name: "list_note_versions",
    description: "List version history for a note.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "restore_note_version",
    description: "Restore a note to a previous version number.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        versionNumber: { type: "number", description: "Version number to restore" },
      },
      required: ["id", "versionNumber"],
    },
  },
  {
    type: "function",
    name: "retry_note_enrichment",
    description: "Retry enrichment for a failed or stuck note by id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id to retry enrichment for" },
      },
      required: ["id"],
    },
  },
];

const CHAT_SYSTEM_PROMPT = "You are Stash, a workspace assistant. You can save links/files/images, create notes and folders, search notes, read extracted markdown/raw content, update note fields, update markdown/raw extracted content, add note comments, list/restore versions, retry failed enrichment, list workspace members, share/unshare folders, list folder collaborators, and list workspace activity. When the user asks to save, edit, or organize memory items, use tools directly. When creating notes and the user implies a name, pass that name using create_note.title. Keep responses concise and grounded in saved notes. In user-facing replies, reference items by title/folder name and avoid raw IDs unless the user explicitly asks for IDs.";

async function executeChatToolCall(name, args, actor, { chatAttachment = null } = {}) {
  switch (name) {
    case "create_note": {
      const content = String(args.content || "").trim();
      const sourceUrlArg = String(args.sourceUrl || "").trim();
      const attachment = chatAttachment && (chatAttachment.fileDataUrl || chatAttachment.imageDataUrl)
        ? chatAttachment
        : {
            imageDataUrl: String(args.imageDataUrl || "").trim() || null,
            fileDataUrl: String(args.fileDataUrl || "").trim() || null,
            fileName: String(args.fileName || ""),
            fileMimeType: String(args.fileMimeType || ""),
          };
      const attachmentPresent = Boolean(attachment?.fileDataUrl || attachment?.imageDataUrl);
      const requestedSourceType = String(args.sourceType || "").trim().toLowerCase();
      let sourceType = "text";
      if (attachmentPresent) {
        sourceType = attachment?.fileMimeType?.toLowerCase().startsWith("image/") ? "image" : "file";
      } else if (requestedSourceType === "url" || requestedSourceType === "link") {
        sourceType = "link";
      } else if (requestedSourceType === "file" || requestedSourceType === "image") {
        sourceType = requestedSourceType;
      }
      let sourceUrl = sourceUrlArg;
      if (!requestedSourceType && /^https?:\/\//i.test(content)) {
        sourceType = "link";
        sourceUrl = content;
      } else if ((requestedSourceType === "url" || requestedSourceType === "link") && /^https?:\/\//i.test(content)) {
        sourceUrl = content;
      } else if (sourceUrlArg && /^https?:\/\//i.test(sourceUrlArg)) {
        sourceType = "link";
      }
      if (!content && !attachmentPresent) {
        throw new Error("create_note requires content or an attachment");
      }
      const note = await createMemory({
        content,
        title: String(args.title || "").trim(),
        sourceType,
        sourceUrl,
        imageDataUrl: attachment?.imageDataUrl || null,
        fileDataUrl: attachment?.fileDataUrl || null,
        fileName: attachment?.fileName || "",
        fileMimeType: attachment?.fileMimeType || "",
        project: args.project || "",
        metadata: { createdFrom: "chat-agent", actorUserId: actor.userId },
        actor,
      });
      return {
        noteId: note.id,
        title: buildAgentNoteTitle(note, content.slice(0, 80) || "New item"),
        sourceType: note.sourceType,
      };
    }
    case "create_folder": {
      const folder = await createWorkspaceFolder({
        name: args.name,
        description: args.description || "",
        color: args.color || "",
        actor,
      });
      return { folderId: folder.id, name: folder.name, folderName: folder.name };
    }
    case "list_workspace_members": {
      const query = String(args.query || "").trim().toLowerCase();
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
      const members = await authRepo.listWorkspaceMembers(actor.workspaceId, { limit: Math.max(limit * 2, 100) });
      const filtered = query
        ? members.filter((member) => {
            const haystack = `${member.userId || ""} ${member.email || ""} ${member.name || ""}`.toLowerCase();
            return haystack.includes(query);
          })
        : members;
      return {
        members: filtered.slice(0, limit).map((member) => ({
          userId: String(member.userId || ""),
          email: String(member.email || ""),
          name: String(member.name || ""),
          role: String(member.role || "member"),
        })),
      };
    }
    case "list_folder_collaborators": {
      const result = await listFolderCollaborators({
        folderId: String(args.folderId || "").trim(),
        actor,
      });
      return {
        folder: {
          id: result.folder?.id || "",
          name: result.folder?.name || "",
        },
        collaborators: (result.items || []).map((item) => ({
          userId: String(item.userId || ""),
          userEmail: String(item.userEmail || ""),
          userName: String(item.userName || ""),
          role: String(item.role || "viewer"),
        })),
      };
    }
    case "set_folder_collaborator": {
      const target = await resolveWorkspaceMemberForAgent(actor, {
        userId: args.userId,
        email: args.email,
      });
      const collaborator = await setFolderCollaboratorRole({
        folderId: String(args.folderId || "").trim(),
        userId: target.userId,
        role: normalizeFolderMemberRole(args.role),
        actor,
      });
      const folderName = await resolveFolderNameForAgent(collaborator.folderId || args.folderId, actor.workspaceId);
      return {
        folderId: String(collaborator.folderId || ""),
        folderName,
        userId: String(collaborator.userId || ""),
        userEmail: String(collaborator.userEmail || ""),
        userName: String(collaborator.userName || ""),
        role: String(collaborator.role || "viewer"),
      };
    }
    case "remove_folder_collaborator": {
      const target = await resolveWorkspaceMemberForAgent(actor, {
        userId: args.userId,
        email: args.email,
      });
      const result = await removeFolderCollaborator({
        folderId: String(args.folderId || "").trim(),
        userId: target.userId,
        actor,
      });
      const folderName = await resolveFolderNameForAgent(args.folderId, actor.workspaceId);
      return {
        folderId: String(args.folderId || "").trim(),
        folderName,
        userId: String(target.userId || ""),
        removed: Number(result.removed || 0),
      };
    }
    case "list_activity": {
      const result = await listWorkspaceActivity({
        actor,
        folderId: String(args.folderId || "").trim(),
        noteId: String(args.noteId || "").trim(),
        limit: Math.min(Math.max(Number(args.limit) || 30, 1), 200),
      });
      return {
        items: (result.items || []).map((item) => ({
          id: item.id,
          eventType: item.eventType,
          folderId: item.folderId || "",
          folderName: item.folderName || "",
          noteId: item.noteId || "",
          actorName: item.actorName || "",
          message: item.message || "",
          createdAt: item.createdAt,
        })),
      };
    }
    case "search_notes": {
      const results = await searchMemories({
        query: args.query,
        project: args.project || "",
        limit: 6,
        actor,
        scope: String(args.scope || "all"),
        workingSetIds: args.workingSetIds,
      });
      return {
        results: results.slice(0, 6).map((r) => ({
          id: r.note?.id,
          title: buildAgentNoteTitle(r.note, String(r.note?.content || "").slice(0, 80) || "Untitled item"),
          project: r.note?.project || "",
        })),
      };
    }
    case "get_note_raw_content": {
      return getMemoryRawContent({
        id: String(args.id || "").trim(),
        includeMarkdown: args.includeMarkdown !== false,
        maxChars: Number(args.maxChars || 12000),
        actor,
      });
    }
    case "update_note": {
      const note = await updateMemory({
        id: String(args.id || "").trim(),
        title: args.title,
        content: args.content,
        summary: args.summary,
        tags: Array.isArray(args.tags)
          ? args.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
          : undefined,
        project: args.project,
        actor,
      });
      return { noteId: note.id, title: buildAgentNoteTitle(note, "Updated item") };
    }
    case "update_note_attachment": {
      const attachment = chatAttachment && (chatAttachment.fileDataUrl || chatAttachment.imageDataUrl)
        ? chatAttachment
        : {
            imageDataUrl: String(args.imageDataUrl || "").trim() || null,
            fileDataUrl: String(args.fileDataUrl || "").trim() || null,
            fileName: String(args.fileName || ""),
            fileMimeType: String(args.fileMimeType || ""),
          };
      const note = await updateMemoryAttachment({
        id: String(args.id || "").trim(),
        content: args.content,
        fileDataUrl: attachment.fileDataUrl,
        imageDataUrl: attachment.imageDataUrl,
        fileName: attachment.fileName,
        fileMimeType: attachment.fileMimeType,
        requeueEnrichment: args.requeueEnrichment !== false,
        actor,
      });
      return {
        noteId: note.id,
        sourceType: note.sourceType || "",
        fileName: note.fileName || "",
        status: note.status || "",
      };
    }
    case "update_note_markdown": {
      const note = await updateMemoryExtractedContent({
        id: String(args.id || "").trim(),
        content: args.content,
        rawContent: args.rawContent,
        markdownContent: args.markdownContent,
        requeueEnrichment: args.requeueEnrichment !== false,
        actor,
      });
      return { noteId: note.id, status: note.status || "" };
    }
    case "add_note_comment": {
      const result = await addMemoryComment({
        id: String(args.id || "").trim(),
        text: String(args.text || ""),
        actor,
      });
      return {
        noteId: result.note?.id || String(args.id || "").trim(),
        commentId: result.comment?.id || "",
      };
    }
    case "list_note_versions": {
      const result = await listMemoryVersions({
        id: String(args.id || "").trim(),
        actor,
      });
      return {
        noteId: String(args.id || "").trim(),
        versions: (result.items || []).slice(0, 20).map((item) => ({
          versionNumber: item.versionNumber,
          createdAt: item.createdAt,
          changeSummary: item.changeSummary || "",
        })),
      };
    }
    case "restore_note_version": {
      const note = await restoreMemoryVersion({
        id: String(args.id || "").trim(),
        versionNumber: Number(args.versionNumber || 0),
        actor,
      });
      return { noteId: note.id, status: note.status || "" };
    }
    case "retry_note_enrichment": {
      const result = await retryMemoryEnrichment({
        id: String(args.id || "").trim(),
        actor,
      });
      return {
        noteId: result.note?.id || String(args.id || "").trim(),
        queued: result.queued === true,
        source: result.source || "",
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Workspace-Id",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    const mem = process.memoryUsage();
    sendJson(res, 200, {
      ok: true,
      serverTime: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      openaiConfigured: hasOpenAI(),
      auth: {
        provider: config.authProvider,
        firebaseConfigured: await isFirebaseConfigured(),
        neonConfigured: isNeonConfigured(),
      },
      dbProvider: providerName,
      dbBridgeMode: storageBridgeMode,
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      queue: {
        pending: enrichmentQueue.pending ?? 0,
        running: enrichmentQueue.active ?? 0,
        failed: enrichmentQueue.stats?.failed ?? 0,
        queued: enrichmentQueue.stats?.queued ?? 0,
        retry: enrichmentQueue.stats?.retry ?? 0,
        completed: enrichmentQueue.stats?.completed ?? 0,
        delayed: enrichmentQueue.stats?.delayed ?? 0,
        total: enrichmentQueue.stats?.total ?? 0,
      },
    });
    return;
  }

  const requestIp = getRequestIp(req);
  const requestOrigin = getRequestOrigin(req);
  const authWritePaths = new Set([
    "/api/auth/login",
    "/api/auth/signup",
    "/api/auth/password-reset",
    "/api/auth/password-change",
    "/api/auth/email-verification/send",
  ]);

  if (req.method === "POST" && authWritePaths.has(url.pathname)) {
    const strictRate = checkAuthRate(req);
    if (!strictRate.allowed) {
      sendJson(res, 429, {
        error: "Too many authentication requests",
        retryAfter: strictRate.retryAfter,
        captchaRequired: true,
      });
      return;
    }

    const failureStatus = getAuthFailureStatus(requestIp);
    if (failureStatus.requiresCaptcha) {
      sendJson(res, 429, {
        error: "Additional verification required before more auth attempts",
        captchaRequired: true,
      });
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    if (body.workspaceId || body.workspaceName) {
      sendJson(res, 400, { error: "Workspace override is not allowed in auth endpoints" });
      return;
    }
    try {
      let session;
      if (config.authProvider === "neon") {
        const neonResult = await neonSignInWithEmailPassword({
          email: body.email,
          password: body.password,
          origin: requestOrigin,
        });
        const actor = await resolveNeonActorFromToken(neonResult.token);
        session = buildNeonSessionPayload(neonResult, actor);
        session.user.emailVerified = Boolean(actor.emailVerified);
        if (config.authRequireEmailVerification && !actor.emailVerified) {
          session.requiresEmailVerification = true;
        }
      } else if (config.authProvider === "firebase") {
        const firebaseResult = await firebaseSignInWithEmailPassword({
          email: body.email,
          password: body.password,
        });
        const claims = await verifyFirebaseIdToken(firebaseResult.idToken);
        const actor = await authRepo.resolveFirebaseActorFromClaims(claims);
        session = buildFirebaseSessionPayload(firebaseResult, actor);
        session.user.emailVerified = Boolean(actor.emailVerified);
        if (config.authRequireEmailVerification && !actor.emailVerified) {
          try {
            await firebaseSendEmailVerification({ idToken: firebaseResult.idToken });
          } catch {
            // no-op
          }
          session.requiresEmailVerification = true;
        }
      }
      else {
        session = await authRepo.loginAndIssueSession({
          email: body.email,
          password: body.password,
        });
      }
      clearAuthFailures(requestIp);
      recordAuthEvent({
        eventType: "auth.login",
        outcome: "success",
        provider: config.authProvider,
        userId: session.user?.id || "",
        workspaceId: session.workspace?.id || "",
        email: session.user?.email || body.email || "",
        ip: requestIp,
      });
      sendJson(res, 200, { session });
    } catch (error) {
      const failure = registerAuthFailure(requestIp);
      recordAuthEvent({
        eventType: "auth.login",
        outcome: "failure",
        provider: config.authProvider,
        email: body.email || "",
        ip: requestIp,
        reason: error instanceof Error ? error.message : "Login failed",
        metadata: failure,
      });
      if (failure.requiresCaptcha) {
        logger.warn("auth_suspicious_activity", {
          ip: requestIp,
          eventType: "auth.login",
          failures: failure.count,
        });
      }
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Login failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    const body = await readJsonBody(req);
    if (body.workspaceId || body.workspaceName) {
      sendJson(res, 400, { error: "Workspace override is not allowed in auth endpoints" });
      return;
    }
    try {
      let session;
      if (config.authProvider === "neon") {
        const neonResult = await neonSignUpWithEmailPassword({
          email: body.email,
          password: body.password,
          name: body.name || "",
          origin: requestOrigin,
        });
        const actor = await resolveNeonActorFromToken(neonResult.token);
        session = buildNeonSessionPayload(neonResult, actor);
        session.user.emailVerified = Boolean(actor.emailVerified);
        if (config.authRequireEmailVerification && !actor.emailVerified) {
          session.requiresEmailVerification = true;
        }
      } else if (config.authProvider === "firebase") {
        const firebaseResult = await firebaseSignUpWithEmailPassword({
          email: body.email,
          password: body.password,
          name: body.name || "",
        });
        const claims = await verifyFirebaseIdToken(firebaseResult.idToken);
        const actor = await authRepo.resolveFirebaseActorFromClaims(claims);
        session = buildFirebaseSessionPayload(firebaseResult, actor);
        session.user.emailVerified = Boolean(actor.emailVerified);
        if (config.authRequireEmailVerification && !actor.emailVerified) {
          try {
            await firebaseSendEmailVerification({ idToken: firebaseResult.idToken });
          } catch {
            // no-op
          }
          session.requiresEmailVerification = true;
        }
      } else {
        session = await authRepo.signUpAndIssueSession({
          email: body.email,
          name: body.name,
          password: body.password,
        });
      }
      clearAuthFailures(requestIp);
      recordAuthEvent({
        eventType: "auth.signup",
        outcome: "success",
        provider: config.authProvider,
        userId: session.user?.id || "",
        workspaceId: session.workspace?.id || "",
        email: session.user?.email || body.email || "",
        ip: requestIp,
      });
      sendJson(res, 201, { session });
    } catch (error) {
      const failure = registerAuthFailure(requestIp);
      recordAuthEvent({
        eventType: "auth.signup",
        outcome: "failure",
        provider: config.authProvider,
        email: body.email || "",
        ip: requestIp,
        reason: error instanceof Error ? error.message : "Sign up failed",
        metadata: failure,
      });
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Sign up failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-reset") {
    const body = await readJsonBody(req);
    if (config.authProvider === "neon") {
      try {
        await neonSendPasswordResetEmail({
          email: body.email,
          origin: requestOrigin,
        });
        clearAuthFailures(requestIp);
        recordAuthEvent({
          eventType: "auth.password_reset.request",
          outcome: "success",
          provider: "neon",
          email: body.email || "",
          ip: requestIp,
        });
        sendJson(res, 200, { ok: true });
      } catch (error) {
        const failure = registerAuthFailure(requestIp);
        recordAuthEvent({
          eventType: "auth.password_reset.request",
          outcome: "failure",
          provider: "neon",
          email: body.email || "",
          ip: requestIp,
          reason: error instanceof Error ? error.message : "Password reset failed",
          metadata: failure,
        });
        const statusCode = resolveErrorStatus(error, 400);
        sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Password reset failed" });
      }
      return;
    }
    if (config.authProvider !== "firebase") {
      sendJson(res, 400, { error: "Password reset via API is only available with Firebase auth provider" });
      return;
    }
    try {
      await firebaseSendPasswordResetEmail({ email: body.email });
      clearAuthFailures(requestIp);
      recordAuthEvent({
        eventType: "auth.password_reset.request",
        outcome: "success",
        provider: "firebase",
        email: body.email || "",
        ip: requestIp,
      });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      const failure = registerAuthFailure(requestIp);
      recordAuthEvent({
        eventType: "auth.password_reset.request",
        outcome: "failure",
        provider: "firebase",
        email: body.email || "",
        ip: requestIp,
        reason: error instanceof Error ? error.message : "Password reset failed",
        metadata: failure,
      });
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Password reset failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
    const body = await readJsonBody(req);
    if (config.authProvider === "neon") {
      sendJson(res, 400, {
        error: "Token refresh via API is not available in Neon auth mode. Use the Neon Auth client session flow.",
      });
      return;
    }
    if (config.authProvider !== "firebase") {
      sendJson(res, 400, { error: "Token refresh is only available with Firebase auth provider" });
      return;
    }
    try {
      const refreshed = await firebaseRefreshIdToken(body.refreshToken);
      const claims = await verifyFirebaseIdToken(refreshed.idToken);
      const actor = await authRepo.resolveFirebaseActorFromClaims(claims);
      const session = buildFirebaseSessionPayload(refreshed, actor);
      session.user.emailVerified = Boolean(actor.emailVerified);
      if (config.authRequireEmailVerification && !actor.emailVerified) {
        session.requiresEmailVerification = true;
      }
      sendJson(res, 200, { session });
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Token refresh failed" });
    }
    return;
  }

  const actor = await buildActorFromRequest(req, {
    url,
    allowQueryToken:
      req.method === "GET" && (url.pathname === "/api/events" || url.pathname === "/api/export"),
  });
  if (!actor) {
    sendUnauthorized(res);
    return;
  }

  const requiresEmailVerification =
    (config.authProvider === "firebase" || config.authProvider === "neon") &&
    config.authRequireEmailVerification &&
    !actor.emailVerified;

  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    sendJson(res, 200, {
      actor: {
        userId: actor.userId,
        userEmail: actor.userEmail,
        userName: actor.userName || "",
        workspaceId: actor.workspaceId,
        workspaceName: actor.workspaceName,
        workspaceSlug: actor.workspaceSlug || "",
        role: actor.role,
        emailVerified: Boolean(actor.emailVerified),
        provider: actor.provider || config.authProvider,
      },
      requiresEmailVerification,
    });
    return;
  }

  if (requiresEmailVerification) {
    const allowWhileUnverified =
      (req.method === "POST" && url.pathname === "/api/auth/email-verification/send") ||
      (req.method === "POST" && url.pathname === "/api/auth/signout-all") ||
      (req.method === "DELETE" && url.pathname === "/api/auth/account");
    if (!allowWhileUnverified) {
      sendJson(res, 403, {
        error: "Email verification required before accessing app data",
        requiresEmailVerification: true,
      });
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/api/enrichment/queue") {
    try {
      if (!isWorkspaceManager(actor)) {
        sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can view queue diagnostics" });
        return;
      }
      const failedLimit = Number(url.searchParams.get("failedLimit") || "20");
      const stats = await getEnrichmentQueueStats({ actor, failedLimit });
      sendJson(res, 200, stats);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to fetch queue stats" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/email-verification/send") {
    if (config.authProvider === "neon") {
      sendJson(res, 400, {
        error: "Email verification send endpoint is not available in Neon auth mode. Use Neon Auth email verification flow.",
      });
      return;
    }
    if (config.authProvider !== "firebase") {
      sendJson(res, 400, { error: "Email verification endpoint is only available with Firebase auth provider" });
      return;
    }
    try {
      await firebaseSendEmailVerification({ idToken: actor.token });
      recordAuthEvent({
        eventType: "auth.email_verification.send",
        outcome: "success",
        provider: "firebase",
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        email: actor.userEmail,
        ip: requestIp,
      });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      recordAuthEvent({
        eventType: "auth.email_verification.send",
        outcome: "failure",
        provider: "firebase",
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        email: actor.userEmail,
        ip: requestIp,
        reason: error instanceof Error ? error.message : "Email verification send failed",
      });
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Email verification send failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-change") {
    const body = await readJsonBody(req);
    try {
      if (config.authProvider === "firebase") {
        const updated = await firebaseChangePassword({
          idToken: actor.token,
          newPassword: body.newPassword,
        });
        const claims = await verifyFirebaseIdToken(updated.idToken);
        const updatedActor = await authRepo.resolveFirebaseActorFromClaims(claims, {
          preferredWorkspaceId: actor.workspaceId,
        });
        const session = buildFirebaseSessionPayload(updated, updatedActor);
        session.user.emailVerified = Boolean(updatedActor.emailVerified);
        sendJson(res, 200, { ok: true, session });
      } else if (config.authProvider === "neon") {
        sendJson(res, 400, {
          error: "Password change via API is not available in Neon auth mode. Use Neon Auth password update flow.",
        });
        return;
      } else {
        await authRepo.changeLocalPassword({
          userId: actor.userId,
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
        });
        sendJson(res, 200, { ok: true });
      }
      recordAuthEvent({
        eventType: "auth.password_change",
        outcome: "success",
        provider: config.authProvider,
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        email: actor.userEmail,
        ip: requestIp,
      });
    } catch (error) {
      const failure = registerAuthFailure(requestIp);
      recordAuthEvent({
        eventType: "auth.password_change",
        outcome: "failure",
        provider: config.authProvider,
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        email: actor.userEmail,
        ip: requestIp,
        reason: error instanceof Error ? error.message : "Password change failed",
        metadata: failure,
      });
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Password change failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signout-all") {
    try {
      if (config.authProvider === "firebase") {
        await revokeFirebaseUserSessions(actor.authProviderSubject);
      }
      const localRevoked = await authRepo.revokeAllSessionsForUser(actor.userId);
      recordAuthEvent({
        eventType: "auth.signout_all",
        outcome: "success",
        provider: config.authProvider,
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        email: actor.userEmail,
        ip: requestIp,
        metadata: { localRevoked: localRevoked.revoked || 0 },
      });
      sendJson(res, 200, { ok: true, revokedLocalSessions: localRevoked.revoked || 0 });
    } catch (error) {
      recordAuthEvent({
        eventType: "auth.signout_all",
        outcome: "failure",
        provider: config.authProvider,
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        email: actor.userEmail,
        ip: requestIp,
        reason: error instanceof Error ? error.message : "Sign out all failed",
      });
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Sign out all failed" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/auth/account") {
    const body = await readJsonBody(req);
    try {
      if (config.authProvider === "local") {
        await authRepo.authenticateUser({
          email: actor.userEmail,
          password: body.password,
        });
      }
      if (config.authProvider === "firebase") {
        await deleteFirebaseUser(actor.authProviderSubject, { idToken: actor.token });
      }
      await authRepo.deleteUserAccount(actor.userId);
      recordAuthEvent({
        eventType: "auth.account_delete",
        outcome: "success",
        provider: config.authProvider,
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        email: actor.userEmail,
        ip: requestIp,
      });
      sendJson(res, 200, { ok: true, deleted: true });
    } catch (error) {
      recordAuthEvent({
        eventType: "auth.account_delete",
        outcome: "failure",
        provider: config.authProvider,
        userId: actor.userId,
        workspaceId: actor.workspaceId,
        email: actor.userEmail,
        ip: requestIp,
        reason: error instanceof Error ? error.message : "Account delete failed",
      });
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Account delete failed" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces") {
    const items = await authRepo.listWorkspacesForUser(actor.userId);
    sendJson(res, 200, { items, count: items.length });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces/members") {
    const limit = Number(url.searchParams.get("limit") || "200");
    const items = await authRepo.listWorkspaceMembers(actor.workspaceId, { limit });
    sendJson(res, 200, { items, count: items.length });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces/invites/incoming") {
    const items = await authRepo.listIncomingWorkspaceInvites(
      actor.userEmail,
      Number(url.searchParams.get("limit") || "50")
    );
    sendJson(res, 200, { items, count: items.length });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces/invites") {
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can list invites" });
      return;
    }
    const status = url.searchParams.get("status") || "";
    const limit = Number(url.searchParams.get("limit") || "100");
    const items = await authRepo.listWorkspaceInvites(actor.workspaceId, { status, limit });
    sendJson(res, 200, { items, count: items.length });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/workspaces/invites") {
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can create invites" });
      return;
    }
    const body = await readJsonBody(req);
    try {
      const invite = await authRepo.createWorkspaceInvite({
        workspaceId: actor.workspaceId,
        invitedByUserId: actor.userId,
        email: body.email,
        role: body.role || "member",
        expiresInHours: Number(body.expiresInHours || "72"),
      });
      sendJson(res, 201, { invite });
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Invite create failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/workspaces/invites/") && url.pathname.endsWith("/accept")) {
    const token = decodeURIComponent(
      url.pathname.slice("/api/workspaces/invites/".length, url.pathname.lastIndexOf("/accept"))
    ).trim();
    if (!token) {
      sendJson(res, 400, { error: "Missing invite token" });
      return;
    }
    try {
      const invite = await authRepo.acceptWorkspaceInvite({
        token,
        userId: actor.userId,
        userEmail: actor.userEmail,
      });
      sendJson(res, 200, { invite });
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Invite accept failed" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/workspaces/invites/")) {
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can revoke invites" });
      return;
    }
    const inviteId = decodeURIComponent(url.pathname.slice("/api/workspaces/invites/".length)).trim();
    if (!inviteId) {
      sendJson(res, 400, { error: "Missing invite id" });
      return;
    }
    try {
      const invite = await authRepo.revokeWorkspaceInvite({ id: inviteId, workspaceId: actor.workspaceId });
      sendJson(res, 200, { invite });
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Invite revoke failed" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/audit") {
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can view auth audit logs" });
      return;
    }
    const limit = Number(url.searchParams.get("limit") || "100");
    const items = await authRepo.listAuthEventsForWorkspace(actor.workspaceId, limit);
    sendJson(res, 200, { items, count: items.length });
    return;
  }

  // SSE endpoint — requires an authenticated actor.
  if (req.method === "GET" && url.pathname === "/api/events") {
    handleSSE(req, res, actor);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/activity") {
    try {
      const result = await listWorkspaceActivity({
        actor,
        folderId: url.searchParams.get("folderId") || "",
        noteId: url.searchParams.get("noteId") || "",
        limit: Number(url.searchParams.get("limit") || "60"),
      });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to fetch activity" });
    }
    return;
  }

  // GET /api/notes/:id/related — find semantically related notes
  if (req.method === "GET" && url.pathname.match(/^\/api\/notes\/[^/]+\/related$/)) {
    const suffix = "/related";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    const limit = Number(url.searchParams.get("limit") || "5");
    try {
      const items = await findRelatedMemories({ id, limit, actor });
      sendJson(res, 200, { items, count: items.length });
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Related lookup failed" });
    }
    return;
  }

  // POST /api/notes/:id/retry-enrichment — retry enrichment for failed/stuck notes
  if (req.method === "POST" && url.pathname.match(/^\/api\/notes\/[^/]+\/retry-enrichment$/)) {
    const suffix = "/retry-enrichment";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    try {
      const result = await retryMemoryEnrichment({ id, actor });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Retry failed" });
    }
    return;
  }

  // GET /api/notes/:id — fetch single note by id
  if (req.method === "GET" && url.pathname.match(/^\/api\/notes\/[^/]+$/) && !url.pathname.endsWith("/batch-delete") && !url.pathname.endsWith("/batch-move")) {
    const encodedId = url.pathname.slice("/api/notes/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    try {
      const note = await getMemoryById({ id, actor });
      sendJson(res, 200, { note });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Fetch failed";
      const statusCode = resolveErrorStatus(error, msg.includes("not found") ? 404 : 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Fetch failed" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/notes/")) {
    const encodedId = url.pathname.slice("/api/notes/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }

    try {
      const result = await deleteMemory({ id, actor });
      if (!result.deleted) {
        sendJson(res, 404, { error: `Memory not found: ${id}` });
        return;
      }
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Delete failed" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/projects/")) {
    const encodedProject = url.pathname.slice("/api/projects/".length);
    const project = decodeURIComponent(encodedProject || "").trim();
    if (!project) {
      sendJson(res, 400, { error: "Missing project" });
      return;
    }

    try {
      const result = await deleteProjectMemories({ project, actor });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Delete project failed" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/notes") {
    const query = url.searchParams.get("query") || "";
    const project = url.searchParams.get("project") || "";
    const limit = Number(url.searchParams.get("limit") || "20");
    const offset = Number(url.searchParams.get("offset") || "0");
    const scope = url.searchParams.get("scope") || "all";
    const workingSetIds = parseWorkingSetIds(url.searchParams.getAll("workingSetIds"));

    const hasScopedSearch =
      Boolean(query.trim()) ||
      Boolean(project.trim()) ||
      String(scope || "").trim().toLowerCase() !== "all" ||
      workingSetIds.length > 0;
    const results = hasScopedSearch
      ? await searchMemories({ query, project, limit, offset, actor, scope, workingSetIds })
      : (await listRecentMemories(limit, offset, actor)).map((note, index) => ({
          rank: index + 1,
          score: 1,
          note,
        }));

    sendJson(res, 200, {
      items: results,
      count: results.length,
      offset,
      limit,
      hasMore: results.length === limit,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/recent") {
    const limit = Number(url.searchParams.get("limit") || "20");
    const offset = Number(url.searchParams.get("offset") || "0");
    const scope = url.searchParams.get("scope") || "all";
    const project = url.searchParams.get("project") || "";
    const contextNoteId = url.searchParams.get("contextNoteId") || "";
    const workingSetIds = parseWorkingSetIds(url.searchParams.getAll("workingSetIds"));
    const notes = await listRecentMemories(limit, offset, actor, {
      scope,
      project,
      contextNoteId,
      workingSetIds,
    });
    sendJson(res, 200, {
      items: notes,
      count: notes.length,
      offset,
      limit,
      hasMore: notes.length === limit,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    const projects = await listProjects(actor);
    sendJson(res, 200, { items: projects, count: projects.length });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/notes") {
    const body = await readJsonBody(req);
    const validation = validateNotePayload(body);
    if (!validation.valid) {
      sendJson(res, 400, { error: validation.errors.join("; ") });
      return;
    }
    const note = await createMemory({
      content: body.content,
      title: body.title,
      sourceType: body.sourceType,
      sourceUrl: body.sourceUrl,
      imageDataUrl: body.imageDataUrl,
      fileDataUrl: body.fileDataUrl,
      fileName: body.fileName,
      fileMimeType: body.fileMimeType,
      project: body.project,
      metadata: {
        createdFrom: "web-app",
        actorUserId: actor.userId,
      },
      actor,
    });
    sendJson(res, 201, { note });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const body = await readJsonBody(req);
    const wantsStream = (req.headers.accept || "").includes("text/event-stream");
    const scope = String(body.scope || "all");
    const workingSetIds = parseWorkingSetIds(body.workingSetIds);
    const chatAttachment = {
      imageDataUrl: String(body.imageDataUrl || "").trim() || null,
      fileDataUrl: String(body.fileDataUrl || "").trim() || null,
      fileName: String(body.fileName || "").trim(),
      fileMimeType: String(body.fileMimeType || "").trim(),
    };
    const hasAttachment = Boolean(chatAttachment.imageDataUrl || chatAttachment.fileDataUrl);

    if (wantsStream) {
      // Streaming agent path: search for context, then stream with tools
      const question = String(body.question || "").trim() || (hasAttachment ? "Save this attachment to Stash." : "");
      if (!question) {
        sendJson(res, 400, { error: "Missing question" });
        return;
      }

      // Pre-search for context
      let citations = await searchMemories({
        query: question,
        project: body.project || "",
        limit: Number(body.limit || 6),
        actor,
        scope,
        workingSetIds,
        contextNoteId: String(body.contextNoteId || "").trim(),
      });

      const contextNoteId = String(body.contextNoteId || "").trim();
      if (contextNoteId) {
        try {
          const contextNote = await noteRepo.getNoteById(contextNoteId, actor.workspaceId);
          if (contextNote) {
            citations = citations.filter((c) => String(c.note?.id || "") !== contextNoteId);
            citations.unshift({ rank: 0, score: 1.0, note: contextNote });
          }
        } catch { /* best-effort */ }
      }
      const citationAliasMap = createCitationNoteAliasMap(citations);
      const noteNameAliasMap = createCitationNoteNameAliasMap(citations);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      res.write(`event: citations\ndata: ${JSON.stringify({ citations })}\n\n`);

      try {
        const context = citations.length ? buildCitationBlock(citations) : "";
        let systemPrompt = CHAT_SYSTEM_PROMPT;
        const scopeHints = [];
        if (scope !== "all") {
          scopeHints.push(`Active memory scope is "${scope}".`);
        }
        if (body.project) {
          scopeHints.push(`Project context is "${body.project}".`);
          systemPrompt = `The user is working in folder "${body.project}". Consider this context.\n\n${systemPrompt}`;
        }
        if (workingSetIds.length > 0) {
          scopeHints.push("Prioritize the current working-set items when searching and reasoning.");
        }
        if (scopeHints.length > 0) {
          systemPrompt = `${scopeHints.join(" ")}\n\n${systemPrompt}`;
        }
        systemPrompt = `Citation labels like [N1], [N2], etc are snippet references only and not note IDs. Never pass N1/N2 as tool ids. Do not include citation labels in user-facing prose; refer to items by title/folder name. ${
          contextNoteId ? `If the user says "this note", use id "${contextNoteId}". ` : ""
        }\n\n${systemPrompt}`;
        if (hasAttachment) {
          systemPrompt = `A file/image attachment is included with this request. When the user asks to save a new item, call create_note. When the user asks to replace an existing note's attachment, call update_note_attachment. Attachment payload is supplied server-side and should not be reconstructed.\n\n${systemPrompt}`;
        }

        const questionText = context
          ? `${question}\n\nContext from saved notes:\n${context}`
          : question;

        let currentInput = [
          { role: "user", content: [{ type: "input_text", text: questionText }] },
        ];
        let currentInstructions = systemPrompt;
        let currentPreviousId = undefined;
        let toolRounds = 0;
        const MAX_TOOL_ROUNDS = 3;
        const harness = createAgentToolHarness({
          actor,
          requestId: String(req.headers["x-request-id"] || "").trim(),
          resolveArgs: (name, args) => resolveAgentToolArgs(name, args, {
            contextNoteId,
            contextProject: String(body.project || "").trim(),
            citationAliasMap,
            noteNameAliasMap,
          }),
          executeTool: (name, args, toolActor) => {
            if (name !== "search_notes") {
              return executeChatToolCall(name, args, toolActor, { chatAttachment: hasAttachment ? chatAttachment : null });
            }
            const scopedArgs = {
              ...args,
              scope: String(args?.scope || scope || "all"),
              project: String(args?.project || body.project || ""),
              workingSetIds:
                Array.isArray(args?.workingSetIds) && args.workingSetIds.length > 0
                  ? args.workingSetIds
                  : workingSetIds,
            };
            return executeChatToolCall(name, scopedArgs, toolActor, { chatAttachment: hasAttachment ? chatAttachment : null });
          },
        });

        while (toolRounds <= MAX_TOOL_ROUNDS) {
          const streamResponse = await createStreamingResponse({
            instructions: currentInstructions,
            input: currentInput,
            tools: CHAT_TOOLS,
            previousResponseId: currentPreviousId,
            temperature: 0.2,
          });

          // Parse OpenAI Responses API streaming events
          const reader = streamResponse.body;
          let buffer = "";
          let responseId = "";
          const pendingToolCalls = [];
          let currentToolCall = null;

          for await (const chunk of reader) {
            buffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "response.created") {
                  responseId = parsed.response?.id || "";
                } else if (parsed.type === "response.output_text.delta" && parsed.delta) {
                  res.write(`event: token\ndata: ${JSON.stringify({ token: parsed.delta })}\n\n`);
                } else if (parsed.type === "response.output_item.added" && parsed.item?.type === "function_call") {
                  currentToolCall = { callId: parsed.item.call_id, name: parsed.item.name, args: "" };
                } else if (parsed.type === "response.function_call_arguments.delta") {
                  if (currentToolCall) currentToolCall.args += parsed.delta || "";
                } else if (parsed.type === "response.output_item.done" && parsed.item?.type === "function_call") {
                  if (currentToolCall) {
                    currentToolCall.args = parsed.item.arguments || currentToolCall.args;
                    pendingToolCalls.push(currentToolCall);
                    currentToolCall = null;
                  }
                }
              } catch { /* skip non-JSON lines */ }
            }
          }

          // No tool calls — we're done
          if (pendingToolCalls.length === 0) break;

          // Execute tool calls and collect outputs for continuation
          const toolOutputs = [];
          for (const tc of pendingToolCalls) {
            res.write(`event: tool_call\ndata: ${JSON.stringify({ name: tc.name, status: "executing" })}\n\n`);
            const execution = await harness.runToolCall({
              name: tc.name,
              rawArgs: tc.args,
              callId: tc.callId,
              round: toolRounds,
            });
            res.write(`event: tool_result\ndata: ${JSON.stringify({
              name: tc.name,
              ...(execution.ok
                ? { result: execution.result }
                : { error: execution.error || "Tool call failed" }),
              traceId: execution.trace?.traceId || "",
              cacheHit: Boolean(execution.trace?.cacheHit),
              durationMs: Number(execution.trace?.durationMs || 0),
            })}\n\n`);
            res.write(`event: tool_trace\ndata: ${JSON.stringify(execution.trace || null)}\n\n`);

            toolOutputs.push({
              type: "function_call_output",
              call_id: tc.callId,
              output: JSON.stringify(execution.ok ? execution.result : { error: execution.error || "Tool call failed" }),
            });
          }

          // Continue conversation with tool outputs
          currentPreviousId = responseId;
          currentInput = toolOutputs;
          currentInstructions = undefined;
          toolRounds++;
        }

        res.write(`event: tool_trace\ndata: ${JSON.stringify({
          requestId: harness.requestId,
          traces: harness.traces,
        })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch {
        // Fallback: heuristic answer
        const answer = citations
          .slice(0, 4)
          .map((entry) => `- ${buildAgentNoteTitle(entry.note, "Saved item")}`)
          .join("\n");
        res.write(`event: token\ndata: ${JSON.stringify({ token: answer ? "Based on your saved notes:\n" + answer : "Something went wrong. Please try again." })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
      return;
    }

    if (hasAttachment && String(body.captureIntent || "").trim().toLowerCase() === "save") {
      const note = await createMemory({
        content: String(body.question || "").trim(),
        sourceType: chatAttachment.fileMimeType.startsWith("image/") ? "image" : "file",
        sourceUrl: "",
        imageDataUrl: chatAttachment.imageDataUrl,
        fileDataUrl: chatAttachment.fileDataUrl,
        fileName: chatAttachment.fileName,
        fileMimeType: chatAttachment.fileMimeType,
        project: String(body.project || ""),
        metadata: { createdFrom: "chat-agent-fallback", actorUserId: actor.userId },
        actor,
      });
      sendJson(res, 200, {
        answer: `Saved "${note.fileName || note.summary || "attachment"}".`,
        citations: [{ rank: 1, score: 1, note }],
        mode: "direct-save",
      });
      return;
    }

    const result = await askMemories({
      question: body.question,
      project: body.project,
      limit: Number(body.limit || 6),
      contextNoteId: body.contextNoteId || "",
      actor,
      scope,
      workingSetIds,
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/context") {
    const body = await readJsonBody(req);
    const scope = String(body.scope || "all");
    const workingSetIds = parseWorkingSetIds(body.workingSetIds);
    const result = await buildProjectContext({
      task: body.task,
      project: body.project,
      limit: Number(body.limit || 8),
      actor,
      scope,
      workingSetIds,
      contextNoteId: body.contextNoteId || "",
    });
    sendJson(res, 200, result);
    return;
  }

  // Folder routes
  if (req.method === "GET" && url.pathname === "/api/folders") {
    const parentId = url.searchParams.get("parentId") || null;
    const folders = await folderRepo.listFolders(parentId, actor.workspaceId);
    sendJson(res, 200, { items: folders, count: folders.length });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/folders") {
    const body = await readJsonBody(req);
    try {
      const folder = await createWorkspaceFolder({
        name: body.name,
        description: body.description,
        color: body.color,
        symbol: body.symbol,
        parentId: body.parentId,
        actor,
      });
      sendJson(res, 201, { folder });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : "Create failed" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/folders\/[^/]+\/collaborators$/)) {
    const suffix = "/collaborators";
    const encodedId = url.pathname.slice("/api/folders/".length, -suffix.length);
    const folderId = decodeURIComponent(encodedId || "").trim();
    if (!folderId) {
      sendJson(res, 400, { error: "Missing folder id" });
      return;
    }
    try {
      const result = await listFolderCollaborators({
        folderId,
        actor,
      });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to list collaborators" });
    }
    return;
  }

  if (req.method === "PUT" && url.pathname.match(/^\/api\/folders\/[^/]+\/collaborators\/[^/]+$/)) {
    const prefix = "/api/folders/";
    const marker = "/collaborators/";
    const markerIndex = url.pathname.indexOf(marker);
    const encodedFolderId = url.pathname.slice(prefix.length, markerIndex);
    const encodedUserId = url.pathname.slice(markerIndex + marker.length);
    const folderId = decodeURIComponent(encodedFolderId || "").trim();
    const userId = decodeURIComponent(encodedUserId || "").trim();
    if (!folderId || !userId) {
      sendJson(res, 400, { error: "Missing folder id or user id" });
      return;
    }
    const body = await readJsonBody(req);
    try {
      const collaborator = await setFolderCollaboratorRole({
        folderId,
        userId,
        role: body.role || "viewer",
        actor,
      });
      sendJson(res, 200, { collaborator });
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to update collaborator role" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/folders\/[^/]+\/collaborators\/[^/]+$/)) {
    const prefix = "/api/folders/";
    const marker = "/collaborators/";
    const markerIndex = url.pathname.indexOf(marker);
    const encodedFolderId = url.pathname.slice(prefix.length, markerIndex);
    const encodedUserId = url.pathname.slice(markerIndex + marker.length);
    const folderId = decodeURIComponent(encodedFolderId || "").trim();
    const userId = decodeURIComponent(encodedUserId || "").trim();
    if (!folderId || !userId) {
      sendJson(res, 400, { error: "Missing folder id or user id" });
      return;
    }
    try {
      const result = await removeFolderCollaborator({
        folderId,
        userId,
        actor,
      });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to remove collaborator" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/folders\/[^/]+\/children$/)) {
    const encodedId = url.pathname.slice("/api/folders/".length, url.pathname.lastIndexOf("/children"));
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing folder id" });
      return;
    }
    const children = await folderRepo.listFolders(id, actor.workspaceId);
    sendJson(res, 200, { items: children, count: children.length });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/folders/")) {
    const encodedId = url.pathname.slice("/api/folders/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing folder id" });
      return;
    }
    let folder = await folderRepo.getFolder(id, actor.workspaceId);
    if (!folder) {
      folder = await folderRepo.getFolderByName(id, actor.workspaceId);
    }
    if (!folder) {
      sendJson(res, 404, { error: "Folder not found" });
      return;
    }
    sendJson(res, 200, { folder });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/folders/")) {
    const encodedId = url.pathname.slice("/api/folders/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing folder id" });
      return;
    }
    const body = await readJsonBody(req);
    try {
      const folder = await updateWorkspaceFolder({
        id,
        patch: {
          name: body.name,
          description: body.description,
          color: body.color,
          symbol: body.symbol,
          parentId: body.parentId,
        },
        actor,
      });
      sendJson(res, 200, { folder });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      sendJson(res, msg.includes("not found") ? 404 : 400, { error: msg });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/folders/")) {
    const encodedId = url.pathname.slice("/api/folders/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing folder id" });
      return;
    }
    try {
      const result = await deleteWorkspaceFolder({ id, actor });
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      sendJson(res, msg.includes("not found") ? 404 : 400, { error: msg });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    const status = url.searchParams.get("status") || "open";
    const tasks = await taskRepo.listTasks(status, actor.workspaceId);
    sendJson(res, 200, { items: tasks, count: tasks.length });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJsonBody(req);
    const task = await taskRepo.createTask({
      title: body.title,
      status: body.status || "open",
      workspaceId: actor.workspaceId,
    });
    sendJson(res, 201, { task });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/tasks/")) {
    const encodedId = url.pathname.slice("/api/tasks/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return;
    }
    const body = await readJsonBody(req);
    try {
      const task = await taskRepo.updateTask(
        id,
        {
          title: body.title,
          status: body.status,
        },
        actor.workspaceId
      );
      sendJson(res, 200, { task });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      sendJson(res, msg.includes("not found") ? 404 : 400, { error: msg });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/tasks/")) {
    const encodedId = url.pathname.slice("/api/tasks/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing task id" });
      return;
    }
    try {
      const result = await taskRepo.deleteTask(id, actor.workspaceId);
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      sendJson(res, msg.includes("not found") ? 404 : 400, { error: msg });
    }
    return;
  }

  // POST /api/notes/:id/comments — add contextual comment to note metadata
  if (req.method === "POST" && url.pathname.match(/^\/api\/notes\/[^/]+\/comments$/)) {
    const suffix = "/comments";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    const body = await readJsonBody(req);
    const text = String(body?.text || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "Missing comment text" });
      return;
    }
    try {
      const result = await addMemoryComment({
        id,
        text,
        actor,
      });
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add comment";
      sendJson(res, resolveErrorStatus(err, msg.includes("not found") ? 404 : 400), { error: msg });
    }
    return;
  }

  // GET /api/notes/:id/versions — list version history for a note
  if (req.method === "GET" && url.pathname.match(/^\/api\/notes\/[^/]+\/versions$/)) {
    const suffix = "/versions";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    try {
      const result = await listMemoryVersions({ id, actor });
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to list versions";
      sendJson(res, resolveErrorStatus(err, msg.includes("not found") ? 404 : 400), { error: msg });
    }
    return;
  }

  // POST /api/notes/:id/restore — restore a note to a previous version
  if (req.method === "POST" && url.pathname.match(/^\/api\/notes\/[^/]+\/restore$/)) {
    const suffix = "/restore";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    const body = await readJsonBody(req);
    const versionNumber = Number(body?.versionNumber);
    if (!Number.isFinite(versionNumber) || versionNumber < 1) {
      sendJson(res, 400, { error: "Missing or invalid versionNumber" });
      return;
    }
    try {
      const note = await restoreMemoryVersion({ id, versionNumber, actor });
      sendJson(res, 200, { note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      sendJson(res, resolveErrorStatus(err, msg.includes("not found") ? 404 : 400), { error: msg });
    }
    return;
  }

  // PUT /api/notes/:id/extracted — update extracted markdown/raw content
  if (req.method === "PUT" && url.pathname.match(/^\/api\/notes\/[^/]+\/extracted$/)) {
    const suffix = "/extracted";
    const encodedId = url.pathname.slice("/api/notes/".length, -suffix.length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    const body = await readJsonBody(req);
    const hasTitle = body.title !== undefined;
    const hasContent = body.content !== undefined;
    const hasRawContent = body.rawContent !== undefined;
    const hasMarkdownContent = body.markdownContent !== undefined;
    if (!hasTitle && !hasContent && !hasRawContent && !hasMarkdownContent) {
      sendJson(res, 400, { error: "Nothing to update" });
      return;
    }
    if (hasTitle && body.title !== null && typeof body.title !== "string") {
      sendJson(res, 400, { error: "title must be a string or null" });
      return;
    }
    if (hasContent && body.content !== null && typeof body.content !== "string") {
      sendJson(res, 400, { error: "content must be a string or null" });
      return;
    }
    if (hasRawContent && body.rawContent !== null && typeof body.rawContent !== "string") {
      sendJson(res, 400, { error: "rawContent must be a string or null" });
      return;
    }
    if (hasMarkdownContent && body.markdownContent !== null && typeof body.markdownContent !== "string") {
      sendJson(res, 400, { error: "markdownContent must be a string or null" });
      return;
    }
    try {
      const note = await updateMemoryExtractedContent({
        id,
        title: body.title,
        content: body.content,
        rawContent: body.rawContent,
        markdownContent: body.markdownContent,
        requeueEnrichment: body.requeueEnrichment === true,
        actor,
      });
      sendJson(res, 200, { note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update extracted content failed";
      sendJson(res, resolveErrorStatus(err, msg.includes("not found") ? 404 : 400), { error: msg });
    }
    return;
  }

  // PUT /api/notes/:id — update a note
  if (req.method === "PUT" && url.pathname.startsWith("/api/notes/")) {
    const encodedId = url.pathname.slice("/api/notes/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing id" });
      return;
    }
    const body = await readJsonBody(req);
    const validation = validateNotePayload(body, { requireContent: false });
    if (!validation.valid) {
      sendJson(res, 400, { error: validation.errors.join("; ") });
      return;
    }
    try {
      const note = await updateMemory({
        id,
        title: body.title,
        content: body.content,
        summary: body.summary,
        tags: body.tags,
        project: body.project,
        actor,
      });
      sendJson(res, 200, { note });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      sendJson(res, resolveErrorStatus(err, msg.includes("not found") ? 404 : 400), { error: msg });
    }
    return;
  }

  // GET /api/tags — list all tags with counts
  if (req.method === "GET" && url.pathname === "/api/tags") {
    const tags = await listTags(actor);
    sendJson(res, 200, { items: tags, count: tags.length });
    return;
  }

  // POST /api/tags/rename — rename a tag across all notes
  if (req.method === "POST" && url.pathname === "/api/tags/rename") {
    const body = await readJsonBody(req);
    if (!body.oldTag || !body.newTag) {
      sendJson(res, 400, { error: "Missing oldTag or newTag" });
      return;
    }
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can rename tags globally" });
      return;
    }
    const updated = await noteRepo.renameTag(body.oldTag, body.newTag, actor.workspaceId);
    sendJson(res, 200, { updated });
    return;
  }

  // DELETE /api/tags/:tag — remove a tag from all notes
  if (req.method === "DELETE" && url.pathname.startsWith("/api/tags/")) {
    const encodedTag = url.pathname.slice("/api/tags/".length);
    const tag = decodeURIComponent(encodedTag || "").trim();
    if (!tag) {
      sendJson(res, 400, { error: "Missing tag" });
      return;
    }
    if (!isWorkspaceManager(actor)) {
      sendJson(res, 403, { error: "Forbidden: only workspace owners/admins can remove tags globally" });
      return;
    }
    const updated = await noteRepo.removeTag(tag, actor.workspaceId);
    sendJson(res, 200, { updated });
    return;
  }

  // GET /api/stats — dashboard statistics
  if (req.method === "GET" && url.pathname === "/api/stats") {
    const stats = await getMemoryStats(actor);
    let queue = {
      pending: enrichmentQueue.pending ?? 0,
      running: enrichmentQueue.active ?? 0,
      failed: enrichmentQueue.stats?.failed ?? 0,
      queued: enrichmentQueue.stats?.queued ?? 0,
      retry: enrichmentQueue.stats?.retry ?? 0,
      completed: enrichmentQueue.stats?.completed ?? 0,
      delayed: enrichmentQueue.stats?.delayed ?? 0,
      total: enrichmentQueue.stats?.total ?? 0,
    };
    if (isWorkspaceManager(actor)) {
      try {
        const queueStats = await getEnrichmentQueueStats({ actor, failedLimit: 1 });
        if (queueStats?.counts) {
          queue = {
            pending: Number(queueStats.counts.pending || 0),
            running: Number(queueStats.counts.running || 0),
            failed: Number(queueStats.counts.failed || 0),
            queued: Number(queueStats.counts.queued || 0),
            retry: Number(queueStats.counts.retry || 0),
            completed: Number(queueStats.counts.completed || 0),
            delayed: Number(queueStats.counts.delayed || 0),
            total: Number(queueStats.counts.total || 0),
          };
        }
      } catch {
        // no-op: stats endpoint should remain best-effort
      }
    }
    sendJson(res, 200, { ...stats, queue });
    return;
  }

  // POST /api/notes/batch-delete — delete multiple notes
  if (req.method === "POST" && url.pathname === "/api/notes/batch-delete") {
    const body = await readJsonBody(req);
    const bv = validateBatchPayload(body);
    if (!bv.valid) {
      sendJson(res, 400, { error: bv.errors.join("; ") });
      return;
    }
    try {
      const result = await batchDeleteMemories({ ids: body.ids, actor });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Batch delete failed" });
    }
    return;
  }

  // POST /api/notes/batch-move — move multiple notes to a project
  if (req.method === "POST" && url.pathname === "/api/notes/batch-move") {
    const body = await readJsonBody(req);
    const bv = validateBatchPayload(body);
    if (!bv.valid) {
      sendJson(res, 400, { error: bv.errors.join("; ") });
      return;
    }
    try {
      const moved = await batchMoveMemories({
        ids: body.ids,
        project: body.project || "",
        actor,
      });
      sendJson(res, 200, moved);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Batch move failed" });
    }
    return;
  }

  // GET /api/export — export notes as JSON or markdown
  if (req.method === "GET" && url.pathname === "/api/export") {
    const project = url.searchParams.get("project") || null;
    const format = url.searchParams.get("format") || "json";
    const data = await exportMemories({ project, format, actor });
    if (format === "markdown") {
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": "attachment; filename=notes-export.md",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    } else {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": "attachment; filename=notes-export.json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    }
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

const server = http.createServer(async (req, res) => {
  const reqStart = Date.now();
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Rate limiting for API routes
    if (url.pathname.startsWith("/api/") && req.method !== "OPTIONS") {
      const rate = checkRate(req);
      if (!rate.allowed) {
        res.writeHead(429, {
          "Content-Type": "application/json; charset=utf-8",
          "Retry-After": String(rate.retryAfter),
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify({ error: "Too many requests", retryAfter: rate.retryAfter }));
        requestLogger(req, res, reqStart);
        return;
      }
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      requestLogger(req, res, reqStart);
      return;
    }

    if (url.pathname.startsWith("/uploads/")) {
      const relative = url.pathname.replace(/^\/uploads\//, "");
      const absolutePath = sanitizePath(config.uploadDir, relative);
      if (!absolutePath) {
        sendText(res, 403, "Forbidden");
        return;
      }
      await serveFile(res, absolutePath);
      return;
    }

    const routePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const absolutePath = sanitizePath(PUBLIC_DIR, routePath);
    if (!absolutePath) {
      sendText(res, 403, "Forbidden");
      return;
    }

    await serveFile(res, absolutePath);
  } catch (error) {
    logger.error("request_error", {
      method: req.method,
      url: req.url,
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

async function startServer() {
  const { ensurePostgresReady } = await import("./postgres/runtime.js");
  await ensurePostgresReady();
  await enrichmentQueue.start();

  server.listen(config.port, () => {
    logger.info("server_start", {
      url: `http://localhost:${config.port}`,
      dbProvider: providerName,
      dbBridgeMode: storageBridgeMode,
      openai: hasOpenAI(),
    });
    if (!hasOpenAI()) {
      logger.warn("openai_missing", { msg: "Running with heuristic enrichment/retrieval fallback" });
    }
  });
}

startServer().catch((error) => {
  logger.error("server_start_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
