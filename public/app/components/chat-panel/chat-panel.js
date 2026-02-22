import { buildNoteTitle, normalizeCitation, normalizeCitationLabel } from "../../services/mappers.js";
import { renderMarkdownInto } from "../../services/markdown.js";
import { renderIcon } from "../../services/icons.js";

const MAX_MESSAGES = 100;
const MAX_RECENT_HISTORY = 12;
const MAX_DEBUG_TRACES = 20;
const MAX_SOURCE_LIST_ITEMS = 8;
const MAX_INLINE_SOURCE_CHIPS = 3;

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

export function initChatPanel(els, { apiClient, toast, onOpenCitation, onWorkspaceAction, store } = {}) {
  const handlers = [];
  let isAsking = false;
  let nextProjectHint = "";
  let lastContextLabel = "";
  const isLocalRuntime = typeof window !== "undefined"
    && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const debugTraces = [];
  const sourcePanelState = {
    citationsExpanded: false,
    webExpanded: false,
  };
  let pendingAttachment = {
    fileDataUrl: null,
    fileName: "",
    fileMimeType: "",
    isImage: false,
  };

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
      traces: debugTraces,
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

  function setPendingState(pending, statusText = "") {
    const isPending = Boolean(pending);
    const text = String(statusText || "").trim();
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
        .querySelectorAll(".chat-question-option, .chat-question-input, .chat-question-submit")
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
    const showPendingLabel = isPending && text && !/^generating response/i.test(text);
    if (showPendingLabel) {
      els.chatPanelPending.textContent = text || "Generating response...";
      els.chatPanelPending.classList.remove("hidden");
      return;
    }
    els.chatPanelPending.textContent = "";
    els.chatPanelPending.classList.add("hidden");
  }

  function normalizeAskUserQuestionPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    const question = normalizeSingleSentence(payload.question, 140);
    if (!question) return null;
    const allowFreeform = payload.allowFreeform !== false;
    const options = Array.isArray(payload.options)
      ? payload.options.map((opt) => normalizeSingleSentence(opt, 60)).filter(Boolean).slice(0, 4)
      : [];
    const filteredOptions = options.filter((option) => !isActionLikeOption(option));
    const locationOpenEnded = allowFreeform && isOpenEndedLocationQuestion(question);
    const resolvedOptions = allowFreeform
      ? (locationOpenEnded ? [] : (filteredOptions.length >= 2 ? filteredOptions : []))
      : (filteredOptions.length ? filteredOptions : options);
    return {
      question,
      options: resolvedOptions,
      allowFreeform,
      context: normalizeSingleSentence(payload.context, 120),
    };
  }

  function isActionLikeOption(option = "") {
    const value = String(option || "").trim().toLowerCase();
    if (!value) return false;
    return /^(share|use|tell|ask|click|enter|provide|set|pick|choose)\b/.test(value);
  }

  function isOpenEndedLocationQuestion(question = "") {
    const value = String(question || "").trim().toLowerCase();
    if (!value) return false;
    const asksLocation = /\b(city|neighborhood|neighbourhood|zip|postal|postcode|location|area|where|near)\b/.test(value);
    const asksDiscovery = /\b(search|look|find|recommend|near)\b/.test(value);
    return asksLocation && (asksDiscovery || value.startsWith("what ") || value.startsWith("which ") || value.startsWith("where "));
  }

  function normalizeSingleSentence(value, maxLen = 140) {
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

  function renderAskUserQuestionPrompt(msgEl, payload = null, { assistantText = "" } = {}) {
    const normalized = normalizeAskUserQuestionPayload(payload);
    if (!msgEl || !normalized) return;
    const { question, options, allowFreeform } = normalized;
    const questionAlreadyVisible = assistantContainsQuestionText(assistantText, question);
    const questionKey = question.toLowerCase();
    const duplicate = Array.from(msgEl.querySelectorAll(".chat-user-question")).some(
      (node) => String(node?.dataset?.questionKey || "") === questionKey
    );
    if (duplicate) return;

    const prompt = document.createElement("section");
    prompt.className = "chat-user-question";
    prompt.dataset.questionKey = questionKey;
    prompt.setAttribute("role", "group");
    prompt.setAttribute("aria-label", "Assistant follow-up question");

    const label = document.createElement("p");
    label.className = "chat-question-label";
    label.textContent = questionAlreadyVisible ? "Reply to continue" : "Follow-up question";
    prompt.appendChild(label);

    if (!questionAlreadyVisible) {
      const questionText = document.createElement("p");
      questionText.className = "chat-question-text";
      questionText.textContent = question;
      prompt.appendChild(questionText);
    } else {
      prompt.classList.add("chat-user-question--compact");
    }

    if (options.length > 0) {
      const optionsWrap = document.createElement("div");
      optionsWrap.className = "chat-question-options";
      options.forEach((option) => {
        const optionBtn = document.createElement("button");
        optionBtn.type = "button";
        optionBtn.className = "chat-question-option";
        optionBtn.textContent = option;
        optionBtn.disabled = isAsking;
        optionBtn.addEventListener("click", () => {
          if (isAsking) return;
          void askQuestion(option);
        });
        optionsWrap.appendChild(optionBtn);
      });
      prompt.appendChild(optionsWrap);
    }

    if (allowFreeform) {
      const form = document.createElement("form");
      form.className = "chat-question-form";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (isAsking) return;
        const value = String(input.value || "").trim();
        if (!value) return;
        input.value = "";
        void askQuestion(value);
      });

      const input = document.createElement("input");
      input.type = "text";
      input.className = "chat-question-input";
      input.placeholder = "Type a response...";
      input.autocomplete = "off";
      input.disabled = isAsking;
      input.setAttribute("aria-label", "Type your response");

      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "chat-question-submit";
      submit.textContent = "Reply";
      submit.disabled = isAsking;

      form.append(input, submit);
      prompt.appendChild(form);

      const hint = document.createElement("p");
      hint.className = "chat-question-hint";
      hint.textContent = "You can also reply directly in the main chat input.";
      prompt.appendChild(hint);
    }

    msgEl.appendChild(prompt);
  }

  function compactLatestFollowUp(answerText = "") {
    if (!els.chatPanelMessages) return;
    const prompts = Array.from(els.chatPanelMessages.querySelectorAll(".chat-user-question:not(.is-answered)"));
    if (!prompts.length) return;
    const prompt = prompts[prompts.length - 1];
    prompt.classList.add("is-answered", "chat-user-question--compact");
    prompt.querySelector(".chat-question-options")?.remove();
    prompt.querySelector(".chat-question-form")?.remove();
    prompt.querySelector(".chat-question-hint")?.remove();
    const label = prompt.querySelector(".chat-question-label");
    if (label) {
      label.textContent = "Follow-up answered";
    }
    prompt.querySelector(".chat-question-answer")?.remove();
    const normalized = String(answerText || "").replace(/\s+/g, " ").trim();
    if (!normalized) return;
    const answer = document.createElement("p");
    answer.className = "chat-question-answer";
    answer.textContent = `Answer: ${normalized.slice(0, 140)}`;
    prompt.appendChild(answer);
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
    }

    // Only show navigation dividers when there are actual chat messages
    const hasMessages = store && (store.getState().chatMessages || []).length > 0;
    if (label !== lastContextLabel && lastContextLabel && els.chatPanelMessages && hasMessages) {
      const divider = document.createElement("div");
      divider.className = "chat-context-divider";
      divider.textContent = label || "Home";
      els.chatPanelMessages.appendChild(divider);
      els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;
    }
    lastContextLabel = label;

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
    let text = String(rawText || "");
    // Remove parenthesized markdown links like: ([example.com](https://example.com))
    text = text.replace(/\(\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*\)/gi, "");
    // Replace remaining markdown links with label-only text.
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1");
    text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    return text.trim();
  }

  function normalizeComparableText(value = "") {
    return String(value || "")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, "$1")
      .replace(/[*_`~#>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function assistantContainsQuestionText(assistantText = "", questionText = "") {
    const question = normalizeComparableText(questionText);
    if (!question) return false;
    const assistant = normalizeComparableText(assistantText);
    if (!assistant) return false;
    return assistant === question || assistant.includes(question);
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

  function pushToStore(role, text) {
    if (!store) return;
    const state = store.getState();
    const messages = [...(state.chatMessages || [])];
    messages.push({ role, text, id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
    if (messages.length > MAX_MESSAGES) {
      messages.splice(0, messages.length - MAX_MESSAGES);
    }
    store.setState({ chatMessages: messages });
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

  function addMessage(role, text) {
    if (!els.chatPanelMessages) return;
    if (els.chatEmptyState) els.chatEmptyState.classList.add("hidden");
    const msg = document.createElement("div");
    msg.className = `chat-msg chat-msg--${role}`;
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
    messages.forEach((msg) => {
      const el = document.createElement("div");
      el.className = `chat-msg chat-msg--${msg.role}`;
      setMessageBodyText(el, msg.role, msg.text);
      els.chatPanelMessages.appendChild(el);
    });
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

  function normalizeWebSourceEntries(sources = []) {
    return Array.isArray(sources)
      ? sources
          .map((entry) => ({
            url: String(entry?.url || "").trim(),
            title: String(entry?.title || "").trim(),
          }))
          .filter((entry) => entry.url)
          .slice(0, MAX_SOURCE_LIST_ITEMS)
      : [];
  }

  function getSourceHostname(url = "") {
    try {
      return new URL(String(url || "")).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function getSourceFaviconUrl(url = "") {
    const normalized = String(url || "").trim();
    if (!normalized) return "";
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(normalized)}&sz=64`;
  }

  function createFaviconStack(urls = [], fallbackLabel = "S") {
    const stack = document.createElement("div");
    stack.className = "chat-source-stack";
    const normalizedUrls = Array.isArray(urls) ? urls.filter(Boolean).slice(0, 3) : [];
    if (normalizedUrls.length === 0) {
      const fallback = document.createElement("span");
      fallback.className = "chat-source-stack-item chat-source-stack-fallback";
      fallback.textContent = String(fallbackLabel || "S").slice(0, 1).toUpperCase();
      stack.appendChild(fallback);
      return stack;
    }
    normalizedUrls.forEach((url, index) => {
      const item = document.createElement("span");
      item.className = "chat-source-stack-item";
      item.style.zIndex = String(20 - index);
      const img = document.createElement("img");
      img.className = "chat-source-favicon";
      img.src = getSourceFaviconUrl(url);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      item.appendChild(img);
      stack.appendChild(item);
    });
    return stack;
  }

  function renderSourceToggle(container, {
    label = "Sources",
    count = 0,
    urls = [],
    expanded = false,
    onToggle = null,
  } = {}) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "chat-source-toggle";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.addEventListener("click", () => {
      if (typeof onToggle === "function") onToggle();
    });

    const left = document.createElement("span");
    left.className = "chat-source-toggle-left";
    left.append(
      createFaviconStack(urls, label.slice(0, 1)),
      Object.assign(document.createElement("span"), {
        className: "chat-source-toggle-label",
        textContent: label,
      }),
      Object.assign(document.createElement("span"), {
        className: "chat-source-toggle-count",
        textContent: String(Math.max(0, Number(count) || 0)),
      })
    );

    const chevron = document.createElement("span");
    chevron.className = `chat-source-toggle-chevron${expanded ? " is-expanded" : ""}`;
    chevron.innerHTML = renderIcon("chevron-right", { size: 14, strokeWidth: 2 });

    toggle.append(left, chevron);
    container.appendChild(toggle);
  }

  function renderCitations(citations = []) {
    if (!els.chatPanelCitations) return;
    const normalized = Array.isArray(citations)
      ? citations.map((entry, index) => normalizeCitation(entry, index)).slice(0, MAX_SOURCE_LIST_ITEMS)
      : [];
    els.chatPanelCitations.innerHTML = "";
    if (!normalized.length) {
      els.chatPanelCitations.classList.add("hidden");
      sourcePanelState.citationsExpanded = false;
      return;
    }

    els.chatPanelCitations.classList.remove("hidden");
    const sourceUrls = normalized
      .map((entry) => String(entry?.note?.sourceUrl || "").trim())
      .filter(Boolean);
    renderSourceToggle(els.chatPanelCitations, {
      label: "Saved sources",
      count: normalized.length,
      urls: sourceUrls,
      expanded: sourcePanelState.citationsExpanded,
      onToggle: () => {
        sourcePanelState.citationsExpanded = !sourcePanelState.citationsExpanded;
        renderCitations(normalized);
      },
    });

    if (!sourcePanelState.citationsExpanded) return;
    const list = document.createElement("div");
    list.className = "chat-source-list";

    normalized.forEach((citation) => {
      const note = citation.note || {};
      const item = document.createElement("article");
      item.className = "chat-source-item";

      const row = document.createElement("div");
      row.className = "chat-source-item-row";

      const title = document.createElement("button");
      title.type = "button";
      title.className = "chat-source-title";
      title.textContent = buildNoteTitle(note);
      title.title = buildNoteTitle(note);
      title.addEventListener("click", () => {
        if (typeof onOpenCitation === "function") {
          onOpenCitation(note);
        }
      });

      const meta = document.createElement("span");
      meta.className = "chat-source-meta";
      meta.textContent = String(note.project || note.sourceType || "Saved item");
      row.append(title, meta);
      item.appendChild(row);

      const actions = document.createElement("div");
      actions.className = "chat-source-actions";
      const openInAppBtn = document.createElement("button");
      openInAppBtn.type = "button";
      openInAppBtn.className = "chat-source-action";
      openInAppBtn.textContent = "Open";
      openInAppBtn.addEventListener("click", () => {
        if (typeof onOpenCitation === "function") {
          onOpenCitation(note);
        }
      });
      actions.appendChild(openInAppBtn);

      const sourceUrl = String(note.sourceUrl || "").trim();
      if (sourceUrl) {
        const openSourceBtn = document.createElement("a");
        openSourceBtn.className = "chat-source-action";
        openSourceBtn.href = sourceUrl;
        openSourceBtn.target = "_blank";
        openSourceBtn.rel = "noopener noreferrer";
        openSourceBtn.innerHTML = `${renderIcon("external-link", { size: 12, strokeWidth: 2 })}<span>Source</span>`;
        actions.appendChild(openSourceBtn);
      }

      item.appendChild(actions);
      list.appendChild(item);
    });

    els.chatPanelCitations.appendChild(list);
  }

  function renderWebSources(sources = []) {
    if (!els.chatPanelWebSources) return;
    const normalized = normalizeWebSourceEntries(sources);
    els.chatPanelWebSources.innerHTML = "";
    if (!normalized.length) {
      els.chatPanelWebSources.classList.add("hidden");
      sourcePanelState.webExpanded = false;
      return;
    }

    els.chatPanelWebSources.classList.remove("hidden");
    renderSourceToggle(els.chatPanelWebSources, {
      label: "Web sources",
      count: normalized.length,
      urls: normalized.map((entry) => entry.url),
      expanded: sourcePanelState.webExpanded,
      onToggle: () => {
        sourcePanelState.webExpanded = !sourcePanelState.webExpanded;
        renderWebSources(normalized);
      },
    });

    if (!sourcePanelState.webExpanded) return;
    const list = document.createElement("div");
    list.className = "chat-source-list";

    normalized.forEach((entry) => {
      const host = getSourceHostname(entry.url);
      const link = document.createElement("a");
      link.className = "chat-source-link";
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = entry.url;

      const favicon = document.createElement("img");
      favicon.className = "chat-source-link-favicon";
      favicon.src = getSourceFaviconUrl(entry.url);
      favicon.alt = "";
      favicon.loading = "lazy";
      favicon.decoding = "async";

      const text = document.createElement("span");
      text.className = "chat-source-link-text";
      const title = document.createElement("span");
      title.className = "chat-source-title";
      title.textContent = entry.title || host || entry.url;
      const meta = document.createElement("span");
      meta.className = "chat-source-meta";
      meta.textContent = host || entry.url;
      text.append(title, meta);

      const icon = document.createElement("span");
      icon.className = "chat-source-link-icon";
      icon.innerHTML = renderIcon("external-link", { size: 12, strokeWidth: 2 });

      link.append(favicon, text, icon);
      list.appendChild(link);
    });

    els.chatPanelWebSources.appendChild(list);
  }

  function renderInlineSourceChips(msgEl, { citations = [], webSources = [] } = {}) {
    if (!msgEl) return;
    msgEl.querySelector(".chat-inline-sources")?.remove();

    const normalizedWeb = normalizeWebSourceEntries(webSources);
    const normalizedCitations = Array.isArray(citations)
      ? citations.map((entry, index) => normalizeCitation(entry, index)).slice(0, MAX_INLINE_SOURCE_CHIPS)
      : [];
    const chips = [];
    const seen = new Set();

    normalizedWeb.slice(0, MAX_INLINE_SOURCE_CHIPS).forEach((entry) => {
      const key = `web:${entry.url}`;
      if (seen.has(key)) return;
      seen.add(key);
      chips.push({
        kind: "web",
        url: entry.url,
        label: getSourceHostname(entry.url) || entry.title || entry.url,
      });
    });

    if (chips.length < MAX_INLINE_SOURCE_CHIPS) {
      normalizedCitations.forEach((entry) => {
        if (chips.length >= MAX_INLINE_SOURCE_CHIPS) return;
        const note = entry.note || {};
        const noteId = String(note.id || "");
        if (!noteId || seen.has(`note:${noteId}`)) return;
        seen.add(`note:${noteId}`);
        chips.push({
          kind: "note",
          note,
          label: buildNoteTitle(note),
          url: String(note.sourceUrl || "").trim(),
        });
      });
    }

    if (!chips.length) return;
    const wrap = document.createElement("div");
    wrap.className = "chat-inline-sources";

    chips.forEach((chip) => {
      if (chip.kind === "web") {
        const anchor = document.createElement("a");
        anchor.className = "chat-inline-source-chip";
        anchor.href = chip.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        const favicon = document.createElement("img");
        favicon.className = "chat-inline-source-favicon";
        favicon.src = getSourceFaviconUrl(chip.url);
        favicon.alt = "";
        favicon.loading = "lazy";
        favicon.decoding = "async";
        const label = document.createElement("span");
        label.textContent = chip.label;
        anchor.append(favicon, label);
        wrap.appendChild(anchor);
        return;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-inline-source-chip";
      button.textContent = chip.label;
      button.addEventListener("click", () => {
        if (typeof onOpenCitation === "function") {
          onOpenCitation(chip.note);
        }
      });
      wrap.appendChild(button);
    });

    msgEl.appendChild(wrap);
  }

  function extractCitationLabelsFromText(text, max = 12) {
    const labels = [];
    const seen = new Set();
    const matcher = /\[?(N\d+)\]?/gi;
    let match = matcher.exec(String(text || ""));
    while (match && labels.length < max) {
      const label = normalizeCitationLabel(match[1]);
      if (label && !seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
      match = matcher.exec(String(text || ""));
    }
    return labels;
  }

  function resolveVisibleCitations(citations = [], assistantText = "", usedLabels = []) {
    const normalizedCitations = Array.isArray(citations)
      ? citations.map((entry, index) => normalizeCitation(entry, index))
      : [];
    if (!normalizedCitations.length) return [];
    const text = String(assistantText || "").trim();
    if (!text) return [];

    const textLabels = extractCitationLabelsFromText(text, normalizedCitations.length);
    const explicitLabels = Array.isArray(usedLabels)
      ? usedLabels.map((label) => normalizeCitationLabel(label)).filter(Boolean)
      : [];
    const preferredLabels = new Set([...explicitLabels, ...textLabels]);
    if (preferredLabels.size > 0) {
      return normalizedCitations.filter((entry) => preferredLabels.has(entry.label)).slice(0, 6);
    }

    const textLower = text.toLowerCase();
    const titleMatchedLabels = new Set();
    normalizedCitations.forEach((entry) => {
      const title = buildNoteTitle(entry.note || {}).trim().toLowerCase();
      if (title.length >= 4 && textLower.includes(title)) {
        titleMatchedLabels.add(entry.label);
      }
    });

    if (titleMatchedLabels.size > 0) {
      return normalizedCitations.filter((entry) => titleMatchedLabels.has(entry.label)).slice(0, 6);
    }

    return [];
  }

  function resolveVisibleWebSources(sources = [], assistantText = "") {
    const normalized = Array.isArray(sources)
      ? sources
          .map((entry) => ({
            url: String(entry?.url || "").trim(),
            title: String(entry?.title || "").trim(),
          }))
          .filter((entry) => entry.url)
          .slice(0, 8)
      : [];
    if (!normalized.length) return [];
    const textLower = String(assistantText || "").toLowerCase().trim();
    if (!textLower) return [];

    return normalized.filter((entry) => {
      const title = entry.title.toLowerCase();
      let host = "";
      try {
        host = new URL(entry.url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        host = "";
      }
      return (
        (title.length >= 5 && textLower.includes(title)) ||
        (host.length >= 4 && textLower.includes(host)) ||
        textLower.includes(entry.url.toLowerCase())
      );
    });
  }

  function renderSourcesForAnswer({ assistantText = "", citations = [], usedCitationLabels = [], webSources = [], suppress = false } = {}) {
    if (suppress) {
      renderCitations([]);
      saveCitationsToStore([]);
      renderWebSources([]);
      return { citations: [], webSources: [] };
    }
    sourcePanelState.citationsExpanded = false;
    sourcePanelState.webExpanded = false;
    const visibleCitations = resolveVisibleCitations(citations, assistantText, usedCitationLabels);
    renderCitations(visibleCitations);
    saveCitationsToStore(visibleCitations);

    const visibleWebSources = resolveVisibleWebSources(webSources, assistantText);
    renderWebSources(visibleWebSources);
    return {
      citations: visibleCitations,
      webSources: visibleWebSources,
    };
  }

  function clearConversation() {
    sourcePanelState.citationsExpanded = false;
    sourcePanelState.webExpanded = false;
    if (store) {
      store.setState({
        chatMessages: [],
        chatCitations: [],
      });
    }
    if (els.chatPanelMessages) {
      els.chatPanelMessages.innerHTML = "";
    }
    if (els.chatPanelCitations) {
      els.chatPanelCitations.innerHTML = "";
      els.chatPanelCitations.classList.add("hidden");
    }
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
    if (question) {
      compactLatestFollowUp(question);
    }

    // Read context from store
    const ctx = store ? (store.getState().chatContext || { type: "home" }) : { type: "home" };
    let project = String(projectHint || nextProjectHint || "").trim();
    let contextNoteId = "";

    if (ctx.type === "item" && ctx.itemId) {
      contextNoteId = ctx.itemId;
      if (!project && ctx.project) {
        project = ctx.project;
      }
    } else if (ctx.type === "folder" && ctx.folderId && !project) {
      project = ctx.folderId;
    }
    const scopePayload = buildScopePayload(ctx, contextNoteId, project);
    const recentMessages = collectRecentConversationMessages(MAX_RECENT_HISTORY);

    nextProjectHint = "";

    const userLine = hasAttachment
      ? `${question || "Save this attachment"}\n[attachment: ${attachment.fileName || "file"}]`
      : question;
    addMessage("user", userLine);
    pushToStore("user", userLine);
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
    typingEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    els.chatPanelMessages?.appendChild(typingEl);
    els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;

    let typingRemoved = false;
    function removeTyping() {
      if (!typingRemoved) { typingEl.remove(); typingRemoved = true; }
    }

    const assistantMsg = addMessage("assistant", "");
    pushToStore("assistant", "");
    let deferredCitations = [];
    let deferredWebSources = [];
    let deferredAskUserQuestions = [];
    let recoveryPromise = null;

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
    };
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
            removeTyping();
            const toolStatus = assistantMsg?.querySelector(".chat-tool-status");
            if (toolStatus) toolStatus.remove();
            setPendingState(true, "Generating response...");
            debugTrace.tokenCount += String(token || "").length;
            if (assistantMsg) {
              appendAssistantToken(assistantMsg, token);
              els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;
            }
          },
          onToolCall(name, _status, noteId) {
            removeTyping();
            const statusMap = {
              create_note: "Saving...",
              create_folder: "Creating folder...",
              search_notes: "Searching...",
              get_note_raw_content: "Loading note content...",
              update_note: "Updating note...",
              update_note_markdown: "Updating markdown...",
              add_note_comment: "Adding comment...",
              list_note_versions: "Loading versions...",
              restore_note_version: "Restoring version...",
              retry_note_enrichment: "Retrying enrichment...",
              ask_user_question: "Preparing a follow-up question...",
            };
            const pendingLabel = statusMap[name] || "Working...";
            setPendingState(true, pendingLabel);
            debugTrace.events.push({
              type: "tool_call",
              name,
              noteId: String(noteId || "").trim(),
              at: new Date().toISOString(),
            });
            const statusEl = document.createElement("span");
            statusEl.className = "chat-tool-status";
            statusEl.textContent = pendingLabel;
            if (assistantMsg) {
              assistantMsg.appendChild(statusEl);
              els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;
            }
            if (
              (name === "update_note" || name === "update_note_markdown") &&
              noteId &&
              typeof onWorkspaceAction === "function"
            ) {
              onWorkspaceAction({
                phase: "start",
                name,
                noteId: String(noteId || "").trim(),
              });
            }
          },
          onToolResult(name, result, error, noteIdFromEvent) {
            const statusEl = assistantMsg?.querySelector(".chat-tool-status");
            if (statusEl) statusEl.remove();
            setPendingState(true, error ? "Recovering from tool error..." : "Finalizing response...");
            if (!error && name === "ask_user_question" && result && typeof result === "object") {
              if (deferredAskUserQuestions.length < 4) {
                deferredAskUserQuestions.push(result);
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
            if (
              (name === "create_note" ||
                name === "create_folder" ||
                name === "update_note" ||
                name === "update_note_markdown" ||
                name === "add_note_comment" ||
                name === "restore_note_version" ||
                name === "retry_note_enrichment") &&
              typeof onWorkspaceAction === "function"
            ) {
              const resolvedNoteId = String(noteIdFromEvent || result?.noteId || "").trim();
              onWorkspaceAction({
                phase: "done",
                name,
                noteId: resolvedNoteId,
                result: result || null,
                error: error || null,
              });
            }
          },
          onDone() {
            removeTyping();
            const toolStatus = assistantMsg?.querySelector(".chat-tool-status");
            if (toolStatus) toolStatus.remove();
            if (assistantMsg && deferredAskUserQuestions.length > 0) {
              const assistantTextForPrompt = getMessageRawText(assistantMsg);
              deferredAskUserQuestions.forEach((questionPayload) => {
                renderAskUserQuestionPrompt(assistantMsg, questionPayload, {
                  assistantText: assistantTextForPrompt,
                });
              });
            }
            setPendingState(false);
            const hasQuestionPrompt = Boolean(assistantMsg?.querySelector(".chat-user-question"));
            if (assistantMsg && !getMessageRawText(assistantMsg).trim() && !hasQuestionPrompt) {
              setMessageBodyText(assistantMsg, "assistant", "No answer generated.");
            }
            const assistantText = getMessageRawText(assistantMsg);
            const renderedSources = renderSourcesForAnswer({
              assistantText,
              citations: deferredCitations,
              webSources: deferredWebSources,
              suppress: hasQuestionPrompt,
            });
            renderInlineSourceChips(assistantMsg, renderedSources);
            debugTrace.status = "completed";
            debugTrace.finishedAt = new Date().toISOString();
            debugTrace.assistantText = assistantText;
            updateLastAssistantInStore(assistantText);
          },
          onToolTrace(trace) {
            if (!trace) return;
            debugTrace.events.push({
              type: "tool_trace",
              at: new Date().toISOString(),
              trace,
            });
          },
          onError() {
            removeTyping();
            setPendingState(true, "Recovering response...");
            debugTrace.status = "recovering";
            debugTrace.error = "Streaming error; switched to fallback ask";
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
    } catch {
      removeTyping();
      debugTrace.status = "recovering";
      debugTrace.error = "Streaming request failed before events; switched to fallback ask";
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
      }
    } catch (error) {
      if (msgEl) setMessageBodyText(msgEl, "assistant", "Failed to get answer.");
      updateLastAssistantInStore("Failed to get answer.");
      if (debugTrace) {
        debugTrace.status = "failed";
        debugTrace.finishedAt = new Date().toISOString();
        debugTrace.error = String(error?.message || error || "Fallback ask failed");
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
