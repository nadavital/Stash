const CHAT_STORAGE_PREFIX = "stash:chat:v1";
const MAX_MESSAGES = 100;
const MAX_MESSAGE_TEXT_LENGTH = 12000;
const MAX_CITATIONS = 24;
const MAX_TEXT_FIELD_LENGTH = 2000;
const MAX_URL_LENGTH = 2000;

function asTrimmedString(value, maxLength = MAX_TEXT_FIELD_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function asUrlString(value) {
  return String(value || "").trim().slice(0, MAX_URL_LENGTH);
}

function sanitizeMessage(entry, index = 0) {
  if (!entry || typeof entry !== "object") return null;
  const role = entry.role === "assistant" ? "assistant" : entry.role === "user" ? "user" : "";
  if (!role) return null;

  const text = String(entry.text || "").slice(0, MAX_MESSAGE_TEXT_LENGTH);
  if (!text) return null;

  const id = asTrimmedString(entry.id, 96) || `persisted-${role}-${index + 1}`;
  return { role, text, id };
}

function sanitizeCitation(entry, index = 0) {
  if (!entry || typeof entry !== "object") return null;

  const noteCandidate = entry.note && typeof entry.note === "object" ? entry.note : entry;
  const noteId = asTrimmedString(noteCandidate.id, 96);
  const title = asTrimmedString(noteCandidate.title, 240);
  const project = asTrimmedString(noteCandidate.project, 160);
  const sourceType = asTrimmedString(noteCandidate.sourceType || noteCandidate.source_type, 48);
  const sourceUrl = asUrlString(noteCandidate.sourceUrl || noteCandidate.source_url);
  const summary = asTrimmedString(noteCandidate.summary, 500);
  const content = asTrimmedString(noteCandidate.content, 1200);

  if (!noteId && !title && !summary && !content && !sourceUrl) {
    return null;
  }

  const note = {
    ...(noteId ? { id: noteId } : {}),
    ...(title ? { title } : {}),
    ...(project ? { project } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(summary ? { summary } : {}),
    ...(content ? { content } : {}),
  };

  const rankValue = Number(entry.rank);
  const scoreValue = Number(entry.score);
  const rank = Number.isFinite(rankValue) ? rankValue : index + 1;

  return {
    rank,
    ...(Number.isFinite(scoreValue) ? { score: scoreValue } : {}),
    note,
  };
}

export function buildChatStorageKey(session) {
  const workspaceId = asTrimmedString(session?.workspaceId, 96) || "workspace";
  const userId = asTrimmedString(session?.userId, 96) || "user";
  return `${CHAT_STORAGE_PREFIX}:${workspaceId}:${userId}`;
}

export function sanitizeChatState(state) {
  const raw = state && typeof state === "object" ? state : {};

  const chatMessages = Array.isArray(raw.chatMessages)
    ? raw.chatMessages.map((entry, index) => sanitizeMessage(entry, index)).filter(Boolean).slice(-MAX_MESSAGES)
    : [];

  const chatCitations = Array.isArray(raw.chatCitations)
    ? raw.chatCitations.map((entry, index) => sanitizeCitation(entry, index)).filter(Boolean).slice(0, MAX_CITATIONS)
    : [];

  return { chatMessages, chatCitations };
}

export function getBrowserStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadPersistedChatState(storage, session) {
  if (!storage || typeof storage.getItem !== "function") return null;
  const key = buildChatStorageKey(session);

  try {
    const payload = storage.getItem(key);
    if (!payload) return null;
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object") return null;
    return sanitizeChatState(parsed);
  } catch {
    return null;
  }
}

export function savePersistedChatState(storage, session, state) {
  if (!storage || typeof storage.setItem !== "function") return;
  const key = buildChatStorageKey(session);
  const safeState = sanitizeChatState(state);

  try {
    if (!safeState.chatMessages.length && !safeState.chatCitations.length) {
      if (typeof storage.removeItem === "function") {
        storage.removeItem(key);
      }
      return;
    }

    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        ...safeState,
      })
    );
  } catch {
    // ignore storage quota / unavailable errors
  }
}

export function clearPersistedChatState(storage, session) {
  if (!storage || typeof storage.removeItem !== "function") return;
  const key = buildChatStorageKey(session);
  try {
    storage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}
