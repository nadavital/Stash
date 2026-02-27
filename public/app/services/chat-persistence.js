const CHAT_STORAGE_PREFIX = "stash:chat:v1";
const MAX_MESSAGES = 100;
const MAX_MESSAGE_TEXT_LENGTH = 12000;
const MAX_CITATIONS = 24;
const MAX_PENDING_FOLLOW_UPS = 8;
const MAX_TEXT_FIELD_LENGTH = 2000;
const MAX_URL_LENGTH = 2000;

function asTrimmedString(value, maxLength = MAX_TEXT_FIELD_LENGTH) {
  return String(value || "").trim().slice(0, maxLength);
}

function asUrlString(value) {
  return String(value || "").trim().slice(0, MAX_URL_LENGTH);
}

function sanitizeObjectPayload(value, { maxChars = 20000 } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > maxChars) return null;
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function sanitizeMessage(entry, index = 0) {
  if (!entry || typeof entry !== "object") return null;
  const role = entry.role === "assistant" ? "assistant" : entry.role === "user" ? "user" : "";
  if (!role) return null;

  const text = String(entry.text || "").slice(0, MAX_MESSAGE_TEXT_LENGTH);
  if (!text && role !== "assistant") return null;

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

function sanitizePendingFollowUp(entry) {
  if (!entry || typeof entry !== "object") return null;
  const messageId = asTrimmedString(entry.messageId, 96);
  if (!messageId) return null;

  const normalizedKind = asTrimmedString(entry.kind, 40).toLowerCase();
  const source = entry.payload && typeof entry.payload === "object" ? entry.payload : entry;
  if (normalizedKind === "task_proposal" || source?.proposal || source?.scheduleType || source?.intervalMinutes) {
    const proposalSource = source?.proposal && typeof source.proposal === "object" ? source.proposal : source;
    const title = asTrimmedString(proposalSource.title || proposalSource.name, 240);
    if (!title) return null;
    const summary = asTrimmedString(proposalSource.summary, 320);
    const prompt = asTrimmedString(proposalSource.prompt || title, 2000) || title;
    const proposalSignature = asTrimmedString(proposalSource.proposalSignature, 80);
    const scopeFolder = asTrimmedString(proposalSource.scopeFolder || proposalSource.project, 160);
    const scheduleTypeRaw = asTrimmedString(proposalSource.scheduleType, 40).toLowerCase();
    const scheduleType = scheduleTypeRaw === "interval" ? "interval" : "manual";
    const intervalRaw = Number(proposalSource.intervalMinutes);
    const intervalMinutes = scheduleType === "interval" && Number.isFinite(intervalRaw) && intervalRaw > 0
      ? Math.max(5, Math.min(10080, Math.floor(intervalRaw)))
      : (scheduleType === "interval" ? 1440 : null);
    const timezone = asTrimmedString(proposalSource.timezone, 80);
    const rawNextRunAt = asTrimmedString(proposalSource.nextRunAt, 120);
    const parsedNextRunAt = rawNextRunAt ? new Date(rawNextRunAt) : null;
    const nextRunAt = parsedNextRunAt && !Number.isNaN(parsedNextRunAt.getTime())
      ? parsedNextRunAt.toISOString()
      : "";
    const maxActionsRaw = Number(proposalSource.maxActionsPerRun);
    const maxConsecutiveRaw = Number(proposalSource.maxConsecutiveFailures);
    const maxActionsPerRun = Number.isFinite(maxActionsRaw) ? Math.max(1, Math.min(25, Math.floor(maxActionsRaw))) : 4;
    const maxConsecutiveFailures = Number.isFinite(maxConsecutiveRaw)
      ? Math.max(1, Math.min(20, Math.floor(maxConsecutiveRaw)))
      : 3;
    const dryRun = proposalSource.dryRun === true;
    const spec = sanitizeObjectPayload(proposalSource.spec);
    const actions = Array.isArray(source.actions)
      ? source.actions.map((option) => asTrimmedString(option, 80)).filter(Boolean).slice(0, 3)
      : [];

    return {
      messageId,
      kind: "task_proposal",
      payload: {
        title,
        ...(summary ? { summary } : {}),
        prompt,
        ...(scopeFolder ? { scopeFolder } : {}),
        scheduleType,
        ...(scheduleType === "interval" ? { intervalMinutes } : {}),
        ...(timezone ? { timezone } : {}),
        ...(nextRunAt ? { nextRunAt } : {}),
        ...(proposalSignature ? { proposalSignature } : {}),
        ...(spec ? { spec } : {}),
        maxActionsPerRun,
        maxConsecutiveFailures,
        dryRun,
        ...(actions.length ? { actions } : {}),
      },
    };
  }

  const question = asTrimmedString(source.question, 240);
  if (!question) return null;

  const rawAnswerMode = asTrimmedString(source.answerMode, 40).toLowerCase();
  const validModes = new Set(["freeform_only", "choices_only", "choices_plus_freeform"]);
  let answerMode = validModes.has(rawAnswerMode) ? rawAnswerMode : "freeform_only";

  let options = Array.isArray(source.options)
    ? source.options.map((option) => asTrimmedString(option, 120)).filter(Boolean).slice(0, 4)
    : [];
  if (answerMode === "freeform_only") {
    options = [];
  } else if (options.length === 0) {
    answerMode = "freeform_only";
  }

  const context = asTrimmedString(source.context, 240);

  return {
    messageId,
    kind: "question",
    payload: {
      question,
      answerMode,
      options,
      ...(context ? { context } : {}),
    },
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

  const chatPendingFollowUps = Array.isArray(raw.chatPendingFollowUps)
    ? raw.chatPendingFollowUps
        .map((entry) => sanitizePendingFollowUp(entry))
        .filter(Boolean)
        .slice(-MAX_PENDING_FOLLOW_UPS)
    : [];

  return { chatMessages, chatCitations, chatPendingFollowUps };
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
    if (
      !safeState.chatMessages.length
      && !safeState.chatCitations.length
      && !safeState.chatPendingFollowUps.length
    ) {
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
