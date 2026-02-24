import { renderIcon } from "../../services/icons.js";

function escapeHtml(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeState(task = {}) {
  const explicitState = String(task?.state || "").trim().toLowerCase();
  if (explicitState === "pending_approval" || explicitState === "active" || explicitState === "paused") {
    return explicitState;
  }

  const approval = String(task?.approvalStatus || "").trim().toLowerCase();
  if (approval === "pending_approval") return "pending_approval";

  const status = String(task?.status || "").trim().toLowerCase();
  const enabled = task?.enabled === true;
  if (status === "active" && enabled) return "active";
  return "paused";
}

function formatRelativeDate(value = "") {
  const input = String(value || "").trim();
  if (!input) return "";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function stateLabel(state = "") {
  if (state === "pending_approval") return "Pending approval";
  if (state === "active") return "Active";
  return "Paused";
}

function formatPausedReason(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "auto_paused_after_failures") return "Auto-paused after failures";
  if (normalized === "manual_pause") return "Paused manually";
  return normalized.replaceAll("_", " ");
}

function formatRunStatus(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "succeeded") return "Last run succeeded";
  if (normalized === "failed") return "Last run failed";
  if (normalized === "running") return "Run in progress";
  return `Last run ${normalized}`;
}

function renderStateControl(task, state) {
  const id = String(task?.id || "").trim();
  if (!id) return "";

  const buttonClass = ["task-list-toggle-btn", `is-${state.replaceAll("_", "-")}`].join(" ");
  const iconName = state === "pending_approval" ? "check" : state === "active" ? "close" : "refresh";
  const action = "toggle";
  const label = state === "pending_approval"
    ? "Approve automation"
    : state === "active"
      ? "Pause automation"
      : "Resume automation";

  return `
    <button
      type="button"
      class="${buttonClass}"
      data-task-action="${action}"
      data-task-id="${escapeHtml(id)}"
      data-task-state="${escapeHtml(state)}"
      aria-label="${label}"
    >
      ${renderIcon(iconName, { size: 14 })}
    </button>
  `;
}

function renderTaskItem(task, { showStatus = true, allowEdit = true, allowDelete = true, allowRun = true } = {}) {
  const id = String(task?.id || "").trim();
  const title = String(task?.title || task?.name || "").trim();
  const prompt = String(task?.prompt || "").trim();
  const project = String(task?.project || task?.scopeFolder || "").trim();
  const state = normalizeState(task);
  const createdAt = formatRelativeDate(task?.createdAt);
  const nextRunAt = formatRelativeDate(task?.nextRunAt);
  const lastRunAt = formatRelativeDate(task?.lastRunAt);
  const lastRunStatusLabel = formatRunStatus(task?.lastRunStatus);
  const lastError = String(task?.lastError || "").trim();
  const pausedReason = formatPausedReason(task?.pausedReason);
  const lastRunMutationCount = Number(task?.lastRunMutationCount || 0);
  const consecutiveFailures = Number(task?.consecutiveFailures || 0);
  const maxConsecutiveFailures = Number(task?.maxConsecutiveFailures || 3);

  const safeTitle = escapeHtml(title || "Untitled automation");
  const safePrompt = escapeHtml(prompt);
  const safeProject = escapeHtml(project);
  const safeLastError = escapeHtml(lastError);
  const safePausedReason = escapeHtml(pausedReason);

  const telemetrySignals = [];
  if (lastRunStatusLabel) {
    telemetrySignals.push(
      `<span class="task-list-signal is-run-status">${escapeHtml(lastRunStatusLabel)}${lastRunAt ? ` ${escapeHtml(lastRunAt)}` : ""}</span>`,
    );
  }
  if (lastRunMutationCount > 0) {
    telemetrySignals.push(
      `<span class="task-list-signal is-mutations">Last mutations ${escapeHtml(String(lastRunMutationCount))}</span>`,
    );
  }
  if (consecutiveFailures > 0) {
    telemetrySignals.push(
      `<span class="task-list-signal is-failures">Failures ${escapeHtml(String(consecutiveFailures))}/${escapeHtml(String(maxConsecutiveFailures))}</span>`,
    );
  }
  if (state === "paused" && safePausedReason) {
    telemetrySignals.push(
      `<span class="task-list-signal is-paused-reason">${safePausedReason}</span>`,
    );
  }
  if (lastError) {
    telemetrySignals.push(
      `<span class="task-list-signal is-error" title="${safeLastError}">Error: ${safeLastError}</span>`,
    );
  }

  const runButton = allowRun && state !== "pending_approval"
    ? `
      <button
        type="button"
        class="task-list-action-btn"
        data-task-action="run"
        data-task-id="${escapeHtml(id)}"
        aria-label="Run automation now"
      >
        ${renderIcon("refresh", { size: 14 })}
      </button>
    `
    : "";

  const editButton = allowEdit
    ? `
      <button
        type="button"
        class="task-list-action-btn"
        data-task-action="edit"
        data-task-id="${escapeHtml(id)}"
        data-task-title="${safeTitle}"
        data-task-prompt="${safePrompt}"
        data-task-project="${safeProject}"
        aria-label="Edit automation"
      >
        ${renderIcon("edit", { size: 14 })}
      </button>
    `
    : "";

  const deleteButton = allowDelete
    ? `
      <button
        type="button"
        class="task-list-action-btn task-list-action-btn--danger"
        data-task-action="delete"
        data-task-id="${escapeHtml(id)}"
        aria-label="Delete automation"
      >
        ${renderIcon("trash", { size: 14 })}
      </button>
    `
    : "";

  return `
    <li class="task-list-item is-${state.replaceAll("_", "-")}" data-task-id="${escapeHtml(id)}">
      ${renderStateControl(task, state)}
      <div class="task-list-main">
        <p class="task-list-title">${safeTitle}</p>
        ${safePrompt ? `<p class="task-list-prompt">${safePrompt}</p>` : ""}
        <p class="task-list-meta">
          ${showStatus ? `<span class="task-list-status is-${state.replaceAll("_", "-")}">${stateLabel(state)}</span>` : ""}
          ${safeProject ? `<span class="task-list-project">${safeProject}</span>` : ""}
          ${createdAt ? `<span class="task-list-date">Created ${escapeHtml(createdAt)}</span>` : ""}
          ${nextRunAt && state !== "pending_approval" ? `<span class="task-list-date">Next ${escapeHtml(nextRunAt)}</span>` : ""}
        </p>
        ${telemetrySignals.length > 0 ? `<p class="task-list-telemetry">${telemetrySignals.join("")}</p>` : ""}
      </div>
      <div class="task-list-actions">
        ${runButton}
        ${editButton}
        ${deleteButton}
      </div>
    </li>
  `;
}

