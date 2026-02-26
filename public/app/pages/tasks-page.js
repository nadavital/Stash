import {
  initTaskList,
  queryTaskListEls,
  renderTaskListHTML,
  renderTaskListItems,
  setTaskListActiveFilter,
} from "../components/task-list/task-list.js";
import {
  initTaskDetail,
  queryTaskDetailEls,
  renderTaskDetail,
  renderTaskDetailHTML,
} from "../components/task-detail/task-detail.js";
import {
  closeAutomationModal,
  initAutomationModal,
  openAutomationModal,
  queryAutomationModalEls,
  renderAutomationModalHTML,
  setAutomationModalLoading,
} from "../components/automation-modal/automation-modal.js";
import { showToast } from "../components/toast/toast.js";
import { conciseTechnicalError } from "../services/mappers.js";

function renderTasksPageContent({ detailMode = false } = {}) {
  if (detailMode) {
    return `
      <section class="page page-tasks page-tasks--detail">
        <div class="tasks-page-header">
          <div class="tasks-page-header-main">
            <a href="#/tasks" class="tasks-page-back-link">Back to automations</a>
            <h1 class="tasks-page-title">Automation</h1>
          </div>
        </div>
        <div class="tasks-detail-stage">
          ${renderTaskDetailHTML({
            idBase: "tasks-page-detail",
            emptyText: "Loading automation details...",
          })}
        </div>
      </section>
      ${renderAutomationModalHTML()}
    `;
  }

  return `
    <section class="page page-tasks page-tasks--list">
      <div class="tasks-page-header">
        <div class="tasks-page-header-main">
          <a href="#/" class="tasks-page-back-link">Back to home</a>
          <h1 class="tasks-page-title">Automations</h1>
        </div>
        <button id="tasks-page-new-btn" class="minimal-action" type="button">New Automation</button>
      </div>

      <div class="tasks-list-stage" aria-label="Automations list">
        <p class="tasks-page-filter-hint"><code>Scheduled</code> runs automatically by interval. <code>Not scheduled</code> is approved but paused/manual-only.</p>
        ${renderTaskListHTML({
          idBase: "tasks-page",
          title: "Automations",
          showHeader: false,
          emptyText: "No automations for this filter",
          showFilters: true,
          showComposer: false,
          showViewAll: false,
        })}
      </div>
    </section>
    ${renderAutomationModalHTML()}
  `;
}

function queryPageElements(mountNode) {
  const taskEls = queryTaskListEls(mountNode, { idBase: "tasks-page" });
  const taskDetailEls = queryTaskDetailEls(mountNode, { idBase: "tasks-page-detail" });
  const automationModalEls = queryAutomationModalEls(mountNode);
  return {
    ...taskEls,
    ...taskDetailEls,
    ...automationModalEls,
    tasksPageNewBtn: mountNode.querySelector("#tasks-page-new-btn"),
    toast: document.getElementById("toast"),
  };
}

function guessLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function mapTaskToDraft(task = {}) {
  const scheduleType = String(task?.scheduleType || "").trim().toLowerCase();
  return {
    mode: "edit",
    taskId: String(task?.id || "").trim(),
    title: String(task?.title || task?.name || "").trim(),
    prompt: String(task?.prompt || "").trim(),
    scopeFolder: String(task?.scopeFolder || task?.project || "").trim(),
    scheduleType: scheduleType === "interval" ? "interval" : "manual",
    intervalMinutes: Number(task?.intervalMinutes || 60),
    maxActionsPerRun: Number(task?.maxActionsPerRun || 4),
    maxConsecutiveFailures: Number(task?.maxConsecutiveFailures || 3),
    timezone: String(task?.timezone || "").trim(),
    dryRun: task?.dryRun === true,
  };
}

