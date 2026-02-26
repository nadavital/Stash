export function parseWorkingSetIds(rawValue, max = 50) {
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

export function normalizeRecentChatMessages(rawMessages, max = 12) {
  const source = Array.isArray(rawMessages) ? rawMessages : [];
  const normalized = [];
  for (const entry of source.slice(-Math.max(max * 2, max))) {
    if (!entry || typeof entry !== "object") continue;
    const role = String(entry.role || "").trim().toLowerCase();
    if (role !== "user" && role !== "assistant") continue;
    const text = String(entry.text || entry.content || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    normalized.push({
      role,
      text: text.slice(0, 1600),
    });
  }
  return normalized.slice(-max);
}

export function isLikelyExternalInfoRequest(text = "") {
  const normalized = String(text || "").toLowerCase();
  if (!normalized.trim()) return false;
  return /\b(coffee|cafe|restaurant|bar|date night|brunch|dinner|lunch|near me|open now|weather|traffic|flight|hotel|airbnb|event|concert|museum|park|things to do|itinerary|plan a trip|recommend|look (?:it )?up|search (?:the )?(?:web|internet)|google|find online|check online|latest|current|today|right now|on github|github repo)\b/.test(normalized);
}

export function buildRecentConversationBlock(messages = [], maxMessages = 8, maxCharsPerMessage = 280) {
  const normalized = Array.isArray(messages)
    ? messages
        .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant"))
        .slice(-Math.max(1, maxMessages))
        .map((entry) => {
          const role = entry.role === "assistant" ? "Assistant" : "User";
          const text = String(entry.text || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, Math.max(40, maxCharsPerMessage));
          return text ? `${role}: ${text}` : "";
        })
        .filter(Boolean)
    : [];
  if (!normalized.length) return "";
  return `Recent conversation:\n${normalized.join("\n")}`;
}

export function buildAgentNoteTitle(note = null, fallback = "Untitled item") {
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

function normalizeMessageText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractIanaTimezone(value = "") {
  const text = normalizeMessageText(value);
  if (!text) return "";
  const match = text.match(/\b([A-Za-z][A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+){1,3})\b/);
  if (!match?.[1]) return "";
  return normalizeIanaTimezone(match[1]);
}

export function normalizeIanaTimezone(value = "") {
  const timezone = normalizeMessageText(value);
  if (!timezone) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "";
  }
}

export function inferUserTimezoneFromMessages({
  question = "",
  recentMessages = [],
  configuredTimezone = "",
} = {}) {
  const direct = extractIanaTimezone(question);
  if (direct) return direct;

  const history = Array.isArray(recentMessages) ? recentMessages : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    const candidate = extractIanaTimezone(entry?.text || "");
    if (candidate) return candidate;
  }

  return normalizeIanaTimezone(configuredTimezone);
}

function extractClockTimeFromText(value = "") {
  const text = normalizeMessageText(value);
  if (!text) return null;
  const ampm = text.match(/\b([01]?\d)(?::([0-5]\d))?\s*(a\.?m?\.?|p\.?m?\.?)\b/i);
  if (ampm) {
    const rawHour = Number(ampm[1]);
    if (!Number.isFinite(rawHour) || rawHour < 1 || rawHour > 12) return null;
    const minute = Number(ampm[2] || "0");
    const marker = String(ampm[3] || "").toLowerCase();
    const isPm = marker.startsWith("p");
    const hour = (rawHour % 12) + (isPm ? 12 : 0);
    return { hour, minute };
  }
  const twentyFourHour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { hour, minute };
  }
  return null;
}

function extractDayPeriodTime(value = "") {
  const text = normalizeMessageText(value).toLowerCase();
  if (!text) return null;
  if (/\bmorning\b/.test(text)) return { hour: 9, minute: 0 };
  if (/\bafternoon\b/.test(text)) return { hour: 14, minute: 0 };
  if (/\bevening\b/.test(text)) return { hour: 18, minute: 0 };
  if (/\bnight\b/.test(text)) return { hour: 21, minute: 0 };
  if (/\bnoon\b/.test(text)) return { hour: 12, minute: 0 };
  return null;
}

