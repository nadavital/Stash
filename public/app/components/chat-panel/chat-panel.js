import { buildNoteTitle, buildContentPreview, normalizeCitation } from "../../services/mappers.js";
import { renderMarkdownInto } from "../../services/markdown.js";
import { renderIcon } from "../../services/icons.js";

const MAX_MESSAGES = 100;

export function renderChatPanelHTML() {
  const attachIcon = renderIcon("attach", { size: 15 });
  const sendIcon = renderIcon("arrow-up", { size: 16 });
  const newChatIcon = renderIcon("square-pen", { size: 15, strokeWidth: 1.9 });
  return `
    <div id="chat-panel" class="chat-panel" aria-label="Chat with your notes">
      <div class="chat-panel-header">
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
    if (!els.chatPanelPending) return;
    if (isPending) {
      els.chatPanelPending.textContent = text || "Generating response...";
      els.chatPanelPending.classList.remove("hidden");
      return;
    }
    els.chatPanelPending.textContent = "";
    els.chatPanelPending.classList.add("hidden");
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
      renderMarkdownInto(body, rawText);
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
      title.textContent = buildNoteTitle(note);

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

  function renderWebSources(sources = []) {
    if (!els.chatPanelWebSources) return;
    const normalized = Array.isArray(sources)
      ? sources
          .map((entry) => ({
            url: String(entry?.url || "").trim(),
            title: String(entry?.title || "").trim(),
          }))
          .filter((entry) => entry.url)
          .slice(0, 8)
      : [];
    els.chatPanelWebSources.innerHTML = "";
    if (!normalized.length) {
      els.chatPanelWebSources.classList.add("hidden");
      return;
    }

    els.chatPanelWebSources.classList.remove("hidden");
    const heading = document.createElement("p");
    heading.className = "chat-citations-heading";
    heading.textContent = "Web sources";
    els.chatPanelWebSources.appendChild(heading);

    normalized.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "chat-citation-item";

      const title = document.createElement("span");
      title.className = "chat-citation-title";
      title.textContent = entry.title || entry.url;

      const meta = document.createElement("span");
      meta.className = "chat-citation-meta";
      meta.textContent = "Web";

      const preview = document.createElement("span");
      preview.className = "chat-citation-preview";
      preview.textContent = entry.url;

      const actions = document.createElement("div");
      actions.className = "chat-citation-actions";

      const openSourceBtn = document.createElement("a");
      openSourceBtn.className = "chat-citation-action";
      openSourceBtn.href = entry.url;
      openSourceBtn.target = "_blank";
      openSourceBtn.rel = "noopener noreferrer";
      openSourceBtn.textContent = "Open source";
      actions.appendChild(openSourceBtn);

      item.append(title, meta, preview, actions);
      els.chatPanelWebSources.appendChild(item);
    });
  }

  function clearConversation() {
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
    let recoveryPromise = null;

    try {
      await apiClient.askStreaming(
        {
          question: question || "Save this attachment to Stash.",
          project: project || undefined,
          contextNoteId: contextNoteId || undefined,
          scope: scopePayload.scope,
          workingSetIds: scopePayload.workingSetIds,
          captureIntent: hasAttachment ? "save" : "",
          imageDataUrl: hasAttachment && attachment.isImage ? attachment.fileDataUrl : undefined,
          fileDataUrl: hasAttachment ? attachment.fileDataUrl : undefined,
          fileName: hasAttachment ? attachment.fileName : undefined,
          fileMimeType: hasAttachment ? attachment.fileMimeType : undefined,
        },
        {
          onCitations(citations) {
            renderCitations(citations);
            saveCitationsToStore(citations);
          },
          onWebSources(sources) {
            renderWebSources(sources);
          },
          onToken(token) {
            removeTyping();
            const toolStatus = assistantMsg?.querySelector(".chat-tool-status");
            if (toolStatus) toolStatus.remove();
            setPendingState(true, "Generating response...");
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
            };
            const pendingLabel = statusMap[name] || "Working...";
            setPendingState(true, pendingLabel);
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
            setPendingState(false);
            if (assistantMsg && !getMessageRawText(assistantMsg).trim()) {
              setMessageBodyText(assistantMsg, "assistant", "No answer generated.");
            }
            updateLastAssistantInStore(getMessageRawText(assistantMsg));
          },
          onError() {
            removeTyping();
            setPendingState(true, "Recovering response...");
            recoveryPromise = fallbackAsk(
              question || "Save this attachment to Stash.",
              assistantMsg,
              project,
              contextNoteId,
              scopePayload,
              attachment
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
      await fallbackAsk(question || "Save this attachment to Stash.", assistantMsg, project, contextNoteId, scopePayload, attachment);
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

  async function fallbackAsk(question, msgEl, projectHint = "", contextNoteId = "", scopePayload = null, attachment = null) {
    try {
      const hasAttachment = Boolean(attachment?.fileDataUrl);
      const result = await apiClient.ask({
        question,
        project: projectHint || undefined,
        contextNoteId: contextNoteId || undefined,
        scope: scopePayload?.scope || "all",
        workingSetIds: Array.isArray(scopePayload?.workingSetIds) ? scopePayload.workingSetIds : [],
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
      if (result.citations) {
        renderCitations(result.citations);
        saveCitationsToStore(result.citations);
      }
      renderWebSources(result.webSources || []);
    } catch (error) {
      if (msgEl) setMessageBodyText(msgEl, "assistant", "Failed to get answer.");
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

  addHandler(els.chatPanelNewChat, "click", () => {
    if (isAsking) return;
    clearConversation();
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