function buildTaskPayloadFromDraft(draft = {}) {
  const title = String(draft?.title || "").trim();
  const prompt = String(draft?.prompt || "").trim() || title;
  const scopeFolder = String(draft?.scopeFolder || "").trim();
  const scheduleType = String(draft?.scheduleType || "manual").trim().toLowerCase() === "interval"
    ? "interval"
    : "manual";
  const parsedMaxActions = Number(draft?.maxActionsPerRun || 4);
  const maxActionsPerRun = Number.isFinite(parsedMaxActions)
    ? Math.max(1, Math.min(25, Math.floor(parsedMaxActions)))
    : 4;
  const parsedMaxFailures = Number(draft?.maxConsecutiveFailures || 3);
  const maxConsecutiveFailures = Number.isFinite(parsedMaxFailures)
    ? Math.max(1, Math.min(20, Math.floor(parsedMaxFailures)))
    : 3;
  const parsedInterval = Number(draft?.intervalMinutes || 60);

  return {
    title,
    prompt,
    scopeFolder,
    scheduleType,
    intervalMinutes: scheduleType === "interval"
      ? (Number.isFinite(parsedInterval) ? Math.max(5, Math.min(10080, Math.floor(parsedInterval))) : 60)
      : undefined,
    maxActionsPerRun,
    maxConsecutiveFailures,
    timezone: String(draft?.timezone || "").trim(),
    dryRun: draft?.dryRun === true,
  };
}

function normalizeTaskResponse(response = null) {
  if (response?.task && typeof response.task === "object") return response.task;
  if (response?.item && typeof response.item === "object") return response.item;
  return null;
}

function parseErrorStatus(error = null) {
  const code = Number(error?.status || 0);
  if (Number.isFinite(code) && code >= 100) return code;
  return 0;
}

async function copyTextToClipboard(text = "") {
  const payload = String(text || "");
  if (!payload) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      return true;
    }
  } catch {
    // Fallback below.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
}