function getZonedDateParts(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const map = {};
    for (const part of parts) {
      if (!part?.type || part.type === "literal") continue;
      map[part.type] = part.value;
    }
    const year = Number(map.year);
    const month = Number(map.month);
    const day = Number(map.day);
    const hour = Number(map.hour);
    const minute = Number(map.minute);
    const second = Number(map.second);
    if ([year, month, day, hour, minute, second].some((value) => !Number.isFinite(value))) {
      return null;
    }
    return { year, month, day, hour, minute, second };
  } catch {
    return null;
  }
}

function getTimezoneOffsetMinutes(date, timeZone) {
  const parts = getZonedDateParts(date, timeZone);
  if (!parts) return null;
  const asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  return (asUTC - date.getTime()) / 60000;
}

function makeDateInTimezone({ timeZone, year, month, day, hour, minute }) {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const offsetMinutes = getTimezoneOffsetMinutes(new Date(utcMillis), timeZone);
    if (!Number.isFinite(offsetMinutes)) return null;
    const nextUtcMillis = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60000;
    if (Math.abs(nextUtcMillis - utcMillis) < 1) {
      utcMillis = nextUtcMillis;
      break;
    }
    utcMillis = nextUtcMillis;
  }
  return new Date(utcMillis);
}

function computeNextZonedOccurrence({ timeZone, hour, minute, now = new Date() }) {
  const nowDate = now instanceof Date ? now : new Date();
  const nowParts = getZonedDateParts(nowDate, timeZone);
  if (!nowParts) return "";

  let candidate = makeDateInTimezone({
    timeZone,
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
    hour,
    minute,
  });
  if (!candidate) return "";
  if (candidate.getTime() <= nowDate.getTime() + 1000) {
    const tomorrowReference = new Date(candidate.getTime() + 26 * 60 * 60 * 1000);
    const tomorrowParts = getZonedDateParts(tomorrowReference, timeZone);
    if (!tomorrowParts) return "";
    candidate = makeDateInTimezone({
      timeZone,
      year: tomorrowParts.year,
      month: tomorrowParts.month,
      day: tomorrowParts.day,
      hour,
      minute,
    });
    if (!candidate) return "";
  }
  return candidate.toISOString();
}

export function inferTaskNextRunAtFromMessages({
  question = "",
  recentMessages = [],
  timezone = "",
  intervalMinutes = 0,
  scheduleType = "",
  now = new Date(),
} = {}) {
  const normalizedTimezone = normalizeIanaTimezone(timezone);
  if (!normalizedTimezone) return "";
  const normalizedScheduleType = normalizeMessageText(scheduleType).toLowerCase();
  const normalizedInterval = Number(intervalMinutes || 0);
  if (normalizedScheduleType !== "interval" || normalizedInterval !== 1440) return "";

  const candidates = [normalizeMessageText(question)];
  const history = Array.isArray(recentMessages) ? recentMessages : [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (String(entry?.role || "").toLowerCase() !== "user") continue;
    const text = normalizeMessageText(entry?.text || "");
    if (text) candidates.push(text);
  }

  for (const text of candidates) {
    const exact = extractClockTimeFromText(text);
    if (!exact) continue;
    return computeNextZonedOccurrence({
      timeZone: normalizedTimezone,
      hour: exact.hour,
      minute: exact.minute,
      now,
    });
  }

  for (const text of candidates) {
    const period = extractDayPeriodTime(text);
    if (!period) continue;
    return computeNextZonedOccurrence({
      timeZone: normalizedTimezone,
      hour: period.hour,
      minute: period.minute,
      now,
    });
  }

  return "";
}

export function isExplicitTaskCreationConfirmation(text = "") {
  const normalized = normalizeMessageText(text).toLowerCase();
  if (!normalized) return false;

  if (normalized.includes("?")) return false;
  if (/^(can|could|would|should|what|when|why|how)\b/.test(normalized)) return false;
  if (/\b(no|don't|do not|stop|cancel|not now|later)\b/.test(normalized)) return false;

  if (
    /^(yes|yep|yeah|sure|ok|okay|confirm|approved|go ahead|do it|proceed|looks good|sounds good)\b/.test(normalized)
  ) {
    return true;
  }

  if (/\b(create|save|confirm|approve|proceed)\b/.test(normalized) && /\b(task|automation|it|this)\b/.test(normalized)) {
    return true;
  }

  return false;
}