export function renderTaskListHTML({
  idBase = "task-list",
  title = "Tasks",
  subtitle = "",
  emptyText = "No tasks yet",
  showFilters = false,
  showComposer = true,
  composerPlaceholder = "Add automation title",
  showViewAll = false,
  viewAllHref = "#/tasks",
} = {}) {
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const safeEmptyText = escapeHtml(emptyText);
  const safeViewHref = escapeHtml(viewAllHref);

  return `
    <section class="task-list" data-component="task-list" data-id-base="${escapeHtml(idBase)}" aria-label="${safeTitle}">
      <div class="task-list-head">
        <div class="task-list-heading">
          <p class="task-list-title-label">${safeTitle}</p>
          ${safeSubtitle ? `<p class="task-list-subtitle">${safeSubtitle}</p>` : ""}
        </div>
        ${showViewAll ? `<a class="task-list-view-all" href="${safeViewHref}">View all</a>` : ""}
      </div>
      ${showFilters
        ? `
          <div class="task-list-filters" role="group" aria-label="Automation status">
            <button type="button" id="${escapeHtml(idBase)}-filter-pending" class="task-list-filter-btn" data-status-filter="pending_approval" aria-pressed="false">Pending</button>
            <button type="button" id="${escapeHtml(idBase)}-filter-active" class="task-list-filter-btn is-active" data-status-filter="active" aria-pressed="true">Active</button>
            <button type="button" id="${escapeHtml(idBase)}-filter-paused" class="task-list-filter-btn" data-status-filter="paused" aria-pressed="false">Paused</button>
            <button type="button" id="${escapeHtml(idBase)}-filter-all" class="task-list-filter-btn" data-status-filter="all" aria-pressed="false">All</button>
          </div>
        `
        : ""}
      ${showComposer
        ? `
          <form id="${escapeHtml(idBase)}-form" class="task-list-form">
            <input
              id="${escapeHtml(idBase)}-input"
              class="task-list-input"
              type="text"
              placeholder="${escapeHtml(composerPlaceholder)}"
              maxlength="180"
              aria-label="Automation title"
            />
            <button type="submit" class="task-list-submit-btn">Create</button>
          </form>
        `
        : ""}
      <ul id="${escapeHtml(idBase)}-items" class="task-list-items" aria-live="polite"></ul>
      <p id="${escapeHtml(idBase)}-empty" class="task-list-empty">${safeEmptyText}</p>
    </section>
  `;
}