export function createTasksPage({ store, apiClient, shell, workspaceSync = null, auth = null }) {
  return {
    async mount({ mountNode, route, navigate }) {
      const initialTaskId = String(route?.taskId || "").trim();
      const detailMode = Boolean(initialTaskId);

      mountNode.innerHTML = renderTasksPageContent({ detailMode });
      const pageEls = queryPageElements(mountNode);
      const els = { ...shell.els, ...pageEls };
      const disposers = [];
      let isMounted = true;
      let tasks = [];
      let filter = "all";
      let selectedTaskId = initialTaskId;
      let selectedTask = null;
      let selectedRuns = [];
      let runsLoading = false;
      let runPendingTaskId = "";

      function toast(message, tone = "success") {
        showToast(message, tone, store);
      }

      function on(target, eventName, handler, options) {
        if (!target) return;
        target.addEventListener(eventName, handler, options);
        disposers.push(() => target.removeEventListener(eventName, handler, options));
      }

      function taskRouteHash(taskId = "") {
        const normalizedTaskId = String(taskId || "").trim();
        if (!normalizedTaskId) return "#/tasks";
        return `#/tasks/${encodeURIComponent(normalizedTaskId)}`;
      }

      function findTaskById(id) {
        const normalizedId = String(id || "").trim();
        if (!normalizedId) return null;
        return tasks.find((entry) => String(entry?.id || "") === normalizedId) || null;
      }

      function findRunByReference({ runId = "", runIndex = -1 } = {}) {
        const normalizedRunId = String(runId || "").trim();
        if (normalizedRunId) {
          const byId = selectedRuns.find((entry) => String(entry?.id || "").trim() === normalizedRunId);
          if (byId) return byId;
        }
        const index = Number(runIndex);
        if (Number.isFinite(index) && index >= 0 && index < selectedRuns.length) {
          return selectedRuns[Math.floor(index)] || null;
        }
        return null;
      }

      function syncTaskContext() {
        if (selectedTaskId && selectedTask && String(selectedTask?.id || "").trim() === selectedTaskId) {
          shell.setTaskContext(selectedTask);
          return;
        }
        shell.setTaskContext(null);
      }

      function renderList() {
        if (!els.taskListItems) return;
        renderTaskListItems(els, tasks, {
          emptyText: "No automations for this filter",
          allowEdit: true,
          allowDelete: true,
          allowRun: true,
          allowOpen: true,
          allowStateControl: true,
          selectedTaskId,
        });
      }

      function renderDetail(notFoundText = "Automation not found.") {
        if (!els.taskDetailContent || !els.taskDetailEmpty) return;
        renderTaskDetail(els, {
          task: selectedTask,
          runs: selectedRuns,
          runsLoading,
          runPendingTaskId,
          showBack: false,
          notFoundText,
        });
      }

      function maybeHandleAuthFailure(error) {
        if (parseErrorStatus(error) !== 401) return false;
        if (typeof auth?.onSignOut === "function") {
          auth.onSignOut();
        }
        return true;
      }

      function openCreateModal(initialTitle = "") {
        openAutomationModal(els, {
          mode: "create",
          title: String(initialTitle || "").trim(),
          prompt: String(initialTitle || "").trim(),
          scheduleType: "manual",
          intervalMinutes: 60,
          maxActionsPerRun: 4,
          maxConsecutiveFailures: 3,
          timezone: guessLocalTimezone(),
          dryRun: false,
        });
      }

      function openEditModal(task) {
        if (!task) return;
        openAutomationModal(els, mapTaskToDraft(task));
      }

      async function refreshTasks({ silent = false } = {}) {
        const status = filter === "all" ? "" : filter;
        try {
          const response = await apiClient.fetchTasks({ status });
          tasks = Array.isArray(response?.items) ? response.items : [];
        } catch (error) {
          if (maybeHandleAuthFailure(error)) return;
          tasks = [];
          if (!silent) {
            toast(conciseTechnicalError(error, "Unable to load automations"), "error");
          }
        }
        renderList();
      }

      async function loadSelectedTask({ includeRuns = true, silent = false } = {}) {
        if (!selectedTaskId) {
          selectedTask = null;
          selectedRuns = [];
          runsLoading = false;
          syncTaskContext();
          renderDetail("Select an automation card to inspect runs.");
          return;
        }

        const previousTask = selectedTask;
        const previousRuns = selectedRuns;
        selectedTask = findTaskById(selectedTaskId) || selectedTask;
        if (includeRuns) runsLoading = true;
        renderDetail("Loading automation details...");

        const requests = [apiClient.fetchTask(selectedTaskId)];
        if (includeRuns) {
          requests.push(apiClient.fetchTaskRuns(selectedTaskId, { limit: 30 }));
        }

        const [taskResult, runsResult] = await Promise.allSettled(requests);
        if (!isMounted) return;

        let taskMissing = false;
        if (taskResult.status === "fulfilled") {
          selectedTask = normalizeTaskResponse(taskResult.value);
          taskMissing = !selectedTask;
        } else {
          const statusCode = parseErrorStatus(taskResult.reason);
          if (statusCode === 404) {
            selectedTask = null;
            taskMissing = true;
          } else {
            selectedTask = findTaskById(selectedTaskId) || previousTask || null;
            if (maybeHandleAuthFailure(taskResult.reason)) return;
          }
          if (!silent && statusCode !== 404) {
            toast(conciseTechnicalError(taskResult.reason, "Unable to load automation"), "error");
          }
        }

        if (includeRuns) {
          if (runsResult?.status === "fulfilled") {
            selectedRuns = Array.isArray(runsResult.value?.items) ? runsResult.value.items : [];
          } else {
            if (maybeHandleAuthFailure(runsResult?.reason)) return;
            selectedRuns = Array.isArray(previousRuns) ? previousRuns : [];
            if (!silent) {
              toast(conciseTechnicalError(runsResult?.reason, "Unable to load recent runs"), "error");
            }
          }
          runsLoading = false;
        }

        syncTaskContext();
        const detailFallbackText = taskMissing
          ? "Automation not found. It may have been removed."
          : "Unable to refresh automation details right now.";
        renderDetail(selectedTask ? "" : detailFallbackText);
      }

      async function handleTaskStateChange({ id, state }) {
        try {
          if (String(state || "") === "pending_approval") {
            await apiClient.approveTask(id, { activate: true });
            toast("Automation approved");
          } else if (String(state || "") === "active") {
            await apiClient.pauseTask(id);
            toast("Automation paused");
          } else {
            await apiClient.resumeTask(id);
            toast("Automation resumed");
          }

          await refreshTasks({ silent: true });
          if (selectedTaskId) {
            await loadSelectedTask({ includeRuns: false, silent: true });
          }
        } catch (error) {
          if (maybeHandleAuthFailure(error)) return;
          toast(conciseTechnicalError(error, "Automation update failed"), "error");
        }
      }

      async function handleRunNow({ id }) {
        const normalizedId = String(id || "").trim();
        if (!normalizedId) return;
        runPendingTaskId = normalizedId;
        if (normalizedId === selectedTaskId) {
          renderDetail("Loading automation details...");
        }
        try {
          const response = await apiClient.runTaskNow(normalizedId);
          const runStatus = String(response?.run?.status || "").trim().toLowerCase();
          if (runStatus === "succeeded") {
            toast("Automation run completed");
          } else if (runStatus === "failed") {
            toast("Automation run failed", "error");
          } else {
            toast("Automation run started");
          }
          runPendingTaskId = "";
          await refreshTasks({ silent: true });
          if (normalizedId === String(selectedTaskId)) {
            await loadSelectedTask({ includeRuns: true, silent: true });
          }
        } catch (error) {
          runPendingTaskId = "";
          if (maybeHandleAuthFailure(error)) return;
          toast(conciseTechnicalError(error, "Automation run failed"), "error");
          if (normalizedId === selectedTaskId) {
            renderDetail("Unable to refresh automation details right now.");
          }
        }
      }

      async function handleDelete({ id, title }) {
        const taskTitle = String(
          title
            || findTaskById(id)?.title
            || findTaskById(id)?.name
            || selectedTask?.title
            || selectedTask?.name
            || "this automation"
        ).trim();
        if (!window.confirm(`Delete \"${taskTitle}\"?`)) return;

        try {
          await apiClient.deleteTask(id);
          toast("Automation deleted");
          await refreshTasks({ silent: true });
          if (String(id) === String(selectedTaskId)) {
            selectedTaskId = "";
            selectedTask = null;
            selectedRuns = [];
            runsLoading = false;
            syncTaskContext();
            navigate("#/tasks");
          }
        } catch (error) {
          if (maybeHandleAuthFailure(error)) return;
          toast(conciseTechnicalError(error, "Automation delete failed"), "error");
        }
      }

      shell.setToast(toast);
      shell.setOnOpenCitation((note) => {
        const noteId = String(note?.id || "").trim();
        if (!noteId) return;
        navigate(`#/item/${encodeURIComponent(noteId)}`);
      });
      shell.setOnWorkspaceAction((action) => {
        const phase = String(action?.phase || "").trim().toLowerCase();
        if (phase !== "commit") return;

        const entityType = String(action?.entityType || "").trim().toLowerCase();
        const mutationType = String(action?.mutationType || "").trim().toLowerCase();
        const name = String(action?.name || "").trim().toLowerCase();
        const affectsTasks = entityType === "task"
          || entityType === "task_run"
          || mutationType.startsWith("task")
          || name.includes("task");
        if (!affectsTasks) return;

        refreshTasks({ silent: true });
        if (selectedTaskId) {
          loadSelectedTask({ includeRuns: true, silent: true });
        }
      });

      if (els.taskListRoot) {
        const cleanupTaskList = initTaskList(els, {
          async onCreate(title) {
            openCreateModal(title);
          },
          async onToggle({ id, state }) {
            await handleTaskStateChange({ id, state });
          },
          async onRun({ id }) {
            await handleRunNow({ id });
          },
          async onDelete({ id, title }) {
            await handleDelete({ id, title });
          },
          async onEdit({ id }) {
            openEditModal(findTaskById(id));
          },
          async onOpen({ id }) {
            navigate(taskRouteHash(id));
          },
          async onFilterChange(nextFilter) {
            filter = String(nextFilter || "active").trim().toLowerCase() || "active";
            await refreshTasks({ silent: true });
          },
        });
        disposers.push(cleanupTaskList);
      }

      if (els.taskDetailRoot) {
        const cleanupTaskDetail = initTaskDetail(els, {
          async onBack() {
            navigate("#/tasks");
          },
          async onRun({ id }) {
            await handleRunNow({ id });
          },
          async onToggle({ id, state }) {
            await handleTaskStateChange({ id, state });
          },
          async onEdit({ id }) {
            openEditModal(findTaskById(id) || selectedTask || (id ? { id } : null));
          },
          async onDelete({ id, title }) {
            await handleDelete({ id, title });
          },
          async onOpenEntity({ entityType, entityId }) {
            const normalizedType = String(entityType || "").trim().toLowerCase();
            const normalizedId = String(entityId || "").trim();
            if (!normalizedId) return;
            if (normalizedType === "note") {
              navigate(`#/item/${encodeURIComponent(normalizedId)}`);
              return;
            }
            if (normalizedType === "folder") {
              navigate(`#/folder/${encodeURIComponent(normalizedId)}`);
              return;
            }
            if (normalizedType === "task") {
              navigate(taskRouteHash(normalizedId));
            }
          },
          async onCopyRunDebug({ taskId, runId, runIndex }) {
            const run = findRunByReference({ runId, runIndex });
            if (!run) {
              toast("Run details unavailable for copy", "error");
              return;
            }
            const resolvedTaskId = String(taskId || selectedTaskId || selectedTask?.id || "").trim();
            const task = (resolvedTaskId ? findTaskById(resolvedTaskId) : null) || selectedTask || null;
            const payload = {
              generatedAt: new Date().toISOString(),
              location: typeof window !== "undefined" ? window.location.href : "",
              task: task || null,
              run,
            };
            const copied = await copyTextToClipboard(JSON.stringify(payload, null, 2));
            if (!copied) {
              toast("Unable to copy run debug", "error");
              return;
            }
            toast("Run debug copied");
          },
        });
        disposers.push(cleanupTaskDetail);
      }

      const cleanupAutomationModal = initAutomationModal(els, {
        onClose() {
          closeAutomationModal(els);
        },
        async onSubmit({ mode, taskId, draft }) {
          const payload = buildTaskPayloadFromDraft(draft);
          if (!payload.title) {
            toast("Automation title is required", "error");
            els.automationTitleInput?.focus();
            return;
          }
          if (!payload.prompt) {
            toast("Automation prompt is required", "error");
            els.automationPromptInput?.focus();
            return;
          }

          setAutomationModalLoading(els, true);
          try {
            if (mode === "edit") {
              if (!taskId) throw new Error("Missing automation id");
              await apiClient.updateTask(taskId, payload);
              toast("Automation updated");
              closeAutomationModal(els);
              await refreshTasks({ silent: true });
              if (selectedTaskId) {
                await loadSelectedTask({ includeRuns: false, silent: true });
              }
            } else {
              const created = await apiClient.createTask({
                ...payload,
                requireApproval: true,
                activate: false,
              });
              const createdTaskId = String(created?.task?.id || "").trim();
              toast("Automation created");
              closeAutomationModal(els);
              if (createdTaskId) {
                navigate(taskRouteHash(createdTaskId));
                return;
              }
              await refreshTasks({ silent: true });
            }
          } catch (error) {
            if (maybeHandleAuthFailure(error)) return;
            toast(conciseTechnicalError(error, "Automation save failed"), "error");
          } finally {
            setAutomationModalLoading(els, false);
          }
        },
      });
      disposers.push(cleanupAutomationModal);

      on(els.tasksPageNewBtn, "click", () => {
        openCreateModal("");
      });

      if (els.taskListRoot) {
        setTaskListActiveFilter(els, filter);
        await refreshTasks({ silent: true });
      }

      if (selectedTaskId) {
        filter = "all";
        await refreshTasks({ silent: true });
        await loadSelectedTask({ includeRuns: true, silent: true });
      } else {
        syncTaskContext();
      }

      if (workspaceSync && typeof workspaceSync.flushQueue === "function") {
        workspaceSync.flushQueue();
      }

      return () => {
        isMounted = false;
        shell.setToast(null);
        shell.setOnOpenCitation(null);
        shell.setOnWorkspaceAction(null);
        shell.setTaskContext(null);
        closeAutomationModal(els);
        for (const dispose of disposers) {
          dispose();
        }
      };
    },
  };
}
