import {
  initTaskList,
  queryTaskListEls,
  renderTaskListHTML,
  renderTaskListItems,
  setTaskListActiveFilter,
} from "../components/task-list/task-list.js";
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

function renderTasksPageContent() {
  return `
    <section class="page page-tasks" style="position:relative;">
      <div class="tasks-explorer-pane">
        <div class="tasks-page-header">
          <div class="tasks-page-header-main">
            <a href="#/" class="tasks-page-back-link">Back to home</a>
            <h1 class="tasks-page-title">Automations</h1>
          </div>
          <button id="tasks-page-new-btn" class="minimal-action" type="button">New Automation</button>
        </div>
        ${renderTaskListHTML({
          idBase: "tasks-page",
          title: "Workspace Automations",
          subtitle: "Pending approval, active, and paused schedules",
          emptyText: "No automations for this filter",
          showFilters: true,
          showComposer: true,
          composerPlaceholder: "Create automation title",
          showViewAll: false,
        })}
      </div>
    </section>
    ${renderAutomationModalHTML()}
  `;
}

function queryPageElements(mountNode) {
  const taskEls = queryTaskListEls(mountNode, { idBase: "tasks-page" });
  const automationModalEls = queryAutomationModalEls(mountNode);
  return {
    ...taskEls,
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

export function createTasksPage({ store, apiClient, shell, workspaceSync = null }) {
  return {
    async mount({ mountNode }) {
      mountNode.innerHTML = renderTasksPageContent();
      const pageEls = queryPageElements(mountNode);
      const els = { ...shell.els, ...pageEls };
      const disposers = [];
      let isMounted = true;
      let tasks = [];
      let filter = "active";

      function toast(message, tone = "success") {
        showToast(message, tone, store);
      }

      function on(target, eventName, handler, options) {
        if (!target) return;
        target.addEventListener(eventName, handler, options);
        disposers.push(() => target.removeEventListener(eventName, handler, options));
      }

      function findTaskById(id) {
        return tasks.find((entry) => String(entry?.id || "") === String(id || "")) || null;
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

      async function refreshTasks() {
        try {
          const status = filter === "all" ? "" : filter;
          const response = await apiClient.fetchTasks({ status });
          tasks = Array.isArray(response?.items) ? response.items : [];
          renderTaskListItems(els, tasks, {
            emptyText: "No automations for this filter",
            showStatus: true,
            allowEdit: true,
            allowDelete: true,
            allowRun: true,
          });
        } catch (error) {
          if (!isMounted) return;
          toast(conciseTechnicalError(error, "Unable to load tasks"), "error");
        }
      }

      shell.setToast(toast);
      shell.setOnOpenCitation(null);
      shell.setOnWorkspaceAction((action) => {
        const phase = String(action?.phase || "").trim().toLowerCase();
        const name = String(action?.name || "").trim().toLowerCase();
        if (phase !== "commit") return;
        if (["create_task", "update_task", "complete_task", "delete_task"].includes(name)) {
          refreshTasks();
        }
      });

      const cleanupTaskList = initTaskList(els, {
        async onCreate(title) {
          openCreateModal(title);
        },
        async onToggle({ id, state }) {
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
            await refreshTasks();
          } catch (error) {
            toast(conciseTechnicalError(error, "Automation update failed"), "error");
          }
        },
        async onRun({ id }) {
          try {
            await apiClient.runTaskNow(id);
            toast("Automation run started");
            await refreshTasks();
          } catch (error) {
            toast(conciseTechnicalError(error, "Automation run failed"), "error");
          }
        },
        async onDelete({ id }) {
          try {
            await apiClient.deleteTask(id);
            toast("Automation deleted");
            await refreshTasks();
          } catch (error) {
            toast(conciseTechnicalError(error, "Automation delete failed"), "error");
          }
        },
        async onEdit({ id }) {
          openEditModal(findTaskById(id));
        },
        async onFilterChange(nextFilter) {
          filter = String(nextFilter || "active").trim().toLowerCase() || "active";
          await refreshTasks();
        },
      });
      disposers.push(cleanupTaskList);

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
              if (!taskId) {
                throw new Error("Missing automation id");
              }
              await apiClient.updateTask(taskId, payload);
              toast("Automation updated");
            } else {
              await apiClient.createTask({
                ...payload,
                requireApproval: true,
                activate: false,
              });
              toast("Automation created (pending approval)");
            }
            closeAutomationModal(els);
            await refreshTasks();
          } catch (error) {
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

      setTaskListActiveFilter(els, filter);
      await refreshTasks();

      if (workspaceSync && typeof workspaceSync.flushQueue === "function") {
        workspaceSync.flushQueue();
      }

      return () => {
        isMounted = false;
        shell.setToast(null);
        shell.setOnOpenCitation(null);
        shell.setOnWorkspaceAction(null);
        closeAutomationModal(els);
        for (const dispose of disposers) {
          dispose();
        }
      };
    },
  };
}
