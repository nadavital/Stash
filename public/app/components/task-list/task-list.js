import { renderIcon } from "../../services/icons.js";

const MORE_ICON = renderIcon("ellipsis-vertical", { size: 16, strokeWidth: 2 });

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

function stateActionLabel(state = "") {
  if (state === "pending_approval") return "Approve";
  if (state === "active") return "Pause";
  return "Resume";
}

function stateLabel(state = "") {
  if (state === "pending_approval") return "Pending approval";
  if (state === "active") return "Active";
  return "Paused";
}

function formatCompactDateTime(value = "") {
  const input = String(value || "").trim();
  if (!input) return "";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatTimeOnly(value = "") {
  const input = String(value || "").trim();
  if (!input) return "";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatScheduleInterval(intervalMinutes = 0) {
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

function formatTaskSchedule(task = {}) {
  const scheduleType = String(task?.scheduleType || "").trim().toLowerCase();
  if (scheduleType !== "interval") return "Manual";
  const cadence = formatScheduleInterval(task?.intervalMinutes || 0) || "Interval";
  const nextRunAt = formatCompactDateTime(task?.nextRunAt);
  const nextRunTime = formatTimeOnly(task?.nextRunAt);
  if (nextRunTime && /daily/i.test(cadence)) {
    return `${cadence} at ${nextRunTime}`;
  }
  if (nextRunAt) {
    return `${cadence} \u00b7 ${nextRunAt}`;
  }
  return cadence;
}

function formatTaskDestination(task = {}) {
  const scopeFolder = String(task?.scopeFolder || task?.project || "").trim();
  return scopeFolder || "Workspace root";
}

function renderTaskActionButton({
  action = "",
  label = "",
  taskId = "",
  state = "",
  title = "",
  tone = "default",
}) {
  if (!action || !label || !taskId) return "";
  return `
    <button
      type="button"
      class="task-list-menu-item${tone === "danger" ? " is-danger" : ""}"
      data-task-action="${escapeHtml(action)}"
      data-task-id="${escapeHtml(taskId)}"
      data-task-state="${escapeHtml(state)}"
      data-task-title="${escapeHtml(title)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderTaskActionMenu({
  taskId = "",
  state = "",
  title = "",
  allowRun = true,
  allowStateControl = true,
  allowEdit = true,
  allowDelete = false,
} = {}) {
  const menuItems = [
    allowRun && state !== "pending_approval"
      ? renderTaskActionButton({ action: "run", label: "Run now", taskId, state, title })
      : "",
    allowStateControl
      ? renderTaskActionButton({ action: "state", label: stateActionLabel(state), taskId, state, title })
      : "",
    allowEdit
      ? renderTaskActionButton({ action: "edit", label: "Edit", taskId, state, title })
      : "",
    allowDelete
      ? renderTaskActionButton({ action: "delete", label: "Delete", taskId, state, title, tone: "danger" })
      : "",
  ]
    .filter(Boolean)
    .join("");

  if (!menuItems) return "";

  return `
    <details class="task-list-menu" data-task-menu>
      <summary class="task-list-menu-trigger" aria-label="More actions">
        ${MORE_ICON}
      </summary>
      <div class="task-list-menu-panel" role="menu" aria-label="Automation actions">
        ${menuItems}
      </div>
    </details>
  `;
}

function renderTaskItem(
  task,
  {
    allowEdit = true,
    allowDelete = false,
    allowRun = true,
    allowOpen = true,
    allowStateControl = true,
    selectedTaskId = "",
  } = {},
) {
  const id = String(task?.id || "").trim();
  const title = String(task?.title || task?.name || "").trim();
  const state = normalizeState(task);
  const safeTitle = escapeHtml(title || "Untitled automation");
  const normalizedSelectedId = String(selectedTaskId || "").trim();
  const selectedClass = normalizedSelectedId && normalizedSelectedId === id ? " is-selected" : "";
  const scheduleLabel = formatTaskSchedule(task);
  const destinationLabel = formatTaskDestination(task);
  const lastRunLabel = formatCompactDateTime(task?.lastRunAt);

  return `
    <li class="task-list-item is-${state.replaceAll("_", "-")}${selectedClass}" data-task-id="${escapeHtml(id)}">
      <article
        class="task-list-card"
        data-task-open="${allowOpen ? "true" : "false"}"
        data-task-id="${escapeHtml(id)}"
        role="button"
        tabindex="${allowOpen ? "0" : "-1"}"
        aria-label="Open automation ${safeTitle}"
      >
        <div class="task-list-main">
          <p class="task-list-state-row">
            <span class="task-list-state is-${escapeHtml(state.replaceAll("_", "-"))}">${escapeHtml(stateLabel(state))}</span>
            ${lastRunLabel ? `<span class="task-list-last-run">Last run ${escapeHtml(lastRunLabel)}</span>` : ""}
          </p>
          <p class="task-list-title">${safeTitle}</p>
          <p class="task-list-meta">
            <span>${escapeHtml(scheduleLabel)}</span>
            <span>Saves to ${escapeHtml(destinationLabel)}</span>
          </p>
        </div>
        <div class="task-list-menu-wrap">
          ${renderTaskActionMenu({
            taskId: id,
            state,
            title,
            allowRun,
            allowStateControl,
            allowEdit,
            allowDelete,
          })}
        </div>
      </article>
    </li>
  `;
}

export function renderTaskListHTML({
  idBase = "task-list",
  title = "Tasks",
  subtitle = "",
  showHeader = true,
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

  const resolvedAriaLabel = safeTitle || "Tasks";
  return `
    <section class="task-list" data-component="task-list" data-id-base="${escapeHtml(idBase)}" aria-label="${resolvedAriaLabel}">
      ${showHeader
        ? `
          <div class="task-list-head">
            <div class="task-list-heading">
              <p class="task-list-title-label">${safeTitle}</p>
              ${safeSubtitle ? `<p class="task-list-subtitle">${safeSubtitle}</p>` : ""}
            </div>
            ${showViewAll ? `<a class="task-list-view-all" href="${safeViewHref}">View all</a>` : ""}
          </div>
        `
        : ""}
      ${showFilters
        ? `
          <div class="task-list-filters" role="group" aria-label="Automation status">
            <button type="button" id="${escapeHtml(idBase)}-filter-all" class="task-list-filter-btn is-active" data-status-filter="all" aria-pressed="true">All</button>
            <button type="button" id="${escapeHtml(idBase)}-filter-active" class="task-list-filter-btn" data-status-filter="active" aria-pressed="false">Scheduled</button>
            <button type="button" id="${escapeHtml(idBase)}-filter-paused" class="task-list-filter-btn" data-status-filter="paused" aria-pressed="false">Not scheduled</button>
            <button type="button" id="${escapeHtml(idBase)}-filter-pending" class="task-list-filter-btn" data-status-filter="pending_approval" aria-pressed="false">Needs approval</button>
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
    allowEdit = true,
    allowDelete = false,
    allowRun = true,
    allowOpen = true,
    allowStateControl = true,
    selectedTaskId = "",
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
    .map((task) => renderTaskItem(task, {
      allowEdit,
      allowDelete,
      allowRun,
      allowOpen,
      allowStateControl,
      selectedTaskId,
    }))
    .join("");
}

export function initTaskList(els, callbacks = {}) {
  const disposers = [];

  function on(target, eventName, handler, options) {
    if (!target) return;
    target.addEventListener(eventName, handler, options);
    disposers.push(() => target.removeEventListener(eventName, handler, options));
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

  on(els?.taskListRoot, "toggle", (event) => {
    const toggled = event.target;
    if (!(toggled instanceof HTMLDetailsElement)) return;
    if (!toggled.matches(".task-list-menu")) return;
    if (!toggled.open) return;
    els.taskListRoot?.querySelectorAll(".task-list-menu[open]").forEach((menu) => {
      if (menu === toggled) return;
      menu.open = false;
    });
  });

  on(els?.taskListRoot, "click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest("[data-task-action]");
    if (button instanceof HTMLButtonElement) {
      event.preventDefault();
      event.stopPropagation();
      const action = String(button.dataset.taskAction || "").trim();
      const taskId = String(button.dataset.taskId || "").trim();
      const state = String(button.dataset.taskState || "").trim().toLowerCase();
      const title = String(button.dataset.taskTitle || "").trim();
      if (!taskId) return;

      if (action === "state" && typeof callbacks.onToggle === "function") {
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
        await callbacks.onEdit({ id: taskId, title, prompt: "", project: "" });
      }
      return;
    }

    const filterButton = target.closest("[data-status-filter]");
    if (filterButton instanceof HTMLButtonElement) {
      const status = String(filterButton.dataset.statusFilter || "").trim().toLowerCase();
      if (!status) return;
      setTaskListActiveFilter(els, status);
      if (typeof callbacks.onFilterChange === "function") {
        await callbacks.onFilterChange(status);
      }
      return;
    }

    if (target.closest(".task-list-menu")) {
      return;
    }

    const card = target.closest(".task-list-card[data-task-open='true']");
    if (!(card instanceof HTMLElement)) return;
    const taskId = String(card.dataset.taskId || "").trim();
    if (!taskId || typeof callbacks.onOpen !== "function") return;
    await callbacks.onOpen({ id: taskId });
  });

  on(els?.taskListRoot, "keydown", async (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest(".task-list-menu")) return;
    const card = event.target.closest(".task-list-card[data-task-open='true']");
    if (!(card instanceof HTMLElement)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    const taskId = String(card.dataset.taskId || "").trim();
    if (!taskId || typeof callbacks.onOpen !== "function") return;
    event.preventDefault();
    await callbacks.onOpen({ id: taskId });
  });

  return () => {
    for (const dispose of disposers) dispose();
  };
}