export function queryTaskListEls(root, { idBase = "task-list" } = {}) {
  return {
    taskListRoot: root.querySelector(`[data-component="task-list"][data-id-base="${String(idBase || "")}"]`),
    taskListItems: root.querySelector(`#${String(idBase || "")}-items`),
    taskListEmpty: root.querySelector(`#${String(idBase || "")}-empty`),
    taskListForm: root.querySelector(`#${String(idBase || "")}-form`),
    taskListInput: root.querySelector(`#${String(idBase || "")}-input`),
    taskListFilterPending: root.querySelector(`#${String(idBase || "")}-filter-pending`),
    taskListFilterActive: root.querySelector(`#${String(idBase || "")}-filter-active`),
    taskListFilterPaused: root.querySelector(`#${String(idBase || "")}-filter-paused`),
    taskListFilterAll: root.querySelector(`#${String(idBase || "")}-filter-all`),
  };
}

export function setTaskListActiveFilter(els, nextFilter = "active") {
  const normalized = String(nextFilter || "active").trim().toLowerCase();
  const buttonMap = [
    { key: "pending_approval", el: els?.taskListFilterPending },
    { key: "active", el: els?.taskListFilterActive },
    { key: "paused", el: els?.taskListFilterPaused },
    { key: "all", el: els?.taskListFilterAll },
  ];
  for (const entry of buttonMap) {
    if (!entry.el) continue;
    const active = entry.key === normalized;
    entry.el.classList.toggle("is-active", active);
    entry.el.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

export function renderTaskListItems(
  els,
  tasks = [],
  {
    emptyText = "No tasks yet",
    showStatus = true,
    allowEdit = true,
    allowDelete = true,
    allowRun = true,
  } = {},
) {
  if (!els?.taskListItems || !els?.taskListEmpty) return;
  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) {
    els.taskListItems.innerHTML = "";
    els.taskListEmpty.textContent = String(emptyText || "No tasks yet");
    els.taskListEmpty.classList.remove("hidden");
    return;
  }
  els.taskListEmpty.classList.add("hidden");
  els.taskListItems.innerHTML = list
    .map((task) => renderTaskItem(task, { showStatus, allowEdit, allowDelete, allowRun }))
    .join("");
}

export function initTaskList(els, callbacks = {}) {
  const disposers = [];

  function on(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    disposers.push(() => target.removeEventListener(eventName, handler));
  }

  on(els?.taskListForm, "submit", async (event) => {
    event.preventDefault();
    const title = String(els?.taskListInput?.value || "").trim();
    if (!title) {
      els?.taskListInput?.focus();
      return;
    }
    if (typeof callbacks.onCreate === "function") {
      await callbacks.onCreate(title);
    }
    if (els?.taskListInput) {
      els.taskListInput.value = "";
    }
  });

  on(els?.taskListRoot, "click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-task-action]");
    if (!(button instanceof HTMLButtonElement)) return;
    const action = String(button.dataset.taskAction || "").trim();
    const taskId = String(button.dataset.taskId || "").trim();
    const state = String(button.dataset.taskState || "").trim().toLowerCase();
    const title = String(button.dataset.taskTitle || "").trim();
    const prompt = String(button.dataset.taskPrompt || "").trim();
    const project = String(button.dataset.taskProject || "").trim();
    if (!taskId && action !== "filter") return;

    if (action === "toggle" && typeof callbacks.onToggle === "function") {
      await callbacks.onToggle({ id: taskId, state });
      return;
    }
    if (action === "run" && typeof callbacks.onRun === "function") {
      await callbacks.onRun({ id: taskId });
      return;
    }
    if (action === "delete" && typeof callbacks.onDelete === "function") {
      await callbacks.onDelete({ id: taskId, title });
      return;
    }
    if (action === "edit" && typeof callbacks.onEdit === "function") {
      await callbacks.onEdit({ id: taskId, title, prompt, project });
    }
  });

  on(els?.taskListRoot, "click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const filterButton = target.closest("[data-status-filter]");
    if (!(filterButton instanceof HTMLButtonElement)) return;
    const status = String(filterButton.dataset.statusFilter || "").trim().toLowerCase();
    if (!status) return;
    setTaskListActiveFilter(els, status);
    if (typeof callbacks.onFilterChange === "function") {
      await callbacks.onFilterChange(status);
    }
  });

  return () => {
    for (const dispose of disposers) dispose();
  };
}
