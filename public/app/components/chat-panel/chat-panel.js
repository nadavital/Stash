import { buildNoteTitle, normalizeCitation, normalizeCitationLabel } from "../../services/mappers.js";
import { renderMarkdownInto } from "../../services/markdown.js";
import { renderIcon } from "../../services/icons.js";
import { createFollowUpCardsController } from "./follow-up-cards.js";
import { createChatSourcePanels } from "./source-panels.js";

const MAX_MESSAGES = 100;
const MAX_RECENT_HISTORY = MAX_MESSAGES;
const MAX_DEBUG_TRACES = 20;
const MAX_SOURCE_LIST_ITEMS = 8;
const MAX_INLINE_SOURCE_CHIPS = 3;
const MAX_PENDING_FOLLOW_UPS = 8;
const TASK_PROPOSAL_ACTIONS = ["Create it", "Cancel"];

export function renderChatPanelHTML() {
  const attachIcon = renderIcon("attach", { size: 15 });
  const sendIcon = renderIcon("arrow-up", { size: 16 });
  const newChatIcon = renderIcon("square-pen", { size: 15, strokeWidth: 1.9 });
  const debugCopyIcon = renderIcon("copy", { size: 15, strokeWidth: 1.9 });
  const isLocalRuntime = typeof window !== "undefined"
    && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  return `
    <div id="chat-panel" class="chat-panel" aria-label="Chat with your notes">
      <div class="chat-panel-header">
        ${isLocalRuntime ? `
        <button
          id="chat-panel-debug-copy"
          class="chat-panel-header-btn"
          type="button"
          aria-label="Copy chat debug"
          title="Copy chat debug"
        >
          ${debugCopyIcon}
        </button>
        ` : ""}
        <button
          id="chat-panel-new-chat"
          class="chat-panel-header-btn"
          type="button"
          aria-label="New chat"
          title="New chat"
        >
          ${newChatIcon}
        </button>
      </div>
      <div id="chat-empty-state" class="chat-empty-state">
        <p class="chat-empty-heading">What would you like to do?</p>
        <div class="chat-empty-chips">
          <button class="chat-chip" data-prompt="save" type="button">Save a link</button>
          <button class="chat-chip" data-prompt="note" type="button">Create a note</button>
          <button class="chat-chip" data-prompt="folder" type="button">New folder</button>
          <button class="chat-chip" data-prompt="search" type="button">Search my notes</button>
        </div>
      </div>
      <div id="chat-panel-messages" class="chat-panel-messages"></div>
      <div class="chat-panel-citations hidden" id="chat-panel-citations"></div>
      <div class="chat-panel-citations hidden" id="chat-panel-web-sources"></div>
      <div id="chat-context-header" class="chat-context-chip hidden"></div>
      <form id="chat-panel-form" class="chat-panel-form">
        <div id="chat-panel-input-wrap" class="chat-panel-input-wrap">
          <button id="chat-panel-attach-btn" class="chat-panel-attach" type="button" aria-label="Attach file">
            ${attachIcon}
          </button>
          <input id="chat-panel-file-input" type="file" class="hidden" />
          <textarea id="chat-panel-input" class="chat-panel-input" rows="2" placeholder="Save a link, create a note, ask anything..." autocomplete="off"></textarea>
          <button id="chat-panel-send" class="chat-panel-send" type="submit" aria-label="Send">
            ${sendIcon}
          </button>
        </div>
        <div id="chat-panel-pending" class="chat-panel-pending hidden" role="status" aria-live="polite"></div>
        <div id="chat-panel-attachment" class="chat-panel-attachment hidden">
          <span id="chat-panel-attachment-name" class="chat-panel-attachment-name"></span>
          <button id="chat-panel-attachment-clear" class="chat-panel-attachment-clear" type="button" aria-label="Remove attachment">&times;</button>
        </div>
      </form>
    </div>
  `;
}

export function queryChatPanelEls(root) {
  return {
    chatPanel: root.querySelector("#chat-panel"),
    chatPanelDebugCopy: root.querySelector("#chat-panel-debug-copy"),
    chatPanelNewChat: root.querySelector("#chat-panel-new-chat"),
    chatContextHeader: root.querySelector("#chat-context-header"),
    chatEmptyState: root.querySelector("#chat-empty-state"),
    chatPanelMessages: root.querySelector("#chat-panel-messages"),
    chatPanelCitations: root.querySelector("#chat-panel-citations"),
    chatPanelWebSources: root.querySelector("#chat-panel-web-sources"),
    chatPanelForm: root.querySelector("#chat-panel-form"),
    chatPanelInputWrap: root.querySelector("#chat-panel-input-wrap"),
    chatPanelPending: root.querySelector("#chat-panel-pending"),
    chatPanelInput: root.querySelector("#chat-panel-input"),
    chatPanelSend: root.querySelector("#chat-panel-send"),
    chatPanelAttachBtn: root.querySelector("#chat-panel-attach-btn"),
    chatPanelFileInput: root.querySelector("#chat-panel-file-input"),
    chatPanelAttachment: root.querySelector("#chat-panel-attachment"),
    chatPanelAttachmentName: root.querySelector("#chat-panel-attachment-name"),
    chatPanelAttachmentClear: root.querySelector("#chat-panel-attachment-clear"),
    chatChips: root.querySelectorAll(".chat-chip"),
  };
}

