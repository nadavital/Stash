import { buildNoteTitle, buildContentPreview, normalizeCitation } from "../../services/mappers.js";

export function renderChatPanelHTML() {
  return `
    <div id="chat-panel" class="chat-panel hidden" aria-label="Chat with your notes">
      <div class="chat-panel-header">
        <h4 class="chat-panel-heading">Ask your notes</h4>
        <button id="chat-panel-close" class="chat-panel-close" type="button" aria-label="Close chat">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>
        </button>
      </div>
      <div id="chat-panel-messages" class="chat-panel-messages"></div>
      <div class="chat-panel-citations hidden" id="chat-panel-citations"></div>
      <form id="chat-panel-form" class="chat-panel-form">
        <input id="chat-panel-input" class="chat-panel-input" type="text" placeholder="Ask a question..." autocomplete="off" />
        <button id="chat-panel-send" class="chat-panel-send" type="submit" aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2L7 9M14 2L10 14L7 9L2 6L14 2Z"/>
          </svg>
        </button>
      </form>
    </div>
  `;
}

export function queryChatPanelEls(root) {
  return {
    chatPanel: root.querySelector("#chat-panel"),
    chatPanelClose: root.querySelector("#chat-panel-close"),
    chatPanelMessages: root.querySelector("#chat-panel-messages"),
    chatPanelCitations: root.querySelector("#chat-panel-citations"),
    chatPanelForm: root.querySelector("#chat-panel-form"),
    chatPanelInput: root.querySelector("#chat-panel-input"),
    chatPanelSend: root.querySelector("#chat-panel-send"),
  };
}

export function initChatPanel(els, { apiClient, toast, onOpenCitation } = {}) {
  const handlers = [];
  let isAsking = false;
  let nextProjectHint = "";

  function addHandler(target, event, handler) {
    if (!target) return;
    target.addEventListener(event, handler);
    handlers.push(() => target.removeEventListener(event, handler));
  }

  function togglePanel(show) {
    if (!els.chatPanel) return;
    if (typeof show === "boolean") {
      els.chatPanel.classList.toggle("hidden", !show);
    } else {
      els.chatPanel.classList.toggle("hidden");
    }
    if (!els.chatPanel.classList.contains("hidden")) {
      els.chatPanelInput?.focus();
    }
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

  async function handleSubmit() {
    if (isAsking) return;
    const question = (els.chatPanelInput?.value || "").trim();
    if (!question) return;
    const project = nextProjectHint;
    nextProjectHint = "";

    addMessage("user", question);
    if (els.chatPanelInput) els.chatPanelInput.value = "";
    if (els.chatPanelCitations) {
      els.chatPanelCitations.classList.add("hidden");
      els.chatPanelCitations.innerHTML = "";
    }

    isAsking = true;
    const assistantMsg = addMessage("assistant", "");

    try {
      await apiClient.askStreaming(
        { question, project: project || undefined },
        {
          onCitations(citations) {
            renderCitations(citations);
          },
          onToken(token) {
            if (assistantMsg) {
              assistantMsg.textContent += token;
              els.chatPanelMessages.scrollTop = els.chatPanelMessages.scrollHeight;
            }
          },
          onDone() {
            if (assistantMsg && !assistantMsg.textContent.trim()) {
              assistantMsg.textContent = "No answer generated.";
            }
          },
          onError(error) {
            // Fallback to non-streaming
            fallbackAsk(question, assistantMsg);
          },
        }
      );
    } catch {
      await fallbackAsk(question, assistantMsg);
    } finally {
      isAsking = false;
    }
  }

  async function fallbackAsk(question, msgEl) {
    try {
      const result = await apiClient.ask({ question });
      if (msgEl) msgEl.textContent = result.text || "No answer.";
      if (result.citations) renderCitations(result.citations);
    } catch (error) {
      if (msgEl) msgEl.textContent = "Failed to get answer.";
    }
  }

  addHandler(els.chatPanelClose, "click", () => togglePanel(false));
  addHandler(els.chatPanelForm, "submit", (e) => {
    e.preventDefault();
    handleSubmit();
  });

  return {
    toggle: togglePanel,
    startFromNote(note, { autoSubmit = true } = {}) {
      if (!note || !els.chatPanelInput) return;
      nextProjectHint = String(note.project || "").trim();
      togglePanel(true);
      els.chatPanelInput.value = buildItemContextQuestion(note);
      if (autoSubmit) {
        handleSubmit();
      }
    },
    dispose: () => handlers.forEach((fn) => fn()),
  };
}
