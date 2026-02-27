const DEFAULT_TASK_PROPOSAL_ACTIONS = ["Create it", "Cancel"];
const TASK_PROPOSAL_CREATE_ACTION = "create it";
const TASK_PROPOSAL_CANCEL_ACTION = "cancel";

function normalizeTaskSpecPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized.length > 20000) return null;
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toTrimmedText(value = "", maxLen = 140, stripInternalReferenceTokens = null) {
  const strip = typeof stripInternalReferenceTokens === "function"
    ? stripInternalReferenceTokens
    : (entry) => String(entry || "");
  return strip(value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function normalizeSingleSentence(value, maxLen = 140, stripInternalReferenceTokens = null) {
  const text = toTrimmedText(value, 400, stripInternalReferenceTokens);
  if (!text) return "";
  const firstQuestion = text.match(/[^?]{1,300}\?/);
  if (firstQuestion?.[0]) {
    return firstQuestion[0].trim().slice(0, maxLen);
  }
  const firstSentence = text.split(/[.!](?:\s|$)/)[0] || text;
  return firstSentence.trim().slice(0, maxLen);
}

function isActionLikeOption(option = "") {
  const value = String(option || "").trim().toLowerCase();
  if (!value) return false;
  return /^(share|use|tell|ask|click|enter|provide|set|pick|choose)\b/.test(value);
}

function isGenericOtherOption(option = "") {
  const value = String(option || "").trim().toLowerCase();
  if (!value) return false;
  return /^(other|something else|anything else|else|another option|not sure|none of these|none|custom|type it)\b/i.test(value);
}

function normalizeTaskActionLabel(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isTaskProposalCreateAction(actionLabel = "") {
  const normalized = normalizeTaskActionLabel(actionLabel);
  return normalized === TASK_PROPOSAL_CREATE_ACTION
    || normalized === "create"
    || normalized === "confirm";
}

function isTaskProposalCancelAction(actionLabel = "") {
  return normalizeTaskActionLabel(actionLabel) === TASK_PROPOSAL_CANCEL_ACTION;
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

function inferTimeHintFromText(value = "") {
  const text = String(value || "").toLowerCase();
  if (!text) return "";
  const explicitTime = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (explicitTime?.[0]) {
    return explicitTime[0].toUpperCase().replace(/\s+/g, " ");
  }
  if (/\bmorning\b/.test(text)) return "Morning";
  if (/\bafternoon\b/.test(text)) return "Afternoon";
  if (/\bevening\b/.test(text)) return "Evening";
  if (/\bnight\b/.test(text)) return "Night";
  if (/\bnoon\b/.test(text)) return "Noon";
  return "";
}

function formatTaskProposalTime(nextRunAt = "", timezone = "") {
  const raw = String(nextRunAt || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const resolvedTimezone = String(timezone || "").trim();
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      ...(resolvedTimezone ? { timeZone: resolvedTimezone } : {}),
    }).format(parsed);
  } catch {
    return "";
  }
}

function formatScheduleInterval(intervalMinutes) {
  const minutes = Math.max(1, Number(intervalMinutes) || 0);
  if (!minutes) return "";
  if (minutes % 1440 === 0) {
    const days = Math.floor(minutes / 1440);
    return days === 1 ? "Daily" : `Every ${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? "Hourly" : `Every ${hours} hours`;
  }
  return `Every ${minutes} minutes`;
}

function formatTaskProposalSchedule(proposal) {
  if (!proposal || proposal.scheduleType !== "interval") return "Manual";
  const cadence = formatScheduleInterval(proposal.intervalMinutes) || "Interval";
  const exactTime = formatTaskProposalTime(proposal.nextRunAt, proposal.timezone);
  if (exactTime && /daily/i.test(cadence)) {
    return `${cadence} at ${exactTime}`;
  }
  if (exactTime) {
    return `${cadence} \u00B7 ${exactTime}`;
  }
  const hint = inferTimeHintFromText(`${proposal.title || ""} ${proposal.summary || ""}`);
  if (!hint) return cadence;
  return `${cadence} (${hint.toLowerCase()} window)`;
}

function formatTaskProposalDestination(proposal) {
  const folder = String(proposal?.scopeFolder || "").trim();
  return folder ? folder : "Workspace root";
}

function doesTaskProposalPayloadMatch(entryPayload = null, targetPayload = null, stripInternalReferenceTokens = null) {
  if (!entryPayload || !targetPayload) return false;
  const entrySignature = toTrimmedText(entryPayload.proposalSignature, 80, stripInternalReferenceTokens).toLowerCase();
  const targetSignature = toTrimmedText(targetPayload.proposalSignature, 80, stripInternalReferenceTokens).toLowerCase();
  if (entrySignature && targetSignature) {
    return entrySignature === targetSignature;
  }
  const entryTitle = toTrimmedText(entryPayload.title, 120, stripInternalReferenceTokens).toLowerCase();
  const targetTitle = toTrimmedText(targetPayload.title, 120, stripInternalReferenceTokens).toLowerCase();
  const entryPrompt = toTrimmedText(entryPayload.prompt, 400, stripInternalReferenceTokens).toLowerCase();
  const targetPrompt = toTrimmedText(targetPayload.prompt, 400, stripInternalReferenceTokens).toLowerCase();
  return Boolean(entryTitle && targetTitle && entryPrompt && targetPrompt
    && entryTitle === targetTitle
    && entryPrompt === targetPrompt);
}

export function createFollowUpCardsController({
  apiClient = null,
  toast = null,
  onWorkspaceAction = null,
  onAuthExpired = null,
  askQuestion = null,
  isAsking = null,
  getPendingFollowUps = null,
  setPendingFollowUps = null,
  stripInternalReferenceTokens = null,
  taskProposalActions = DEFAULT_TASK_PROPOSAL_ACTIONS,
} = {}) {
  const isBusy = typeof isAsking === "function" ? isAsking : () => false;

  function normalizeAskUserQuestionPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    const question = normalizeSingleSentence(payload.question, 140, stripInternalReferenceTokens);
    if (!question) return null;
    const validModes = new Set(["freeform_only", "choices_only", "choices_plus_freeform"]);
    const rawAnswerMode = String(payload.answerMode || "").trim().toLowerCase();
    const options = Array.isArray(payload.options)
      ? payload.options
          .map((opt) => normalizeSingleSentence(opt, 60, stripInternalReferenceTokens))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const filteredOptions = options.filter((option) => !isActionLikeOption(option));
    const answerMode = validModes.has(rawAnswerMode)
      ? rawAnswerMode
      : (filteredOptions.length >= 2 ? "choices_plus_freeform" : "freeform_only");
    let resolvedMode =
      answerMode === "choices_only" && filteredOptions.length === 0 ? "freeform_only" : answerMode;
    let resolvedOptions = resolvedMode === "freeform_only"
      ? []
      : filteredOptions.filter((option) => !isGenericOtherOption(option));
    if (resolvedMode !== "freeform_only" && resolvedOptions.length < 2) {
      resolvedMode = "freeform_only";
      resolvedOptions = [];
    }
    return {
      question,
      options: resolvedOptions,
      answerMode: resolvedMode,
      context: normalizeSingleSentence(payload.context, 120, stripInternalReferenceTokens),
    };
  }

  function normalizeTaskProposalPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    const source = payload.proposal && typeof payload.proposal === "object" ? payload.proposal : payload;
    const proposalSignature = toTrimmedText(source.proposalSignature, 80, stripInternalReferenceTokens);
    const title = toTrimmedText(source.title || source.name, 120, stripInternalReferenceTokens);
    if (!title) return null;
    const prompt = toTrimmedText(source.prompt || title, 2000, stripInternalReferenceTokens) || title;
    const scopeFolder = toTrimmedText(source.scopeFolder || source.project, 120, stripInternalReferenceTokens);
    const timezone = toTrimmedText(source.timezone, 80, stripInternalReferenceTokens);
    const rawNextRunAt = String(source.nextRunAt || "").trim();
    const parsedNextRunAt = rawNextRunAt ? new Date(rawNextRunAt) : null;
    const nextRunAt = parsedNextRunAt && !Number.isNaN(parsedNextRunAt.getTime())
      ? parsedNextRunAt.toISOString()
      : "";
    const scheduleType = String(source.scheduleType || (source.intervalMinutes ? "interval" : "manual"))
      .trim()
      .toLowerCase();
    const intervalMinutesRaw = Number(source.intervalMinutes);
    const intervalMinutes = Number.isFinite(intervalMinutesRaw) && intervalMinutesRaw > 0
      ? Math.floor(intervalMinutesRaw)
      : null;
    const summary = toTrimmedText(source.summary || prompt, 160, stripInternalReferenceTokens);
    const normalizedTitle = title.toLowerCase();
    const normalizedSummary = summary.toLowerCase();
    const distinctSummary = normalizedSummary && normalizedSummary !== normalizedTitle
      ? summary
      : "";
    const maxActionsRaw = Number(source.maxActionsPerRun);
    const maxConsecutiveRaw = Number(source.maxConsecutiveFailures);
    const maxActionsPerRun = Number.isFinite(maxActionsRaw) ? Math.max(1, Math.min(25, Math.floor(maxActionsRaw))) : 4;
    const maxConsecutiveFailures = Number.isFinite(maxConsecutiveRaw)
      ? Math.max(1, Math.min(20, Math.floor(maxConsecutiveRaw)))
      : 3;
    const spec = normalizeTaskSpecPayload(source.spec);
    const actions = Array.isArray(source.actions)
      ? source.actions.map((label) => toTrimmedText(label, 80, stripInternalReferenceTokens)).filter(Boolean).slice(0, 3)
      : taskProposalActions;
    return {
      title,
      summary: distinctSummary,
      prompt,
      scopeFolder,
      scheduleType: scheduleType === "interval" ? "interval" : "manual",
      intervalMinutes: scheduleType === "interval" ? (intervalMinutes || 1440) : null,
      timezone,
      nextRunAt,
      maxActionsPerRun,
      maxConsecutiveFailures,
      dryRun: source.dryRun === true,
      ...(spec ? { spec } : {}),
      ...(proposalSignature ? { proposalSignature } : {}),
      actions: actions.length ? actions : taskProposalActions,
    };
  }

  function buildTaskProposalContextText(proposal = null) {
    if (!proposal) return "";
    const bits = [
      `Task proposal: ${proposal.title}.`,
      proposal.summary ? `Summary: ${proposal.summary}.` : "",
      `Schedule: ${formatTaskProposalSchedule(proposal)}.`,
      `Destination: ${formatTaskProposalDestination(proposal)}.`,
    ];
    return bits.filter(Boolean).join(" ").slice(0, 500);
  }

  function removePendingTaskProposalEntry(messageId = "", proposalPayload = null) {
    if (typeof getPendingFollowUps !== "function" || typeof setPendingFollowUps !== "function") return;
    const normalizedMessageId = String(messageId || "").trim();
    const entries = getPendingFollowUps();
    if (!entries.length) return;
    let removed = false;
    const nextEntries = entries.filter((entry) => {
      if (removed) return true;
      if (!entry || entry.kind !== "task_proposal") return true;
      if (normalizedMessageId && entry.messageId !== normalizedMessageId) return true;
      if (proposalPayload && !doesTaskProposalPayloadMatch(entry.payload, proposalPayload, stripInternalReferenceTokens)) return true;
      removed = true;
      return false;
    });
    if (removed) {
      setPendingFollowUps(nextEntries);
    }
  }

  function setTaskProposalCardState(card, { state = "draft", detail = "" } = {}) {
    if (!(card instanceof HTMLElement)) return;
    const normalizedState = ["draft", "saving", "created", "canceled", "error"].includes(state)
      ? state
      : "draft";
    card.dataset.proposalState = normalizedState;
    card.classList.toggle("is-pending", normalizedState === "saving");
    card.classList.toggle("is-created", normalizedState === "created");
    card.classList.toggle("is-canceled", normalizedState === "canceled");
    card.classList.toggle("is-error", normalizedState === "error");
    card.classList.toggle("is-answered", normalizedState === "created" || normalizedState === "canceled");

    const label = card.querySelector(".chat-task-proposal-label");
    if (label) {
      label.textContent = normalizedState === "saving"
        ? "Saving automation"
        : normalizedState === "created"
          ? "Automation saved"
          : normalizedState === "canceled"
            ? "Canceled"
            : normalizedState === "error"
              ? "Save failed"
              : "Task proposal";
    }

    const hint = card.querySelector(".chat-task-proposal-hint");
    if (hint) {
      hint.textContent = normalizedState === "saving"
        ? "Saving automation..."
        : normalizedState === "created"
          ? "This proposal has been saved."
          : normalizedState === "canceled"
            ? "This proposal was not saved."
            : normalizedState === "error"
              ? "Could not save this proposal. You can retry."
              : "To revise details, type your changes in the composer.";
    }

    const status = card.querySelector(".chat-task-proposal-status");
    if (status) {
      const message = String(detail || "").trim();
      status.textContent = message;
      status.classList.toggle("hidden", !message);
    }

    const actionsWrap = card.querySelector(".chat-task-proposal-actions");
    if (!actionsWrap) return;
    if (normalizedState === "created" || normalizedState === "canceled") {
      actionsWrap.remove();
      return;
    }
    const disable = isBusy() || normalizedState === "saving";
    actionsWrap.querySelectorAll(".chat-task-proposal-action").forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = disable;
      }
    });
  }

  function buildTaskCreatePayload(proposal = {}, { requireApproval = true, activate = false } = {}) {
    const scheduleType = String(proposal.scheduleType || "manual").trim().toLowerCase() === "interval"
      ? "interval"
      : "manual";
    const intervalValue = Number(proposal.intervalMinutes);
    return {
      title: proposal.title,
      prompt: proposal.prompt || proposal.title,
      scopeFolder: proposal.scopeFolder || undefined,
      scheduleType,
      ...(scheduleType === "interval"
        ? {
            intervalMinutes: Number.isFinite(intervalValue) && intervalValue > 0
              ? Math.floor(intervalValue)
              : 1440,
          }
        : {}),
      timezone: proposal.timezone || undefined,
      nextRunAt: proposal.nextRunAt || undefined,
      maxActionsPerRun: Number.isFinite(Number(proposal.maxActionsPerRun))
        ? Math.max(1, Math.min(25, Math.floor(Number(proposal.maxActionsPerRun))))
        : 4,
      maxConsecutiveFailures: Number.isFinite(Number(proposal.maxConsecutiveFailures))
        ? Math.max(1, Math.min(20, Math.floor(Number(proposal.maxConsecutiveFailures))))
        : 3,
      dryRun: proposal.dryRun === true,
      ...(proposal.spec && typeof proposal.spec === "object" ? { spec: proposal.spec } : {}),
      requireApproval,
      activate: activate === true,
    };
  }

  async function createTaskFromProposal(proposal = null) {
    if (!proposal || typeof proposal !== "object" || !apiClient) {
      throw new Error("Invalid task proposal payload");
    }
    const shouldActivate = String(proposal.scheduleType || "").trim().toLowerCase() === "interval";
    try {
      return await apiClient.createTask(
        buildTaskCreatePayload(proposal, { requireApproval: false, activate: shouldActivate })
      );
    } catch (error) {
      const status = Number(error?.status || error?.payload?.status || 0);
      const message = String(error?.message || "").toLowerCase();
      const requiresApproval = status === 403
        || message.includes("pre-approved")
        || message.includes("only workspace admins");
      if (!requiresApproval) {
        throw error;
      }
      return apiClient.createTask(
        buildTaskCreatePayload(proposal, { requireApproval: true, activate: false })
      );
    }
  }

  function buildTaskSavedDetail(task = null) {
    const approvalStatus = String(task?.approvalStatus || "").trim().toLowerCase();
    const status = String(task?.status || "").trim().toLowerCase();
    if (approvalStatus === "pending_approval") return "Saved. Waiting for approval.";
    if (status === "active") return "Saved and active.";
    if (status === "paused") return "Saved and paused.";
    return "Saved.";
  }

  function emitTaskCreatedWorkspaceAction(task = null) {
    if (typeof onWorkspaceAction !== "function" || !task || typeof task !== "object") return;
    const taskId = String(task.id || "").trim();
    onWorkspaceAction({
      phase: "commit",
      name: "create_task",
      entityType: "task",
      entityId: taskId,
      result: {
        taskId,
        task,
      },
    });
  }

  async function handleTaskProposalAction({ actionLabel = "", proposal = null, card = null, messageId = "" } = {}) {
    if (!proposal || typeof proposal !== "object" || !(card instanceof HTMLElement) || isBusy()) return;
    if (isTaskProposalCancelAction(actionLabel)) {
      removePendingTaskProposalEntry(messageId, proposal);
      setTaskProposalCardState(card, { state: "canceled", detail: "Automation creation canceled." });
      return;
    }
    if (!isTaskProposalCreateAction(actionLabel)) {
      if (typeof askQuestion === "function") void askQuestion(actionLabel);
      return;
    }

    const currentState = String(card.dataset.proposalState || "draft").trim().toLowerCase();
    if (currentState === "saving" || currentState === "created") return;
    setTaskProposalCardState(card, { state: "saving", detail: "Saving automation..." });

    try {
      const created = await createTaskFromProposal(proposal);
      const task = created?.task && typeof created.task === "object" ? created.task : null;
      removePendingTaskProposalEntry(messageId, proposal);
      setTaskProposalCardState(card, {
        state: "created",
        detail: buildTaskSavedDetail(task),
      });
      emitTaskCreatedWorkspaceAction(task);
    } catch (error) {
      const statusCode = Number(error?.status || error?.payload?.status || 0);
      const authExpired = statusCode === 401 || /not authenticated/i.test(String(error?.message || ""));
      if (authExpired && typeof onAuthExpired === "function") onAuthExpired();
      const fallbackDetail = authExpired
        ? "Session expired. Please sign in again."
        : (String(error?.message || "Could not save automation.").trim() || "Could not save automation.");
      setTaskProposalCardState(card, { state: "error", detail: fallbackDetail });
      if (typeof toast === "function") toast(fallbackDetail, "error");
    }
  }

  function renderTaskProposalPrompt(msgEl, payload = null) {
    const proposal = normalizeTaskProposalPayload(payload);
    if (!msgEl || !proposal) return;
    const proposalKey = [
      proposal.proposalSignature || "",
      proposal.title,
      proposal.summary,
      proposal.scheduleType,
      proposal.intervalMinutes,
    ].join("|").toLowerCase();
    const duplicate = Array.from(msgEl.querySelectorAll(".chat-task-proposal")).some(
      (node) => String(node?.dataset?.proposalKey || "") === proposalKey
    );
    if (duplicate) return;

    const card = document.createElement("section");
    card.className = "chat-task-proposal";
    card.dataset.proposalKey = proposalKey;
    card.dataset.proposalContextText = buildTaskProposalContextText(proposal);
    card.dataset.proposalState = "draft";
    card.dataset.messageId = String(msgEl?.dataset?.messageId || "").trim();
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "Task proposal");

    const label = document.createElement("p");
    label.className = "chat-task-proposal-label";
    label.textContent = "Task proposal";

    const title = document.createElement("h4");
    title.className = "chat-task-proposal-title";
    title.textContent = proposal.title;

    const meta = document.createElement("p");
    meta.className = "chat-task-proposal-meta";
    meta.textContent = formatTaskProposalSchedule(proposal);

    const destination = document.createElement("p");
    destination.className = "chat-task-proposal-destination";
    destination.textContent = `Saves to ${formatTaskProposalDestination(proposal)}`;

    const summary = proposal.summary
      ? Object.assign(document.createElement("p"), {
          className: "chat-task-proposal-summary",
          textContent: proposal.summary,
        })
      : null;

    const actions = document.createElement("div");
    actions.className = "chat-task-proposal-actions";
    proposal.actions.forEach((actionLabel, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chat-task-proposal-action${index === 0 ? " is-primary" : ""}`;
      button.textContent = actionLabel;
      button.disabled = isBusy();
      button.addEventListener("click", () => {
        if (isBusy()) return;
        void handleTaskProposalAction({
          actionLabel,
          proposal,
          card,
          messageId: card.dataset.messageId || "",
        });
      });
      actions.appendChild(button);
    });

    const status = document.createElement("p");
    status.className = "chat-task-proposal-status hidden";
    status.setAttribute("aria-live", "polite");

    const hint = document.createElement("p");
    hint.className = "chat-task-proposal-hint";
    hint.textContent = "To revise details, type your changes in the composer.";

    card.append(label, title, meta, destination, ...(summary ? [summary] : []), actions, status, hint);
    setTaskProposalCardState(card, { state: "draft" });
    msgEl.appendChild(card);
  }

  function renderAskUserQuestionPrompt(msgEl, payload = null, { assistantText = "" } = {}) {
    const normalized = normalizeAskUserQuestionPayload(payload);
    if (!msgEl || !normalized) return;
    const { question, options, answerMode } = normalized;
    const showOptions = answerMode !== "freeform_only" && options.length > 0;
    const showFreeform = answerMode !== "choices_only";
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

    if (showOptions) {
      const optionsWrap = document.createElement("div");
      optionsWrap.className = "chat-question-options";
      options.forEach((option) => {
        const optionBtn = document.createElement("button");
        optionBtn.type = "button";
        optionBtn.className = "chat-question-option";
        optionBtn.textContent = option;
        optionBtn.disabled = isBusy();
        optionBtn.addEventListener("click", () => {
          if (isBusy()) return;
          if (typeof askQuestion === "function") void askQuestion(option);
        });
        optionsWrap.appendChild(optionBtn);
      });
      prompt.appendChild(optionsWrap);
    }

    if (showFreeform) {
      const form = document.createElement("form");
      form.className = "chat-question-form";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (isBusy()) return;
        const value = String(input.value || "").trim();
        if (!value) return;
        input.value = "";
        if (typeof askQuestion === "function") void askQuestion(value);
      });

      const input = document.createElement("input");
      input.type = "text";
      input.className = "chat-question-input";
      input.placeholder = "Type a response...";
      input.autocomplete = "off";
      input.disabled = isBusy();
      input.setAttribute("aria-label", "Type your response");

      const submit = document.createElement("button");
      submit.type = "submit";
      submit.className = "chat-question-submit";
      submit.textContent = "Reply";
      submit.disabled = isBusy();

      form.append(input, submit);
      prompt.appendChild(form);

      const hint = document.createElement("p");
      hint.className = "chat-question-hint";
      hint.textContent = "You can also reply directly in the main chat input.";
      prompt.appendChild(hint);
    }

    msgEl.appendChild(prompt);
  }

  function compactLatestFollowUp(container) {
    if (!(container instanceof HTMLElement)) return;
    const prompts = Array.from(
      container.querySelectorAll(".chat-user-question:not(.is-answered), .chat-task-proposal:not(.is-answered)")
    );
    if (!prompts.length) return;
    const prompt = prompts[prompts.length - 1];
    if (prompt.classList.contains("chat-task-proposal")) {
      prompt.classList.add("is-answered");
      prompt.querySelector(".chat-task-proposal-actions")?.remove();
      return;
    }
    prompt.classList.add("is-answered", "chat-user-question--compact");
    prompt.querySelector(".chat-question-options")?.remove();
    prompt.querySelector(".chat-question-form")?.remove();
    prompt.querySelector(".chat-question-hint")?.remove();
    const label = prompt.querySelector(".chat-question-label");
    if (label) label.textContent = "Answered";
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

  return {
    normalizeAskUserQuestionPayload,
    normalizeTaskProposalPayload,
    normalizePendingFollowUpEntry,
    buildTaskProposalContextText,
    renderTaskProposalPrompt,
    renderAskUserQuestionPrompt,
    compactLatestFollowUp,
  };
}
