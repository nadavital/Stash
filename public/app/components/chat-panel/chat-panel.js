import { buildNoteTitle, buildContentPreview, normalizeCitation } from "../../services/mappers.js";

const MAX_MESSAGES = 100;

export function renderChatPanelHTML() {
  return `
    <div id="chat-panel" class="chat-panel" aria-label="Chat with your notes">
      <div id="chat-panel-messages" class="chat-panel-messages"></div>
      <div class="chat-panel-citations hidden" id="chat-panel-citations"></div>
      <form id="chat-panel-form" class="chat-panel-form">
        <div class="chat-panel-input-wrap">
          <textarea id="chat-panel-input" class="chat-panel-input" rows="2" placeholder="Ask about your notes..." autocomplete="off"></textarea>
          <button id="chat-panel-send" class="chat-panel-send" type="submit" aria-label="Send">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="14" x2="8" y2="3"/>
              <polyline points="3 7 8 2 13 7"/>
            </svg>
          </button>
        </div>
      </form>
    </div>
  `;
}

export function queryChatPanelEls(root) {
  return {
    chatPanel: root.querySelector("#chat-panel"),
    chatPanelMessages: root.querySelector("#chat-panel-messages"),
    chatPanelCitations: root.querySelector("#chat-panel-citations"),
    chatPanelForm: root.querySelector("#chat-panel-form"),
    chatPanelInput: root.querySelector("#chat-panel-input"),
    chatPanelSend: root.querySelector("#chat-panel-send"),
  };
}

export function initChatPanel(els, { apiClient, toast, onOpenCitation, store } = {}) {
  const handlers = [];
  let isAsking = false;
  let nextProjectHint = "";

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
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
    const msg = document.createElement("div");
    msg.className = `chat-msg chat-msg--${role}`;
    msg.textContent = text;
    els.chatPanelMessages.appendChild(msg);
    els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;
    return msg;
  }

  function rebuildFromStore() {
    if (!store || !els.chatPanelMessages) return;
    const state = store.getState();
    const messages = state.chatMessages || [];
    if (!messages.length) return;

    els.chatPanelMessages.innerHTML = "";
    messages.forEach((msg) => {
      const el = document.createElement("div");
      el.className = `chat-msg chat-msg--${msg.role}`;
      el.textContent = msg.text;
      els.chatPanelMessages.appendChild(el);
    });
    els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;

    const citations = state.chatCitations || [];
    if (citations.length) {
      renderCitations(citations);
    }
  }

  function renderCitations(citations = []) {
    if (!els.chatPanelCitations) return;
    els.chatPanelCitations.innerHTML = "";
    if (!citations.length) {
      els.chatPanelCitations.classList.add("hidden");
      return;
    }

    els.chatPanelCitations.classList.remove("hidden");
    const heading = document.createElement("p");
    heading.className = "chat-citations-heading";
    heading.textContent = "Sources";
    els.chatPanelCitations.appendChild(heading);

    citations.slice(0, 6).forEach((entry, index) => {
      const citation = normalizeCitation(entry, index);
      const note = citation.note || {};
      const item = document.createElement("div");
      item.className = "chat-citation-item";

      const title = document.createElement("span");
      title.className = "chat-citation-title";
      title.textContent = `[N${index + 1}] ${buildNoteTitle(note)}`;

      const meta = document.createElement("span");
      meta.className = "chat-citation-meta";
      meta.textContent = String(note.project || note.sourceType || "Saved item");

      const preview = document.createElement("span");
      preview.className = "chat-citation-preview";
      preview.textContent = buildContentPreview(note) || "Open this source";

      const actions = document.createElement("div");
      actions.className = "chat-citation-actions";

      const openInAppBtn = document.createElement("button");
      openInAppBtn.type = "button";
      openInAppBtn.className = "chat-citation-action";
      openInAppBtn.textContent = "Open item";
      openInAppBtn.addEventListener("click", () => {
        if (typeof onOpenCitation === "function") {
          onOpenCitation(note);
          return;
        }
      });

      actions.appendChild(openInAppBtn);

      const sourceUrl = String(note.sourceUrl || "").trim();
      if (sourceUrl) {
        const openSourceBtn = document.createElement("a");
        openSourceBtn.className = "chat-citation-action";
        openSourceBtn.href = sourceUrl;
        openSourceBtn.target = "_blank";
        openSourceBtn.rel = "noopener noreferrer";
        openSourceBtn.textContent = "Open source";
        actions.appendChild(openSourceBtn);
      }

      item.append(title, meta, preview, actions);
      els.chatPanelCitations.appendChild(item);
    });
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

  async function askQuestion(rawQuestion, { projectHint = "" } = {}) {
    if (isAsking) return false;
    const question = String(rawQuestion || "").trim();
    if (!question) return false;
    const project = String(projectHint || nextProjectHint || "").trim();
    nextProjectHint = "";

    addMessage("user", question);
    pushToStore("user", question);
    if (els.chatPanelInput) {
      els.chatPanelInput.value = "";
      els.chatPanelInput.style.height = "";
    }
    if (els.chatPanelCitations) {
      els.chatPanelCitations.classList.add("hidden");
      els.chatPanelCitations.innerHTML = "";
    }

    isAsking = true;

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

    try {
      await apiClient.askStreaming(
        { question, project: project || undefined },
        {
          onCitations(citations) {
            renderCitations(citations);
            saveCitationsToStore(citations);
          },
          onToken(token) {
            removeTyping();
            if (assistantMsg) {
              assistantMsg.textContent += token;
              els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;
            }
          },
          onDone() {
            removeTyping();
            if (assistantMsg && !assistantMsg.textContent.trim()) {
              assistantMsg.textContent = "No answer generated.";
            }
            updateLastAssistantInStore(assistantMsg?.textContent || "");
          },
          onError() {
            removeTyping();
            fallbackAsk(question, assistantMsg, project);
          },
        }
      );
      return true;
    } catch {
      removeTyping();
      await fallbackAsk(question, assistantMsg, project);
      return true;
    } finally {
      isAsking = false;
    }
  }

  async function handleSubmit() {
    const question = (els.chatPanelInput?.value || "").trim();
    if (!question) return;
    await askQuestion(question);
  }

  async function fallbackAsk(question, msgEl, projectHint = "") {
    try {
      const result = await apiClient.ask({ question, project: projectHint || undefined });
      if (msgEl) msgEl.textContent = result.text || "No answer.";
      updateLastAssistantInStore(msgEl?.textContent || "");
      if (result.citations) {
        renderCitations(result.citations);
        saveCitationsToStore(result.citations);
      }
    } catch (error) {
      if (msgEl) msgEl.textContent = "Failed to get answer.";
      updateLastAssistantInStore("Failed to get answer.");
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

  rebuildFromStore();

  return {
    askQuestion,
    isAsking: () => isAsking,
    startFromNote(note, { autoSubmit = true } = {}) {
      if (!note || !els.chatPanelInput) return;
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
