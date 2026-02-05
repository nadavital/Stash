const ADAPTER_DEBUG = false;

const API_ENDPOINTS = Object.freeze({
  health: "/api/health",
  notes: "/api/notes",
  chat: "/api/chat",
  context: "/api/context",
});

function adapterLog(...args) {
  if (!ADAPTER_DEBUG) return;
  // eslint-disable-next-line no-console
  console.debug("[adapter]", ...args);
}

function createMockSeedNotes() {
  const now = Date.now();
  return [
    {
      id: "mock-launch-checklist",
      content: "Launch checklist drafted: pricing page copy, onboarding tour, and signup QA for desktop demo.",
      summary: "Launch checklist includes pricing copy, onboarding, and signup QA.",
      tags: ["launch", "onboarding", "qa"],
      project: "demo",
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

const state = {
  imageDataUrl: null,
  imageName: "",
  notes: [],
  renderedItems: [],
  loading: false,
  fallbackActive: false,
  mockNotes: createMockSeedNotes(),
  streamControlsOpen: false,
  activeModalItem: null,
  toastTimer: null,
};

const els = {
  statusPill: document.getElementById("status-pill"),
  adapterBadge: document.getElementById("adapter-badge"),
  adapterHelper: document.getElementById("adapter-helper"),
  captureForm: document.getElementById("capture-form"),
  contentInput: document.getElementById("content-input"),
  projectInput: document.getElementById("project-input"),
  captureHint: document.getElementById("capture-hint"),
  imageDropZone: document.getElementById("image-drop-zone"),
  imageInput: document.getElementById("image-input"),
  imagePickerBtn: document.getElementById("image-picker-btn"),
  removeImageBtn: document.getElementById("remove-image-btn"),
  imageName: document.getElementById("image-name"),
  imagePreview: document.getElementById("image-preview"),
  saveBtn: document.getElementById("save-btn"),
  toast: document.getElementById("toast"),
  notesList: document.getElementById("notes-list"),
  noteTemplate: document.getElementById("note-template"),
  streamControlsBtn: document.getElementById("stream-controls-btn"),
  streamControls: document.getElementById("stream-controls"),
  refreshBtn: document.getElementById("refresh-btn"),
  searchInput: document.getElementById("search-input"),
  projectFilterInput: document.getElementById("project-filter-input"),
  sortSelect: document.getElementById("sort-select"),
  typeFilterSelect: document.getElementById("type-filter-select"),
  searchBtn: document.getElementById("search-btn"),
  chatForm: document.getElementById("chat-form"),
  questionInput: document.getElementById("question-input"),
  answerOutput: document.getElementById("answer-output"),
  answerMeta: document.getElementById("answer-meta"),
  citationList: document.getElementById("citation-list"),
  contextBtn: document.getElementById("context-btn"),
  memoryModal: document.getElementById("memory-modal"),
  memoryModalBackdrop: document.getElementById("memory-modal-backdrop"),
  memoryModalClose: document.getElementById("memory-modal-close"),
  memoryModalTitle: document.getElementById("memory-modal-title"),
  memoryModalContent: document.getElementById("memory-modal-content"),
  memoryModalSummary: document.getElementById("memory-modal-summary"),
  memoryModalImage: document.getElementById("memory-modal-image"),
  memoryModalSource: document.getElementById("memory-modal-source"),
  memoryModalTags: document.getElementById("memory-modal-tags"),
  memoryModalMeta: document.getElementById("memory-modal-meta"),
};

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

function normalizeSourceType(value) {
  const normalized = String(value || "text").toLowerCase().trim();
  return ["text", "link", "image"].includes(normalized) ? normalized : "text";
}

function normalizeCitationLabel(value) {
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

function snippet(text, limit = 180) {
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

function normalizeNote(raw, index = 0) {
  const source = isRecord(raw) ? raw : {};
  const content = firstString([source.content, source.text, source.body, source.noteContent], "");
  const sourceUrl = firstString([source.sourceUrl, source.source_url, source.url, source.link], "");

  return {
    id: firstString([source.id, source.noteId, source.note_id], `note-${Date.now()}-${index}`),
    content: content || sourceUrl || "",
    sourceType: normalizeSourceType(source.sourceType || source.source_type || source.kind),
    sourceUrl,
    imagePath: firstString([source.imagePath, source.image_path, source.imageUrl, source.image_url], ""),
    summary: firstString([source.summary, source.aiSummary, source.excerpt, source.preview], snippet(content || sourceUrl, 160) || "(no summary)"),
    tags: normalizeTags(source.tags ?? source.tagList ?? source.keywords ?? source.labels),
    project: firstString([source.project, source.projectName, source.workspace], "general"),
    createdAt: normalizeDate(source.createdAt ?? source.created_at ?? source.timestamp ?? source.time),
    updatedAt: normalizeDate(source.updatedAt ?? source.updated_at ?? source.modifiedAt ?? source.modified_at),
  };
}

function normalizeCitation(raw, index = 0) {
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

function adaptHealthResponse(payload) {
  const source = isRecord(payload) ? payload : {};
  const rawConfigured =
    source.openaiConfigured ?? source.openai?.configured ?? source.openai?.enabled ?? source.features?.openai ?? source.features?.openaiConfigured;

  let openaiConfigured = null;
  if (typeof rawConfigured === "boolean") {
    openaiConfigured = rawConfigured;
  } else if (rawConfigured === "true" || rawConfigured === "false") {
    openaiConfigured = rawConfigured === "true";
  }

  return {
    ok: source.ok !== false,
    openaiConfigured,
  };
}

function adaptNotesResponse(payload) {
  const source = isRecord(payload) ? payload : {};
  const rawItems = pickPayloadArray(payload, ["items", "notes", "results", "data", "documents"]);
  const items = rawItems.map((entry, index) => normalizeCitation(entry, index));

  return {
    items,
    count: Math.max(0, Math.floor(toFiniteNumber(source.count ?? source.total ?? source.totalCount ?? source.meta?.count, items.length))),
  };
}

function adaptAnswerResponse(payload, kind = "chat") {
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

  return {
    text,
    citations,
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

function filterAndRankMockNotes({ query, project, limit = 40 }) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const normalizedProject = String(project || "").trim().toLowerCase();
  const queryTokens = tokenize(normalizedQuery);

  const scored = state.mockNotes
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

function buildLocalFallbackNote(payload) {
  const now = new Date().toISOString();
  const content = String(payload.content || "").trim() || String(payload.sourceUrl || "").trim() || "Image memory";
  const project = String(payload.project || "").trim() || "general";

  return {
    id: `local-${Date.now()}`,
    content,
    sourceType: normalizeSourceType(payload.sourceType),
    sourceUrl: String(payload.sourceUrl || "").trim(),
    imagePath: payload.sourceType === "image" ? String(payload.imageDataUrl || "") : "",
    summary: snippet(content, 160) || "Saved in local fallback mode",
    tags: guessTags(`${content} ${project}`),
    project,
    createdAt: now,
    updatedAt: now,
  };
}

function buildMockChatAnswer(question, project) {
  const citations = filterAndRankMockNotes({ query: question, project, limit: 6 });
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

function buildMockContext(task, project) {
  const citations = filterAndRankMockNotes({ query: task || "recent", project, limit: 8 });
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

function conciseTechnicalError(error, contextLabel) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const compact = raw.replace(/\s+/g, " ").trim();

  if (!compact) return contextLabel;
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(compact)) {
    return `${contextLabel}: network request failed`;
  }

  return `${contextLabel}: ${compact.slice(0, 140)}`;
}

function setStatus(text, tone = "neutral") {
  els.statusPill.textContent = text;
  if (tone === "warn") {
    els.statusPill.style.color = "#8d3d1f";
    els.statusPill.style.borderColor = "rgba(189, 91, 45, 0.35)";
  } else {
    els.statusPill.style.color = "";
    els.statusPill.style.borderColor = "";
  }
}

function setAdapterFallback(active, helperText = "") {
  state.fallbackActive = active;
  els.adapterBadge.classList.toggle("hidden", !active);
  els.adapterHelper.classList.toggle("hidden", !active);
  els.adapterHelper.textContent = active ? helperText : "";
}

function setCaptureHint(text, tone = "neutral") {
  els.captureHint.textContent = text;
  els.captureHint.classList.toggle("warn", tone === "warn");
}

function showToast(message, tone = "success") {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden", "show", "error");
  if (tone === "error") {
    els.toast.classList.add("error");
  }
  requestAnimationFrame(() => {
    els.toast.classList.add("show");
  });
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }
  state.toastTimer = window.setTimeout(() => {
    els.toast.classList.remove("show");
    window.setTimeout(() => {
      els.toast.classList.add("hidden");
    }, 180);
  }, 2200);
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text, maxChars = 180) {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1).trim()}...`;
}

function noteForItem(item) {
  const citation = normalizeCitation(item, 0);
  return citation.note;
}

function buildNoteTitle(note) {
  const content = normalizeText(note.content);
  if (!content && note.sourceType === "image") return "Image memory";
  if (!content) return "Untitled memory";

  const sentenceMatch = content.match(/^(.{10,130}?[.!?])(\s|$)/);
  const candidate = sentenceMatch ? sentenceMatch[1] : content;
  return truncateText(candidate, 100);
}

function buildContentPreview(note) {
  const content = normalizeText(note.content);
  if (content) return truncateText(content, 220);
  if (note.sourceUrl) return truncateText(note.sourceUrl, 220);
  if (note.sourceType === "image") return "Image capture with no text description.";
  return "No content preview available.";
}

function buildSummaryPreview(note, maxChars = 180) {
  const summary = normalizeText(note.summary);
  if (!summary || summary.toLowerCase() === "(no summary)") {
    return "No AI notes yet.";
  }
  return truncateText(summary, maxChars);
}

function formatScore(score) {
  if (typeof score !== "number") return "";
  return `score ${score.toFixed(3)}`;
}

function formatMeta(note, detailed = false) {
  const parts = [];
  if (note.sourceType) parts.push(note.sourceType);
  if (note.project) parts.push(`project: ${note.project}`);
  if (note.createdAt) {
    parts.push(detailed ? new Date(note.createdAt).toLocaleString() : new Date(note.createdAt).toLocaleDateString());
  }
  if (detailed && note.updatedAt && note.updatedAt !== note.createdAt) {
    parts.push(`updated ${new Date(note.updatedAt).toLocaleString()}`);
  }
  return parts.join(" • ");
}

function compactUrl(urlString, maxLen = 52) {
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

function formatSourceText(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return truncateText(`${parsed.hostname}${parsed.pathname}`, 90);
  } catch {
    return truncateText(url, 90);
  }
}

function renderTags(container, tags = []) {
  container.innerHTML = "";
  (tags || []).forEach((tag) => {
    const tagEl = document.createElement("span");
    tagEl.className = "tag";
    tagEl.textContent = tag;
    container.appendChild(tagEl);
  });
}

function renderAnswer(text, citations = [], usedCitationLabels = []) {
  const normalized = String(text || "").trim() || "No answer.";
  const knownLabels = new Set(citations.map((entry, index) => normalizeCitation(entry, index).label));
  const usedLabels = new Set(usedCitationLabels.map((label) => normalizeCitationLabel(label)).filter(Boolean));

  els.answerOutput.innerHTML = "";
  const tokenPattern = /\[(N?\d+)\]/gi;
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  for (const match of normalized.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      fragment.append(document.createTextNode(normalized.slice(cursor, index)));
    }

    const raw = String(match[1] || "").toUpperCase();
    const label = raw.startsWith("N") ? normalizeCitationLabel(raw) : normalizeCitationLabel(`N${raw}`);

    if (label && knownLabels.has(label)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "citation-chip";
      if (usedLabels.has(label)) {
        chip.classList.add("is-active");
      }
      chip.textContent = `[${label}]`;
      chip.addEventListener("click", () => focusCitationCard(label));
      fragment.append(chip);
    } else {
      fragment.append(document.createTextNode(match[0]));
    }

    cursor = index + match[0].length;
  }

  if (cursor < normalized.length) {
    fragment.append(document.createTextNode(normalized.slice(cursor)));
  }

  els.answerOutput.append(fragment);
}

function renderAnswerMeta({ mode = "", citations = [], usedCitationLabels = [] } = {}) {
  if (!mode) {
    els.answerMeta.textContent = "";
    return;
  }

  const usedCount = usedCitationLabels.length || citations.length;
  const citationCount = citations.length;
  const usedLabel = usedCount === 1 ? "source" : "sources";
  const citationLabel = citationCount === 1 ? "card" : "cards";
  els.answerMeta.textContent = `${mode} mode • ${usedCount} referenced ${usedLabel} • ${citationCount} citation ${citationLabel}`;
}

function focusCitationCard(label) {
  const target = els.citationList.querySelector(`.citation-item[data-label="${label}"]`);
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("flash-highlight");
  void target.offsetWidth;
  target.classList.add("flash-highlight");
}

function sortAndFilterItems(items) {
  const filtered = [...(Array.isArray(items) ? items : [])].filter((item) => {
    const note = noteForItem(item);
    const requiredType = els.typeFilterSelect.value;
    return !requiredType || note.sourceType === requiredType;
  });

  const getTime = (item) => {
    const note = noteForItem(item);
    const time = note.createdAt ? new Date(note.createdAt).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  };

  switch (els.sortSelect.value) {
    case "oldest":
      filtered.sort((a, b) => getTime(a) - getTime(b));
      break;
    case "score":
      filtered.sort((a, b) => {
        const scoreDelta = (normalizeCitation(b, 0).score || 0) - (normalizeCitation(a, 0).score || 0);
        if (scoreDelta !== 0) return scoreDelta;
        return getTime(b) - getTime(a);
      });
      break;
    case "newest":
    default:
      filtered.sort((a, b) => getTime(b) - getTime(a));
      break;
  }

  return filtered;
}

function renderNotes(items) {
  els.notesList.innerHTML = "";
  state.renderedItems = items;

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "note-content";
    empty.textContent = state.notes.length ? "No memories match these filters." : "No memories yet.";
    els.notesList.appendChild(empty);
    return;
  }

  const showScores = els.sortSelect.value === "score" || Boolean(els.searchInput.value.trim());

  items.forEach((entry, index) => {
    const citation = normalizeCitation(entry, index);
    const note = citation.note;
    const fragment = els.noteTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".stream-mini-card");
    card.dataset.noteIndex = String(index);

    fragment.querySelector(".mini-title").textContent = buildNoteTitle(note);
    fragment.querySelector(".mini-content").textContent = buildContentPreview(note);
    fragment.querySelector(".mini-summary").textContent = buildSummaryPreview(note);

    const scoreEl = fragment.querySelector(".mini-score");
    const scoreLabel = showScores ? formatScore(citation.score) : "";
    scoreEl.textContent = scoreLabel;
    scoreEl.classList.toggle("hidden", !scoreLabel);

    renderTags(fragment.querySelector(".note-tags"), note.tags || []);
    fragment.querySelector(".mini-meta").textContent = formatMeta(note);

    const image = fragment.querySelector(".mini-image");
    if (note.imagePath) {
      image.src = note.imagePath;
      image.classList.remove("hidden");
    } else {
      image.classList.add("hidden");
    }

    els.notesList.appendChild(fragment);
  });
}

function renderCitations(citations = [], usedCitationLabels = []) {
  els.citationList.innerHTML = "";
  if (!citations.length) {
    const empty = document.createElement("p");
    empty.className = "note-content";
    empty.textContent = "No citations.";
    els.citationList.appendChild(empty);
    return;
  }

  const usedLabels = new Set(usedCitationLabels.map((label) => normalizeCitationLabel(label)).filter(Boolean));

  citations.forEach((entry, index) => {
    const citation = normalizeCitation(entry, index);
    const note = citation.note;

    const card = document.createElement("article");
    card.className = "citation-item";
    card.dataset.label = citation.label;
    if (usedLabels.has(citation.label)) {
      card.classList.add("is-referenced");
    }

    const top = document.createElement("div");
    top.className = "note-top";

    const project = document.createElement("span");
    project.className = "note-project";
    project.textContent = `${citation.label} • ${note.project || "general"}`;

    const score = document.createElement("span");
    score.className = "note-score";
    score.textContent = formatScore(citation.score);

    top.append(project, score);
    card.append(top);

    if (note.summary) {
      const summary = document.createElement("p");
      summary.className = "note-summary";
      summary.textContent = note.summary;
      card.append(summary);
    }

    if (note.content) {
      const content = document.createElement("p");
      content.className = "note-content";
      content.textContent = note.content;
      card.append(content);
    }

    const meta = [];
    if (note.sourceType) meta.push(note.sourceType);
    if (note.createdAt) meta.push(new Date(note.createdAt).toLocaleString());
    if (meta.length) {
      const metaEl = document.createElement("p");
      metaEl.className = "note-meta";
      metaEl.textContent = meta.join(" • ");
      card.append(metaEl);
    }

    if (note.sourceUrl) {
      const sourceLink = document.createElement("a");
      sourceLink.href = note.sourceUrl;
      sourceLink.target = "_blank";
      sourceLink.rel = "noreferrer noopener";
      sourceLink.className = "note-meta";
      sourceLink.textContent = compactUrl(note.sourceUrl, 52);
      card.append(sourceLink);
    }

    if (note.imagePath) {
      const img = document.createElement("img");
      img.src = note.imagePath;
      img.alt = "citation image";
      img.className = "image-preview";
      card.append(img);
    }

    els.citationList.appendChild(card);
  });
}

function setStreamControlsOpen(isOpen) {
  state.streamControlsOpen = Boolean(isOpen);
  els.streamControls.classList.toggle("hidden", !state.streamControlsOpen);
  els.streamControlsBtn.textContent = state.streamControlsOpen ? "Hide Controls" : "Filters & Sort";
}

function openMemoryModal(item) {
  if (!item) return;
  state.activeModalItem = item;
  const citation = normalizeCitation(item, 0);
  const note = citation.note;

  els.memoryModalTitle.textContent = buildNoteTitle(note);
  els.memoryModalContent.textContent = note.content || "No raw content saved for this memory.";
  els.memoryModalSummary.textContent = buildSummaryPreview(note, 520);
  renderTags(els.memoryModalTags, note.tags || []);
  els.memoryModalMeta.textContent = formatMeta(note, true);

  if (note.imagePath) {
    els.memoryModalImage.src = note.imagePath;
    els.memoryModalImage.classList.remove("hidden");
  } else {
    els.memoryModalImage.classList.add("hidden");
  }

  if (note.sourceUrl) {
    els.memoryModalSource.href = note.sourceUrl;
    els.memoryModalSource.textContent = `Source: ${formatSourceText(note.sourceUrl)}`;
    els.memoryModalSource.classList.remove("hidden");
  } else {
    els.memoryModalSource.classList.add("hidden");
  }

  els.memoryModal.classList.remove("hidden");
  els.memoryModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  els.memoryModalClose.focus();
}

function closeMemoryModal() {
  if (els.memoryModal.classList.contains("hidden")) return;
  state.activeModalItem = null;
  els.memoryModal.classList.add("hidden");
  els.memoryModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function openNoteFromCardTarget(target) {
  if (!(target instanceof Element)) return;
  const card = target.closest(".stream-mini-card");
  if (!card) return;
  const index = Number(card.dataset.noteIndex);
  if (!Number.isFinite(index)) return;
  openMemoryModal(state.renderedItems[index]);
}

function renderStream() {
  renderNotes(sortAndFilterItems(state.notes));
}

async function refreshNotes() {
  const query = els.searchInput.value.trim();
  const project = els.projectFilterInput.value.trim();
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (project) params.set("project", project);
  params.set("limit", "80");

  try {
    const payload = await jsonFetch(`${API_ENDPOINTS.notes}?${params.toString()}`);
    const data = adaptNotesResponse(payload);
    state.notes = data.items;
    renderStream();
    setAdapterFallback(false);
  } catch (error) {
    const message = conciseTechnicalError(error, "Notes endpoint unavailable");
    setAdapterFallback(true, `${message}. Showing local demo data.`);
    state.notes = filterAndRankMockNotes({ query, project, limit: 80 });
    renderStream();
    adapterLog("notes_fallback", message);
  }
}

async function initStatus() {
  try {
    const healthPayload = await jsonFetch(API_ENDPOINTS.health);
    const health = adaptHealthResponse(healthPayload);

    if (health.openaiConfigured === true) {
      setStatus("OpenAI connected");
    } else if (health.openaiConfigured === false) {
      setStatus("OpenAI key missing • heuristic mode", "warn");
    } else {
      setStatus("Server connected • model status unknown", "warn");
    }
  } catch {
    setStatus("Server status unavailable", "warn");
  }
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clearImageSelection() {
  state.imageDataUrl = null;
  state.imageName = "";
  els.imageInput.value = "";
  els.imageName.textContent = "";
  els.imageName.classList.add("hidden");
  els.imagePreview.src = "";
  els.imagePreview.classList.add("hidden");
  els.removeImageBtn.classList.add("hidden");
}

function clearCaptureForm() {
  els.contentInput.value = "";
  clearImageSelection();
}

async function setImageFromFile(file) {
  if (!file) return;
  if (!String(file.type || "").startsWith("image/")) {
    setCaptureHint("That file is not an image yet. Try PNG, JPG, WEBP, or GIF.", "warn");
    return;
  }

  state.imageDataUrl = await fileToDataUrl(file);
  state.imageName = file.name || "image";
  els.imagePreview.src = state.imageDataUrl;
  els.imagePreview.classList.remove("hidden");
  els.imageName.textContent = state.imageName;
  els.imageName.classList.remove("hidden");
  els.removeImageBtn.classList.remove("hidden");
  setCaptureHint("Image attached. Add optional text, then save.");
}

function extractStandaloneUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s]+/i);
  if (!match) return "";
  try {
    return new URL(match[0]).toString();
  } catch {
    return "";
  }
}

function inferCaptureType(content, imageDataUrl) {
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

els.imagePickerBtn.addEventListener("click", () => {
  els.imageInput.click();
});

els.removeImageBtn.addEventListener("click", () => {
  clearImageSelection();
  setCaptureHint("Image removed. Paste text, a URL, or drop another image.");
});

els.imageInput.addEventListener("change", async () => {
  const file = els.imageInput.files?.[0];
  if (!file) return;
  try {
    await setImageFromFile(file);
  } catch (error) {
    setCaptureHint(conciseTechnicalError(error, "Image read failed"), "warn");
    showToast("Image read failed", "error");
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  els.imageDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    els.imageDropZone.classList.add("is-dragging");
  });
});

["dragleave", "dragend", "drop"].forEach((eventName) => {
  els.imageDropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    els.imageDropZone.classList.remove("is-dragging");
  });
});

els.imageDropZone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    await setImageFromFile(file);
  } catch (error) {
    setCaptureHint(conciseTechnicalError(error, "Image read failed"), "warn");
    showToast("Image read failed", "error");
  }
});

els.imageDropZone.addEventListener("click", (event) => {
  if (event.target.closest("button")) return;
  els.imageInput.click();
});

els.imageDropZone.addEventListener("keydown", (event) => {
  if (event.target !== els.imageDropZone) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  els.imageInput.click();
});

els.captureForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.loading) return;

  const content = els.contentInput.value.trim();
  const project = els.projectInput.value.trim();
  if (!content && !state.imageDataUrl) {
    setCaptureHint("Add a note, paste a link, or drop an image first.", "warn");
    showToast("Add a note, link, or image first");
    els.contentInput.focus();
    return;
  }

  const inferred = inferCaptureType(content, state.imageDataUrl);
  const payload = {
    sourceType: inferred.sourceType,
    content,
    sourceUrl: inferred.sourceUrl,
    project,
    imageDataUrl: state.imageDataUrl,
  };

  state.loading = true;
  els.saveBtn.disabled = true;
  els.saveBtn.textContent = "Saving...";

  try {
    await jsonFetch(API_ENDPOINTS.notes, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    clearCaptureForm();
    setCaptureHint("Saved. Add another memory whenever you are ready.");
    showToast("Memory saved");
    await refreshNotes();
  } catch (error) {
    const message = conciseTechnicalError(error, "Save endpoint unavailable");
    const validationLike = /missing content|invalid image|invalid json|request failed \(4\d\d\)/i.test(message);

    if (validationLike) {
      setCaptureHint(message, "warn");
      showToast("Save failed", "error");
    } else {
      state.mockNotes.unshift(buildLocalFallbackNote(payload));
      clearCaptureForm();
      setCaptureHint("Saved locally. Backend write is unavailable right now.", "warn");
      showToast("Saved locally");
      setAdapterFallback(true, `${message}. Saved locally for demo.`);
      state.notes = filterAndRankMockNotes({
        query: els.searchInput.value.trim(),
        project: els.projectFilterInput.value.trim(),
        limit: 80,
      });
      renderStream();
      adapterLog("save_fallback", message);
    }
  } finally {
    state.loading = false;
    els.saveBtn.disabled = false;
    els.saveBtn.textContent = "Save Memory";
  }
});

els.streamControlsBtn.addEventListener("click", () => {
  setStreamControlsOpen(!state.streamControlsOpen);
});

els.refreshBtn.addEventListener("click", async () => {
  await refreshNotes();
});

els.searchBtn.addEventListener("click", async () => {
  await refreshNotes();
});

els.sortSelect.addEventListener("change", () => {
  renderStream();
});

els.typeFilterSelect.addEventListener("change", () => {
  renderStream();
});

els.searchInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await refreshNotes();
});

els.projectFilterInput.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await refreshNotes();
});

els.notesList.addEventListener("click", (event) => {
  openNoteFromCardTarget(event.target);
});

els.notesList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openNoteFromCardTarget(event.target);
});

els.memoryModalClose.addEventListener("click", () => {
  closeMemoryModal();
});

els.memoryModalBackdrop.addEventListener("click", () => {
  closeMemoryModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMemoryModal();
  }
});

els.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = els.questionInput.value.trim();
  if (!question) return;

  renderAnswer("Thinking...");
  renderAnswerMeta({ mode: "loading", citations: [], usedCitationLabels: [] });

  try {
    const payload = await jsonFetch(API_ENDPOINTS.chat, {
      method: "POST",
      body: JSON.stringify({
        question,
        project: els.projectFilterInput.value.trim(),
      }),
    });

    const data = adaptAnswerResponse(payload, "chat");
    renderCitations(data.citations, data.usedCitationLabels);
    renderAnswer(data.text || "No answer", data.citations, data.usedCitationLabels);
    renderAnswerMeta({ mode: data.mode || "unknown", citations: data.citations, usedCitationLabels: data.usedCitationLabels });
  } catch (error) {
    const message = conciseTechnicalError(error, "Chat endpoint unavailable");
    const fallback = buildMockChatAnswer(question, els.projectFilterInput.value.trim());
    renderCitations(fallback.citations, fallback.usedCitationLabels);
    renderAnswer(`${fallback.text}\n\n(${message})`, fallback.citations, fallback.usedCitationLabels);
    renderAnswerMeta({ mode: "fallback", citations: fallback.citations, usedCitationLabels: fallback.usedCitationLabels });
    setAdapterFallback(true, `${message}. Using local answer fallback.`);
    adapterLog("chat_fallback", message);
  }
});

els.contextBtn.addEventListener("click", async () => {
  const task = prompt("Task for context brief", "Summarize current project decisions and next steps");
  if (!task) return;

  renderAnswer("Generating context brief...");
  renderAnswerMeta({ mode: "loading", citations: [], usedCitationLabels: [] });

  try {
    const payload = await jsonFetch(API_ENDPOINTS.context, {
      method: "POST",
      body: JSON.stringify({
        task,
        project: els.projectFilterInput.value.trim(),
      }),
    });

    const data = adaptAnswerResponse(payload, "context");
    renderCitations(data.citations, data.usedCitationLabels);
    renderAnswer(data.text || "No context generated", data.citations, data.usedCitationLabels);
    renderAnswerMeta({ mode: data.mode || "unknown", citations: data.citations, usedCitationLabels: data.usedCitationLabels });
  } catch (error) {
    const message = conciseTechnicalError(error, "Context endpoint unavailable");
    const fallback = buildMockContext(task, els.projectFilterInput.value.trim());
    renderCitations(fallback.citations, fallback.usedCitationLabels);
    renderAnswer(`${fallback.text}\n\n(${message})`, fallback.citations, fallback.usedCitationLabels);
    renderAnswerMeta({ mode: "fallback", citations: fallback.citations, usedCitationLabels: fallback.usedCitationLabels });
    setAdapterFallback(true, `${message}. Using local context fallback.`);
    adapterLog("context_fallback", message);
  }
});

(async function init() {
  setStreamControlsOpen(false);
  setCaptureHint("Tip: keep it minimal. Paste text, a URL, or an image and we infer the rest.");
  clearImageSelection();
  renderAnswer("No question yet.");
  renderAnswerMeta({ mode: "", citations: [], usedCitationLabels: [] });
  await initStatus();
  await refreshNotes();
})();