export function initChatPanel(
  els,
  {
    apiClient,
    toast,
    onOpenCitation,
    onWorkspaceAction,
    onAuthExpired,
    store,
  } = {}
) {
  const handlers = [];
  let isAsking = false;
  let nextProjectHint = "";
  const isLocalRuntime = typeof window !== "undefined"
    && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const debugTraces = [];
  let pendingAttachment = {
    fileDataUrl: null,
    fileName: "",
    fileMimeType: "",
    isImage: false,
  };
  const localTimezone = resolveLocalTimezone();

  function resolveLocalTimezone() {
    try {
      const timezone = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone;
      return String(timezone || "").trim();
    } catch {
      return "";
    }
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.readAsDataURL(file);
    });
  }

  function refreshAttachmentUI() {
    const hasAttachment = Boolean(pendingAttachment.fileDataUrl);
    els.chatPanelAttachment?.classList.toggle("hidden", !hasAttachment);
    if (els.chatPanelAttachmentName) {
      els.chatPanelAttachmentName.textContent = hasAttachment ? pendingAttachment.fileName || "Attachment" : "";
    }
  }

  function clearAttachment() {
    pendingAttachment = {
      fileDataUrl: null,
      fileName: "",
      fileMimeType: "",
      isImage: false,
    };
    if (els.chatPanelFileInput) {
      els.chatPanelFileInput.value = "";
    }
    refreshAttachmentUI();
  }

  function clearDraftInput() {
    if (els.chatPanelInput) {
      els.chatPanelInput.value = "";
      els.chatPanelInput.style.height = "";
    }
    clearAttachment();
  }

  function collectRecentConversationMessages(limit = MAX_RECENT_HISTORY) {
    const state = store ? store.getState() : {};
    const messages = Array.isArray(state.chatMessages) ? state.chatMessages : [];
    return messages
      .slice(-Math.max(limit * 2, limit))
      .map((entry) => ({
        role: String(entry?.role || "").trim().toLowerCase(),
        text: String(entry?.text || "").trim(),
      }))
      .filter((entry) => (entry.role === "user" || entry.role === "assistant") && entry.text)
      .slice(-limit)
      .map((entry) => ({
        role: entry.role,
        text: entry.text.slice(0, 1600),
      }));
  }

  function toDebugSafePayload(payload = {}) {
    const next = { ...(payload || {}) };
    if (next.imageDataUrl) {
      const value = String(next.imageDataUrl || "");
      next.imageDataUrl = `<redacted data url (${value.length} chars)>`;
    }
    if (next.fileDataUrl) {
      const value = String(next.fileDataUrl || "");
      next.fileDataUrl = `<redacted data url (${value.length} chars)>`;
    }
    return next;
  }

  function serializeErrorForDebug(error = null) {
    const message = String(error?.message || error || "").trim();
    const name = String(error?.name || "").trim();
    const status = Number(error?.status || error?.payload?.status || 0);
    const payload = error?.payload && typeof error.payload === "object" ? { ...error.payload } : null;
    const stack = typeof error?.stack === "string"
      ? error.stack.split("\n").slice(0, 5).join("\n")
      : "";
    if (!message && !name && !status && !payload && !stack) return null;
    return {
      ...(name ? { name } : {}),
      ...(message ? { message } : {}),
      ...(status ? { status } : {}),
      ...(payload ? { payload } : {}),
      ...(stack ? { stack } : {}),
      at: new Date().toISOString(),
    };
  }

  function extractUserFacingErrorText(text = "") {
    const value = String(text || "").trim();
    if (!value) return "";
    const normalized = value.toLowerCase();
    if (
      normalized.startsWith("i hit a temporary issue") ||
      normalized.startsWith("failed to get answer") ||
      normalized.startsWith("session expired")
    ) {
      return value;
    }
    return "";
  }

  function toToolErrorFallbackMessage(errorText = "") {
    const normalized = String(errorText || "").trim();
    if (!normalized) return "";
    if (/revision conflict/i.test(normalized)) {
      return "I couldn't save that update because the item changed while I was editing it. Please retry.";
    }
    return "I hit a temporary issue while completing that. Please retry your last message.";
  }

  function buildLastDebugErrorSummary(traces = []) {
    if (!Array.isArray(traces) || traces.length === 0) return null;
    for (let index = traces.length - 1; index >= 0; index -= 1) {
      const trace = traces[index];
      if (!trace || typeof trace !== "object") continue;
      const events = Array.isArray(trace.events) ? trace.events : [];
      const debugErrorEvent = [...events]
        .reverse()
        .find((entry) => entry?.type === "debug_error" && entry?.error);
      const toolErrorEvent = [...events]
        .reverse()
        .find((entry) => entry?.type === "tool_result" && entry?.ok === false && entry?.error);
      const userFacingMessage = String(
        trace.userFacingError || extractUserFacingErrorText(trace.assistantText || "")
      ).trim();
      const message = String(
        debugErrorEvent?.error?.message
          || trace.error
          || toolErrorEvent?.error
          || userFacingMessage
      ).trim();
      if (!message && !userFacingMessage) continue;
      return {
        traceId: String(trace.id || "").trim(),
        status: String(trace.status || "").trim() || "unknown",
        finishedAt: trace.finishedAt || trace.startedAt || "",
        message: message || userFacingMessage,
        ...(userFacingMessage ? { userFacingMessage } : {}),
        ...(debugErrorEvent?.error ? { detail: debugErrorEvent.error } : trace.errorDetail ? { detail: trace.errorDetail } : {}),
      };
    }
    return null;
  }

  function pushDebugTrace(entry = null) {
    if (!isLocalRuntime || !entry || typeof entry !== "object") return;
    debugTraces.push(entry);
    if (debugTraces.length > MAX_DEBUG_TRACES) {
      debugTraces.splice(0, debugTraces.length - MAX_DEBUG_TRACES);
    }
  }

  async function copyDebugDump() {
    if (!isLocalRuntime) return;
    const state = store ? store.getState() : {};
    const payload = {
      generatedAt: new Date().toISOString(),
      location: typeof window !== "undefined" ? window.location.href : "",
      chatContext: state.chatContext || null,
      messages: Array.isArray(state.chatMessages)
        ? state.chatMessages.map((entry) => ({
            role: String(entry?.role || "").trim(),
            text: String(entry?.text || ""),
          }))
        : [],
      citations: Array.isArray(state.chatCitations) ? state.chatCitations : [],
      pendingFollowUps: Array.isArray(state.chatPendingFollowUps) ? state.chatPendingFollowUps : [],
      traces: debugTraces,
      lastError: buildLastDebugErrorSummary(debugTraces),
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    if (typeof toast === "function") {
      toast("Chat debug copied");
    }
  }

  function setPendingState(pending, _statusText = "") {
    const isPending = Boolean(pending);
    if (els.chatPanel) {
      els.chatPanel.setAttribute("aria-busy", isPending ? "true" : "false");
    }
    if (els.chatPanelInputWrap) {
      els.chatPanelInputWrap.classList.toggle("is-pending", isPending);
    }
    const interactiveControls = [
      els.chatPanelInput,
      els.chatPanelSend,
      els.chatPanelAttachBtn,
      els.chatPanelAttachmentClear,
      els.chatPanelFileInput,
      els.chatPanelNewChat,
    ];
    interactiveControls.forEach((control) => {
      if (!control) return;
      control.disabled = isPending;
    });
    if (els.chatChips) {
      els.chatChips.forEach((chip) => {
        chip.disabled = isPending;
      });
    }
    if (els.chatPanelMessages) {
      els.chatPanelMessages
        .querySelectorAll(
          ".chat-question-option, .chat-question-input, .chat-question-submit, .chat-task-proposal-action"
        )
        .forEach((control) => {
          if (
            control instanceof HTMLButtonElement ||
            control instanceof HTMLInputElement ||
            control instanceof HTMLTextAreaElement
          ) {
            control.disabled = isPending;
          }
        });
    }
    if (!els.chatPanelPending) return;
    // Keep progress indicators inside chat messages only.
    els.chatPanelPending.textContent = "";
    els.chatPanelPending.classList.add("hidden");
  }

  function stripInternalReferenceTokens(value = "") {
    return String(value || "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1")
      .replace(/\b(note|item)\s+N\d+\b/gi, "$1")
      .replace(/\(\s*N\d+\s*\)/gi, "")
      .replace(/\bN\d+\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const followUpCards = createFollowUpCardsController({
    apiClient,
    toast,
    onWorkspaceAction,
    onAuthExpired,
    askQuestion: (value) => askQuestion(value),
    isAsking: () => isAsking,
    getPendingFollowUps: () => getPendingFollowUps(),
    setPendingFollowUps: (entries) => setPendingFollowUps(entries),
    stripInternalReferenceTokens,
    taskProposalActions: TASK_PROPOSAL_ACTIONS,
  });

  const sourcePanels = createChatSourcePanels({
    chatPanelCitationsEl: els.chatPanelCitations,
    chatPanelWebSourcesEl: els.chatPanelWebSources,
    onOpenCitation,
    buildNoteTitle,
    normalizeCitation,
    normalizeCitationLabel,
    renderIcon,
    maxSourceListItems: MAX_SOURCE_LIST_ITEMS,
    maxInlineSourceChips: MAX_INLINE_SOURCE_CHIPS,
  });

  function normalizeAskUserQuestionPayload(payload) {
    return followUpCards.normalizeAskUserQuestionPayload(payload);
  }

  function normalizeTaskProposalPayload(payload) {
    return followUpCards.normalizeTaskProposalPayload(payload);
  }

  function buildTaskProposalContextText(proposal = null) {
    return followUpCards.buildTaskProposalContextText(proposal);
  }

  function renderTaskProposalPrompt(msgEl, payload = null) {
    followUpCards.renderTaskProposalPrompt(msgEl, payload);
  }

  function renderAskUserQuestionPrompt(msgEl, payload = null, { assistantText = "" } = {}) {
    followUpCards.renderAskUserQuestionPrompt(msgEl, payload, { assistantText });
  }

  function compactLatestFollowUp() {
    if (!els.chatPanelMessages) return;
    followUpCards.compactLatestFollowUp(els.chatPanelMessages);
  }

  function updateContextHeader() {
    if (!els.chatContextHeader || !store) return;
    const ctx = store.getState().chatContext || { type: "home" };
    let label = "";
    if (ctx.type === "item" && ctx.itemTitle) {
      label = ctx.project
        ? `${ctx.itemTitle} \u00B7 in ${ctx.project}`
        : `Viewing: ${ctx.itemTitle}`;
    } else if (ctx.type === "folder" && ctx.folderId) {
      label = `In: ${ctx.folderId}`;
    } else if (ctx.type === "task" && (ctx.taskTitle || ctx.taskId)) {
      label = ctx.taskTitle
        ? `Automation: ${ctx.taskTitle}`
        : `Automation: ${ctx.taskId}`;
    }

    // Keep chat visually seamless across navigation; do not inject context divider rows.
    if (label) {
      els.chatContextHeader.textContent = label;
      els.chatContextHeader.classList.remove("hidden");
    } else {
      els.chatContextHeader.classList.add("hidden");
      els.chatContextHeader.textContent = "";
    }
  }

  if (store) {
    const unsubContext = store.subscribe(() => updateContextHeader());
    handlers.push(unsubContext);
    updateContextHeader();
  }

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  function formatAssistantDisplayText(rawText = "") {
    let text = stripInternalReferenceTokens(rawText);
    // Remove parenthesized markdown links like: ([example.com](https://example.com))
    text = text.replace(/\(\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*\)/gi, "");
    // Replace remaining markdown links with label-only text.
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1");
    // Remove citation marker noise in user-facing copy.
    text = text
      .replace(/\[N\d+\]/gi, "")
      .replace(/\(\s*N\d+\s*\)/gi, "")
      .replace(/\b(note|item)\s+N\d+\b/gi, "$1")
      .replace(/\bN\d+\b(?=\s*(?:,|\.|;|:|$))/gi, "")
      .replace(/\bnote\s+\**\s*\[?N\d+\]?\**\b/gi, "this item");
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }

  function setMessageBodyText(msgEl, role, text) {
    if (!msgEl) return;
    let body = msgEl.querySelector(".chat-msg-body");
    if (!body) {
      body = document.createElement("div");
      body.className = "chat-msg-body";
      msgEl.prepend(body);
    }
    const rawText = String(text || "");
    msgEl.dataset.rawText = rawText;

    if (role === "assistant") {
      renderMarkdownInto(body, formatAssistantDisplayText(rawText));
      return;
    }

    body.classList.remove("markdown-body");
    body.textContent = rawText;
  }

  function appendAssistantToken(msgEl, token) {
    const current = String(msgEl?.dataset.rawText || "");
    setMessageBodyText(msgEl, "assistant", current + String(token || ""));
  }

  function getMessageRawText(msgEl) {
    return String(msgEl?.dataset.rawText || "");
  }

  function createMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizePendingFollowUpEntry(entry = null) {
    if (!entry || typeof entry !== "object") return null;
    const messageId = String(entry.messageId || "").trim();
    if (!messageId) return null;
    const payloadSource = entry.payload && typeof entry.payload === "object" ? entry.payload : entry;
    const kind = String(entry.kind || "").trim().toLowerCase();
    const proposalPayload = normalizeTaskProposalPayload(payloadSource);
    if (kind === "task_proposal") {
      if (!proposalPayload) return null;
      return { messageId, kind: "task_proposal", payload: proposalPayload };
    }
    const questionPayload = normalizeAskUserQuestionPayload(payloadSource);
    if (questionPayload) {
      return { messageId, kind: "question", payload: questionPayload };
    }
    if (proposalPayload) {
      return { messageId, kind: "task_proposal", payload: proposalPayload };
    }
    return null;
  }

  function getPendingFollowUps() {
    if (!store) return [];
    const state = store.getState();
    const rawEntries = Array.isArray(state.chatPendingFollowUps) ? state.chatPendingFollowUps : [];
    return rawEntries
      .map((entry) => normalizePendingFollowUpEntry(entry))
      .filter(Boolean)
      .slice(-MAX_PENDING_FOLLOW_UPS);
  }

  function setPendingFollowUps(entries = []) {
    if (!store) return;
    const normalizedEntries = Array.isArray(entries)
      ? entries.map((entry) => normalizePendingFollowUpEntry(entry)).filter(Boolean).slice(-MAX_PENDING_FOLLOW_UPS)
      : [];
    store.setState({ chatPendingFollowUps: normalizedEntries });
  }

  function upsertPendingFollowUpsForMessage(messageId = "", payloads = []) {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId) return;
    const existing = getPendingFollowUps().filter((entry) => entry.messageId !== normalizedMessageId);
    const normalizedPayloads = Array.isArray(payloads)
      ? payloads
          .map((entry) => {
            if (entry && typeof entry === "object" && !Array.isArray(entry) && entry.messageId) {
              return normalizePendingFollowUpEntry(entry);
            }
            return normalizePendingFollowUpEntry({
              messageId: normalizedMessageId,
              ...(entry && typeof entry === "object" && !Array.isArray(entry)
                ? entry
                : { payload: entry }),
            });
          })
          .filter(Boolean)
      : [];
    const nextEntries = [...existing, ...normalizedPayloads];
    setPendingFollowUps(nextEntries);
  }

  function popLatestPendingFollowUp() {
    const entries = getPendingFollowUps();
    if (!entries.length) return null;
    const latest = entries[entries.length - 1];
    setPendingFollowUps(entries.slice(0, -1));
    return latest;
  }

  function getPendingFollowUpContextText(entry = null) {
    if (!entry || typeof entry !== "object") return "";
    if (entry.kind === "task_proposal") {
      return buildTaskProposalContextText(entry.payload);
    }
    return String(entry?.payload?.question || "").trim();
  }

  function pushToStore(role, text, idOverride = "") {
    if (!store) return "";
    const state = store.getState();
    const messages = [...(state.chatMessages || [])];
    const id = String(idOverride || createMessageId()).trim() || createMessageId();
    messages.push({ role, text, id });
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }
    store.setState({ chatMessages: messages });
    return id;
  }

  function updateLastAssistantInStore(text) {
    if (!store) return;
    const state = store.getState();
    const messages = [...(state.chatMessages || [])];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        messages[i] = { ...messages[i], text };
        break;
      }
    }
    store.setState({ chatMessages: messages });
  }

  function saveCitationsToStore(citations) {
    if (!store) return;
    store.setState({ chatCitations: citations || [] });
  }

  function addMessage(role, text, messageId = "") {
    if (!els.chatPanelMessages) return;
    if (els.chatEmptyState) els.chatEmptyState.classList.add("hidden");
    const msg = document.createElement("div");
    msg.className = `chat-msg chat-msg--${role}`;
    const normalizedMessageId = String(messageId || "").trim();
    if (normalizedMessageId) {
      msg.dataset.messageId = normalizedMessageId;
    }
    setMessageBodyText(msg, role, text);
    els.chatPanelMessages.appendChild(msg);
    els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;
    return msg;
  }

  function rebuildFromStore() {
    if (!store || !els.chatPanelMessages) return;
    const state = store.getState();
    const messages = state.chatMessages || [];
    if (!messages.length) return;

    if (els.chatEmptyState) els.chatEmptyState.classList.add("hidden");
    els.chatPanelMessages.innerHTML = "";
    const assistantEls = [];
    const assistantById = new Map();
    messages.forEach((msg) => {
      const el = document.createElement("div");
      el.className = `chat-msg chat-msg--${msg.role}`;
      const messageId = String(msg?.id || "").trim();
      if (messageId) {
        el.dataset.messageId = messageId;
      }
      setMessageBodyText(el, msg.role, msg.text);
      els.chatPanelMessages.appendChild(el);
      if (msg.role === "assistant") {
        assistantEls.push(el);
        if (messageId) assistantById.set(messageId, el);
      }
    });

    const pendingFollowUps = getPendingFollowUps();
    if (pendingFollowUps.length > 0 && assistantEls.length > 0) {
      const fallbackAssistant = assistantEls[assistantEls.length - 1] || null;
      pendingFollowUps.forEach((entry) => {
        const target = assistantById.get(entry.messageId) || fallbackAssistant;
        if (!target) return;
        if (entry.kind === "task_proposal") {
          renderTaskProposalPrompt(target, entry.payload);
          return;
        }
        renderAskUserQuestionPrompt(target, entry.payload, {
          assistantText: getMessageRawText(target),
        });
      });
    }
    els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;

    const citations = state.chatCitations || [];
    if (citations.length) {
      renderCitations(citations);
      renderWebSources([]);
    } else {
      renderCitations([]);
      renderWebSources([]);
    }
  }

  function renderCitations(citations = []) {
    sourcePanels.renderCitations(citations);
  }

  function renderWebSources(sources = []) {
    sourcePanels.renderWebSources(sources);
  }

  function renderInlineSourceChips(msgEl, payload = {}) {
    sourcePanels.renderInlineSourceChips(msgEl, payload);
  }

  function renderSourcesForAnswer({ assistantText = "", citations = [], usedCitationLabels = [], webSources = [], suppress = false } = {}) {
    if (suppress) {
      renderCitations([]);
      saveCitationsToStore([]);
      renderWebSources([]);
      return { citations: [], webSources: [] };
    }
    sourcePanels.resetSourceState();
    const visibleCitations = sourcePanels.resolveVisibleCitations(citations, assistantText, usedCitationLabels);
    renderCitations(visibleCitations);
    saveCitationsToStore(visibleCitations);
    const visibleWebSources = sourcePanels.resolveVisibleWebSources(webSources, assistantText);
    renderWebSources(visibleWebSources);
    return { citations: visibleCitations, webSources: visibleWebSources };
  }

  function clearConversation() {
    sourcePanels.resetSourceState();
    if (store) {
      store.setState({
        chatMessages: [],
        chatCitations: [],
        chatPendingFollowUps: [],
      });
    }
    if (els.chatPanelMessages) {
      els.chatPanelMessages.innerHTML = "";
    }
    renderCitations([]);
    renderWebSources([]);
    if (els.chatEmptyState) {
      els.chatEmptyState.classList.remove("hidden");
    }
    clearDraftInput();
  }

  function buildItemContextQuestion(note) {
    const title = buildNoteTitle(note);
    const lines = [
      "Use this saved item as the primary context.",
      `Item: ${title}`,
      note?.project ? `Folder: ${note.project}` : "",
      note?.sourceUrl ? `Source URL: ${note.sourceUrl}` : "",
      note?.summary ? `Current summary: ${note.summary}` : "",
      "Explain what it is, why it matters, and suggested next actions.",
    ];
    return lines.filter(Boolean).join("\n");
  }

  function buildScopePayload(ctx, contextNoteId = "", project = "") {
    const state = store ? store.getState() : {};
    const recentAccessedIds = Array.isArray(state?.accessedIds)
      ? state.accessedIds.slice(-20).map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const mergedWorkingSet = [...new Set([String(contextNoteId || "").trim(), ...recentAccessedIds])]
      .filter(Boolean)
      .slice(0, 20);

    if (ctx?.type === "item" && contextNoteId) {
      return {
        scope: "item",
        workingSetIds: mergedWorkingSet.length ? mergedWorkingSet : [contextNoteId],
      };
    }

    if (ctx?.type === "folder" && project) {
      return {
        scope: "project",
        workingSetIds: mergedWorkingSet,
      };
    }

    return {
      scope: "all",
      workingSetIds: mergedWorkingSet,
    };
  }

  async function askQuestion(rawQuestion, { projectHint = "", attachment = null } = {}) {
    if (isAsking) return false;
    const question = String(rawQuestion || "").trim();
    const hasAttachment = Boolean(attachment?.fileDataUrl);
    if (!question && !hasAttachment) return false;
    let answeredFollowUp = null;
    if (question) {
      compactLatestFollowUp();
      answeredFollowUp = popLatestPendingFollowUp();
    }

    // Read context from store
    const ctx = store ? (store.getState().chatContext || { type: "home" }) : { type: "home" };
    let project = String(projectHint || nextProjectHint || "").trim();
    let contextNoteId = "";
    let taskContext = null;

    if (ctx.type === "item" && ctx.itemId) {
      contextNoteId = ctx.itemId;
      if (!project && ctx.project) {
        project = ctx.project;
      }
    } else if (ctx.type === "folder" && ctx.folderId && !project) {
      project = ctx.folderId;
    } else if (ctx.type === "task" && ctx.taskId) {
      taskContext = {
        id: String(ctx.taskId || "").trim(),
        title: String(ctx.taskTitle || "").trim(),
        state: String(ctx.taskState || "").trim().toLowerCase(),
        scheduleType: String(ctx.scheduleType || "").trim().toLowerCase(),
        intervalMinutes: Number(ctx.intervalMinutes || 0) || 0,
      };
    }
    const scopePayload = buildScopePayload(ctx, contextNoteId, project);
    const recentMessages = collectRecentConversationMessages(MAX_RECENT_HISTORY);
    const answeredFollowUpContext = getPendingFollowUpContextText(answeredFollowUp);
    if (answeredFollowUpContext) {
      recentMessages.push({
        role: "assistant",
        text: answeredFollowUpContext,
      });
    }

    nextProjectHint = "";

    const userLine = hasAttachment
      ? `${question || "Save this attachment"}\n[attachment: ${attachment.fileName || "file"}]`
      : question;
    const userMessageId = createMessageId();
    addMessage("user", userLine, userMessageId);
    pushToStore("user", userLine, userMessageId);
    if (els.chatPanelInput) {
      els.chatPanelInput.value = "";
      els.chatPanelInput.style.height = "";
    }
    clearAttachment();
    if (els.chatPanelCitations) {
      els.chatPanelCitations.classList.add("hidden");
      els.chatPanelCitations.innerHTML = "";
    }
    renderWebSources([]);

    isAsking = true;
    setPendingState(true, "Generating response...");

    const typingEl = document.createElement("div");
    typingEl.className = "chat-typing-indicator";
    typingEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="chat-typing-label"></span>';
    els.chatPanelMessages?.appendChild(typingEl);
    els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;

    let typingRemoved = false;
    function setTypingLabel(label = "") {
      const nextLabel = String(label || "").trim();
      const labelEl = typingEl.querySelector(".chat-typing-label");
      if (!labelEl) return;
      labelEl.textContent = nextLabel || "Working...";
    }
    function removeTyping() {
      if (!typingRemoved) { typingEl.remove(); typingRemoved = true; }
    }
    setTypingLabel("Generating response...");

    const assistantMessageId = createMessageId();
    const assistantMsg = addMessage("assistant", "", assistantMessageId);
    pushToStore("assistant", "", assistantMessageId);
    let deferredCitations = [];
    let deferredWebSources = [];
    let deferredAskUserQuestions = [];
    let deferredTaskProposals = [];
    let recoveryPromise = null;
    const seenWorkspaceActionEvents = new Set();

    function emitWorkspaceAction(phase, payload = null) {
      if (!payload || typeof payload !== "object" || typeof onWorkspaceAction !== "function") return;
      const actionId = String(payload.actionId || "").trim();
      const name = String(payload.name || "").trim();
      const dedupeKey = `${phase}:${actionId}:${name}`;
      if (actionId && seenWorkspaceActionEvents.has(dedupeKey)) return;
      if (actionId) seenWorkspaceActionEvents.add(dedupeKey);
      const entityType = String(payload.entityType || "").trim().toLowerCase();
      const entityId = String(payload.entityId || "").trim();
      const resolvedEntityId = entityId || (entityType === "note" ? String(contextNoteId || "").trim() : "");
      onWorkspaceAction({
        ...payload,
        phase,
        ...(entityType === "note" && resolvedEntityId ? { noteId: resolvedEntityId, entityId: resolvedEntityId } : {}),
        ...(entityType === "folder" && entityId ? { folderId: entityId } : {}),
      });
    }

    const requestPayload = {
      question: question || "Save this attachment to Stash.",
      project: project || undefined,
      contextNoteId: contextNoteId || undefined,
      scope: scopePayload.scope,
      workingSetIds: scopePayload.workingSetIds,
      recentMessages,
      captureIntent: hasAttachment ? "save" : "",
      imageDataUrl: hasAttachment && attachment.isImage ? attachment.fileDataUrl : undefined,
      fileDataUrl: hasAttachment ? attachment.fileDataUrl : undefined,
      fileName: hasAttachment ? attachment.fileName : undefined,
      fileMimeType: hasAttachment ? attachment.fileMimeType : undefined,
      userTimezone: localTimezone || undefined,
    };
    if (answeredFollowUp?.kind === "task_proposal" && answeredFollowUp.payload) {
      requestPayload.taskSetupContext = {
        acceptedProposal: answeredFollowUp.payload,
      };
    }
    if (taskContext && taskContext.id) {
      requestPayload.taskContext = taskContext;
    }
    const debugTrace = {
      id: `chat-debug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: new Date().toISOString(),
      request: toDebugSafePayload(requestPayload),
      events: [],
      tokenCount: 0,
      status: "running",
    };
    pushDebugTrace(debugTrace);

    try {
      await apiClient.askStreaming(
        requestPayload,
        {
          onCitations(citations) {
            deferredCitations = Array.isArray(citations) ? citations : [];
          },
          onWebSources(sources) {
            deferredWebSources = Array.isArray(sources) ? sources : [];
          },
          onToken(token) {
            setTypingLabel("Generating response...");
            setPendingState(true, "Generating response...");
            debugTrace.tokenCount += String(token || "").length;
            if (assistantMsg) {
              appendAssistantToken(assistantMsg, token);
              els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;
            }
          },
          onToolCall(name, _status, noteId, toolEvent = null) {
            const statusMap = {
              create_note: "Saving...",
              create_folder: "Creating folder...",
              search_notes: "Searching...",
              fetch_rss: "Fetching feed...",
              get_note_raw_content: "Loading note content...",
              update_note: "Updating note...",
              update_note_markdown: "Updating content...",
              add_note_comment: "Adding comment...",
              list_note_versions: "Loading versions...",
              restore_note_version: "Restoring version...",
              retry_note_enrichment: "Retrying enrichment...",
              propose_task: "Preparing task proposal...",
              ask_user_question: "Preparing a follow-up question...",
            };
            const pendingLabel = statusMap[name] || "Working...";
            setTypingLabel(pendingLabel);
            setPendingState(true, pendingLabel);
            debugTrace.events.push({
              type: "tool_call",
              name,
              noteId: String(noteId || "").trim(),
              at: new Date().toISOString(),
            });
          },
          onToolResult(name, result, error, noteIdFromEvent, toolEvent = null) {
            setTypingLabel(error ? "Recovering from tool error..." : "Finalizing response...");
            setPendingState(true, error ? "Recovering from tool error..." : "Finalizing response...");
            if (!error && name === "ask_user_question" && result && typeof result === "object") {
              if (deferredAskUserQuestions.length < 4) {
                deferredAskUserQuestions.push(result);
              }
            }
            if (!error && name === "propose_task" && result && typeof result === "object") {
              const normalizedProposal = normalizeTaskProposalPayload(result);
              if (normalizedProposal && deferredTaskProposals.length < 2) {
                deferredTaskProposals.push(normalizedProposal);
              }
            }
            debugTrace.events.push({
              type: "tool_result",
              name,
              ok: !error,
              error: error ? String(error) : "",
              at: new Date().toISOString(),
            });
            if (
              name === "create_note" &&
              result?.noteId &&
              ["file", "image"].includes(String(result?.sourceType || "").trim().toLowerCase())
            ) {
              void apiClient.fetchNote(String(result.noteId))
                .then((payload) => {
                  if (typeof onOpenCitation === "function" && payload?.note) {
                    onOpenCitation(payload.note);
                  }
                })
                .catch(() => {});
            }
          },
          onWorkspaceActionStart(eventPayload) {
            debugTrace.events.push({
              type: "workspace_action_start",
              at: new Date().toISOString(),
              payload: eventPayload || null,
            });
            emitWorkspaceAction("start", eventPayload);
          },
          onWorkspaceActionProgress(eventPayload) {
            debugTrace.events.push({
              type: "workspace_action_progress",
              at: new Date().toISOString(),
              payload: eventPayload || null,
            });
            emitWorkspaceAction("progress", eventPayload);
          },
          onWorkspaceActionCommit(eventPayload) {
            debugTrace.events.push({
              type: "workspace_action_commit",
              at: new Date().toISOString(),
              payload: eventPayload || null,
            });
            emitWorkspaceAction("commit", eventPayload);
          },
          onWorkspaceActionError(eventPayload) {
            debugTrace.events.push({
              type: "workspace_action_error",
              at: new Date().toISOString(),
              payload: eventPayload || null,
            });
            emitWorkspaceAction("error", eventPayload);
          },
          onDone() {
            removeTyping();
            if (assistantMsg && deferredTaskProposals.length > 0) {
              deferredTaskProposals.forEach((proposalPayload) => {
                renderTaskProposalPrompt(assistantMsg, proposalPayload);
              });
            }
            if (assistantMsg && deferredAskUserQuestions.length > 0) {
              const assistantTextForPrompt = getMessageRawText(assistantMsg);
              deferredAskUserQuestions.forEach((questionPayload) => {
                renderAskUserQuestionPrompt(assistantMsg, questionPayload, {
                  assistantText: assistantTextForPrompt,
                });
              });
            }
            upsertPendingFollowUpsForMessage(assistantMessageId, [
              ...deferredTaskProposals.map((payload) => ({ kind: "task_proposal", payload })),
              ...deferredAskUserQuestions.map((payload) => ({ kind: "question", payload })),
            ]);
            setPendingState(false);
            const hasStructuredPrompt = Boolean(
              assistantMsg?.querySelector(".chat-user-question, .chat-task-proposal")
            );
            if (assistantMsg && hasStructuredPrompt) {
              // Keep follow-up content inside the structured card to avoid duplicate question text.
              setMessageBodyText(assistantMsg, "assistant", "");
            }
            if (assistantMsg && !getMessageRawText(assistantMsg).trim() && !hasStructuredPrompt) {
              const lastToolError = [...(debugTrace.events || [])]
                .reverse()
                .find((event) => event?.type === "tool_result" && event?.ok === false && event?.error);
              const fallbackMessage = toToolErrorFallbackMessage(lastToolError?.error || "");
              setMessageBodyText(
                assistantMsg,
                "assistant",
                fallbackMessage || "No answer generated."
              );
            }
            const assistantText = getMessageRawText(assistantMsg);
            const firstFollowUpQuestion = normalizeAskUserQuestionPayload(deferredAskUserQuestions[0])?.question || "";
            const firstTaskProposalContext = buildTaskProposalContextText(deferredTaskProposals[0]);
            const persistedAssistantText = assistantText
              || (hasStructuredPrompt ? (firstFollowUpQuestion || firstTaskProposalContext) : "");
            const userFacingError = extractUserFacingErrorText(persistedAssistantText);
            if (userFacingError) {
              debugTrace.userFacingError = userFacingError;
            }
            const renderedSources = renderSourcesForAnswer({
              assistantText: persistedAssistantText,
              citations: deferredCitations,
              webSources: deferredWebSources,
              suppress: hasStructuredPrompt,
            });
            renderInlineSourceChips(assistantMsg, renderedSources);
            debugTrace.status = "completed";
            debugTrace.finishedAt = new Date().toISOString();
            debugTrace.assistantText = persistedAssistantText;
            updateLastAssistantInStore(persistedAssistantText);
          },
          onToolTrace(trace) {
            if (!trace) return;
            debugTrace.events.push({
              type: "tool_trace",
              at: new Date().toISOString(),
              trace,
            });
          },
          onDebugError(errorPayload) {
            if (!errorPayload || typeof errorPayload !== "object") return;
            debugTrace.events.push({
              type: "debug_error",
              at: new Date().toISOString(),
              error: errorPayload,
            });
            const message = String(errorPayload.message || "").trim();
            if (message && !debugTrace.error) {
              debugTrace.error = message;
            }
            debugTrace.errorDetail = errorPayload;
          },
          onError(streamError) {
            const statusCode = Number(streamError?.status || streamError?.payload?.status || 0);
            const authExpired = statusCode === 401 || /not authenticated/i.test(String(streamError?.message || ""));
            const serializedError = serializeErrorForDebug(streamError);
            if (authExpired) {
              removeTyping();
              const authText = "Session expired. Please sign in again.";
              if (assistantMsg) setMessageBodyText(assistantMsg, "assistant", authText);
              updateLastAssistantInStore(authText);
              if (typeof toast === "function") toast(authText, "error");
              if (typeof onAuthExpired === "function") onAuthExpired();
              debugTrace.status = "failed";
              debugTrace.error = authText;
              debugTrace.userFacingError = authText;
              if (serializedError) debugTrace.errorDetail = serializedError;
              debugTrace.finishedAt = new Date().toISOString();
              return;
            }
            setTypingLabel("Recovering response...");
            setPendingState(true, "Recovering response...");
            debugTrace.status = "recovering";
            debugTrace.error = "Streaming error; switched to fallback ask";
            if (serializedError) debugTrace.errorDetail = serializedError;
            debugTrace.finishedAt = new Date().toISOString();
            recoveryPromise = fallbackAsk(
              question || "Save this attachment to Stash.",
              assistantMsg,
              project,
              contextNoteId,
              scopePayload,
              attachment,
              recentMessages,
              debugTrace
            );
          },
        }
      );
      if (recoveryPromise) {
        await recoveryPromise;
      }
      return true;
    } catch (streamSetupError) {
      setTypingLabel("Recovering response...");
      debugTrace.status = "recovering";
      debugTrace.error = "Streaming request failed before events; switched to fallback ask";
      const serializedError = serializeErrorForDebug(streamSetupError);
      if (serializedError) debugTrace.errorDetail = serializedError;
      debugTrace.finishedAt = new Date().toISOString();
      await fallbackAsk(
        question || "Save this attachment to Stash.",
        assistantMsg,
        project,
        contextNoteId,
        scopePayload,
        attachment,
        recentMessages,
        debugTrace
      );
      return true;
    } finally {
      removeTyping();
      isAsking = false;
      setPendingState(false);
    }
  }

  async function handleSubmit() {
    if (isAsking) return;
    const question = (els.chatPanelInput?.value || "").trim();
    const attachment = pendingAttachment.fileDataUrl ? { ...pendingAttachment } : null;
    if (!question && !attachment) return;
    await askQuestion(question, { attachment });
  }

  async function fallbackAsk(
    question,
    msgEl,
    projectHint = "",
    contextNoteId = "",
    scopePayload = null,
    attachment = null,
    recentMessages = [],
    debugTrace = null
  ) {
    try {
      const hasAttachment = Boolean(attachment?.fileDataUrl);
      const result = await apiClient.ask({
        question,
        project: projectHint || undefined,
        contextNoteId: contextNoteId || undefined,
        scope: scopePayload?.scope || "all",
        workingSetIds: Array.isArray(scopePayload?.workingSetIds) ? scopePayload.workingSetIds : [],
        recentMessages: Array.isArray(recentMessages) ? recentMessages : [],
        captureIntent: hasAttachment ? "save" : "",
        imageDataUrl: hasAttachment && attachment.isImage ? attachment.fileDataUrl : undefined,
        fileDataUrl: hasAttachment ? attachment.fileDataUrl : undefined,
        fileName: hasAttachment ? attachment.fileName : undefined,
        fileMimeType: hasAttachment ? attachment.fileMimeType : undefined,
        userTimezone: localTimezone || undefined,
      });
      const resultText = result.text || "No answer.";
      if (msgEl) {
        setMessageBodyText(msgEl, "assistant", resultText);
      }
      updateLastAssistantInStore(msgEl ? getMessageRawText(msgEl) : resultText);
      const renderedSources = renderSourcesForAnswer({
        assistantText: resultText,
        citations: result.citations || [],
        usedCitationLabels: result.usedCitationLabels || [],
        webSources: result.webSources || [],
      });
      renderInlineSourceChips(msgEl, renderedSources);
      if (debugTrace) {
        debugTrace.status = "completed-fallback";
        debugTrace.finishedAt = new Date().toISOString();
        debugTrace.assistantText = resultText;
        const userFacingError = extractUserFacingErrorText(resultText);
        if (userFacingError) {
          debugTrace.userFacingError = userFacingError;
          if (!debugTrace.error) {
            debugTrace.error = "Server returned fallback error text";
          }
        }
      }
    } catch (error) {
      const statusCode = Number(error?.status || error?.payload?.status || 0);
      const authExpired = statusCode === 401 || /not authenticated/i.test(String(error?.message || ""));
      const failureText = authExpired ? "Session expired. Please sign in again." : "Failed to get answer.";
      if (msgEl) setMessageBodyText(msgEl, "assistant", failureText);
      updateLastAssistantInStore(failureText);
      if (authExpired) {
        if (typeof toast === "function") toast(failureText, "error");
        if (typeof onAuthExpired === "function") onAuthExpired();
      }
      if (debugTrace) {
        debugTrace.status = "failed";
        debugTrace.finishedAt = new Date().toISOString();
        debugTrace.error = String(error?.message || error || "Fallback ask failed");
        debugTrace.userFacingError = failureText;
        const serializedError = serializeErrorForDebug(error);
        if (serializedError) debugTrace.errorDetail = serializedError;
      }
    }
  }

  // Textarea auto-resize
  addHandler(els.chatPanelInput, "input", () => {
    const ta = els.chatPanelInput;
    if (!ta) return;
    ta.style.height = "";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  });

  // Enter submits, Shift+Enter inserts newline
  addHandler(els.chatPanelInput, "keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  });

  addHandler(els.chatPanelForm, "submit", (e) => {
    e.preventDefault();
    handleSubmit();
  });

  addHandler(els.chatPanelNewChat, "click", () => {
    if (isAsking) return;
    clearConversation();
  });

  addHandler(els.chatPanelDebugCopy, "click", () => {
    void copyDebugDump();
  });

  addHandler(els.chatPanelAttachBtn, "click", () => {
    els.chatPanelFileInput?.click();
  });

  addHandler(els.chatPanelAttachmentClear, "click", () => {
    clearAttachment();
  });

  addHandler(els.chatPanelFileInput, "change", async () => {
    if (isAsking) return;
    const file = els.chatPanelFileInput?.files?.[0];
    if (!file) return;
    try {
      const fileDataUrl = await fileToDataUrl(file);
      pendingAttachment = {
        fileDataUrl,
        fileName: String(file.name || "attachment"),
        fileMimeType: String(file.type || ""),
        isImage: String(file.type || "").toLowerCase().startsWith("image/"),
      };
      refreshAttachmentUI();
    } catch {
      clearAttachment();
    }
  });

  // Wire suggestion chip clicks
  if (els.chatChips) {
    const chipPrompts = {
      save: "Save this link: ",
      note: "Create a note about ",
      folder: "Create a folder called ",
      search: "",
    };
    els.chatChips.forEach((chip) => {
      addHandler(chip, "click", () => {
        if (isAsking) return;
        const promptKey = chip.dataset.prompt || "";
        const prompt = chipPrompts[promptKey] ?? "";
        if (els.chatPanelInput) {
          els.chatPanelInput.value = prompt;
          els.chatPanelInput.focus();
          els.chatPanelInput.selectionStart = els.chatPanelInput.selectionEnd = prompt.length;
        }
      });
    });
  }

  rebuildFromStore();
  refreshAttachmentUI();
  setPendingState(false);

  return {
    askQuestion,
    isAsking: () => isAsking,
    clearConversation,
    startFromNote(note, { autoSubmit = true } = {}) {
      if (isAsking || !note || !els.chatPanelInput) return;
      nextProjectHint = String(note.project || "").trim();
      els.chatPanelInput.value = buildItemContextQuestion(note);
      // Trigger auto-resize
      els.chatPanelInput.style.height = "";
      els.chatPanelInput.style.height = Math.min(els.chatPanelInput.scrollHeight, 160) + "px";
      if (autoSubmit) {
        askQuestion(els.chatPanelInput.value, { projectHint: nextProjectHint });
      }
    },
    dispose: () => handlers.forEach((fn) => fn()),
  };
}
