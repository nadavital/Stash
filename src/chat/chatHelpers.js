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
