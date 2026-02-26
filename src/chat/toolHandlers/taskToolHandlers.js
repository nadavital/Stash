import { buildTaskProposalSignature } from "../taskSetupPolicy.js";
import { normalizeTaskSpec } from "../../tasks/taskSpec.js";

function normalizeTaskStatus(value, { allowEmpty = false, allowAll = false } = {}) {
  if (value === undefined || value === null) {
    return allowEmpty ? null : "active";
  }
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return allowEmpty ? null : "active";
  }
  if (allowAll && (normalized === "all" || normalized === "any")) {
    return null;
  }
  if (["pending", "pending_approval", "approval"].includes(normalized)) return "pending_approval";
  if (["open", "active", "running"].includes(normalized)) return "active";
  if (["paused", "inactive", "closed", "complete", "completed", "done"].includes(normalized)) return "paused";
  throw new Error("Invalid task status. Use pending_approval, active, paused, or all.");
}

function normalizeTaskId(value) {
  return String(value || "").trim();
}

function toPositiveInt(value, fallback = undefined, { min = 1, max = 10080 } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Expected a positive integer");
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function buildTaskDraft(args = {}) {
  const title = String(args?.title || args?.name || "").trim();
  if (!title) {
    throw new Error("task title is required");
  }
  const intervalMinutes = toPositiveInt(args?.intervalMinutes, undefined, { min: 5, max: 10080 });
  const scheduleType = String(args?.scheduleType || (intervalMinutes ? "interval" : "manual")).trim().toLowerCase();
  if (scheduleType !== "manual" && scheduleType !== "interval") {
    throw new Error("task scheduleType must be manual or interval");
  }
  const draft = {
    title,
    prompt: String(args?.prompt || title).trim(),
    scopeType: String(args?.scopeType || "").trim().toLowerCase() || "workspace",
    scopeFolder: String(args?.scopeFolder || args?.project || "").trim(),
    scheduleType,
    intervalMinutes: scheduleType === "interval" ? intervalMinutes ?? 1440 : null,
    timezone: String(args?.timezone || "").trim(),
    nextRunAt: String(args?.nextRunAt || "").trim(),
    maxActionsPerRun: toPositiveInt(args?.maxActionsPerRun, 4, { min: 1, max: 25 }),
    maxConsecutiveFailures: toPositiveInt(args?.maxConsecutiveFailures, 3, { min: 1, max: 20 }),
    dryRun: args?.dryRun === true,
  };
  draft.spec = normalizeTaskSpec(args?.spec, draft);
  return draft;
}

function mapTask(task) {
  return {
    id: String(task?.id || ""),
    title: String(task?.title || task?.name || ""),
    name: String(task?.name || task?.title || ""),
    prompt: String(task?.prompt || ""),
    project: String(task?.project || task?.scopeFolder || ""),
    scopeType: String(task?.scopeType || "workspace"),
    scopeFolder: String(task?.scopeFolder || ""),
    scheduleType: String(task?.scheduleType || "manual"),
    intervalMinutes: task?.intervalMinutes === null || task?.intervalMinutes === undefined ? null : Number(task.intervalMinutes),
    timezone: String(task?.timezone || "UTC"),
    approvalStatus: String(task?.approvalStatus || "pending_approval"),
    status: String(task?.status || "paused"),
    state: String(task?.state || "pending_approval"),
    enabled: task?.enabled === true,
    maxActionsPerRun: Number(task?.maxActionsPerRun || 4),
    maxConsecutiveFailures: Number(task?.maxConsecutiveFailures || 3),
    consecutiveFailures: Number(task?.consecutiveFailures || 0),
    pausedReason: String(task?.pausedReason || ""),
    dryRun: task?.dryRun === true,
    taskSpec: task?.taskSpec && typeof task.taskSpec === "object" ? task.taskSpec : null,
    createdAt: String(task?.createdAt || ""),
    updatedAt: String(task?.updatedAt || ""),
    nextRunAt: String(task?.nextRunAt || ""),
    lastRunAt: String(task?.lastRunAt || ""),
    lastRunStatus: String(task?.lastRunStatus || ""),
    lastRunSummary: String(task?.lastRunSummary || ""),
    lastError: String(task?.lastError || ""),
  };
}

export function createTaskToolHandlers({ taskRepo }) {
  if (!taskRepo) return {};

  return {
    async list_tasks(args, actor) {
      const status = normalizeTaskStatus(args?.status, { allowEmpty: false, allowAll: true });
      const limit = Math.min(Math.max(Number(args?.limit) || 30, 1), 200);
      const tasks = await taskRepo.listTasks(status, actor.workspaceId);
      const items = Array.isArray(tasks) ? tasks.slice(0, limit).map(mapTask) : [];
      return {
        tasks: items,
        count: items.length,
      };
    },

    async propose_task(args) {
      const draft = buildTaskDraft(args);
      const proposalSignature = buildTaskProposalSignature(draft);
      return {
        proposal: {
          ...draft,
          proposalSignature,
        },
        actions: ["Create it", "Cancel"],
      };
    },

    async create_task(args, actor) {
      const draft = buildTaskDraft(args);
      const role = String(actor?.role || "").trim().toLowerCase();
      const canAutoApprove = role === "owner" || role === "admin";
      const confirmed = args?.confirmed === true;
      const approvalStatus = confirmed && canAutoApprove ? "approved" : "pending_approval";
      const autoActivate = approvalStatus === "approved" && draft.scheduleType === "interval";

      const task = await taskRepo.createTask({
        title: draft.title,
        prompt: draft.prompt,
        taskSpec: draft.spec,
        scopeType: draft.scopeType || undefined,
        scopeFolder: draft.scopeFolder,
        scheduleType: draft.scheduleType,
        intervalMinutes: draft.intervalMinutes,
        timezone: draft.timezone || undefined,
        nextRunAt: draft.nextRunAt || undefined,
        maxActionsPerRun: draft.maxActionsPerRun,
        maxConsecutiveFailures: draft.maxConsecutiveFailures,
        dryRun: draft.dryRun,
        status: autoActivate ? "active" : "paused",
        approvalStatus,
        workspaceId: actor.workspaceId,
        createdByUserId: actor.userId,
        approvedByUserId: approvalStatus === "approved" ? actor.userId : "",
      });
      return {
        task: mapTask(task),
        approvalRequired: approvalStatus !== "approved",
      };
    },

    async update_task(args, actor) {
      const id = normalizeTaskId(args?.id);
      if (!id) {
        throw new Error("update_task requires id");
      }
      const existing = args?.spec !== undefined
        ? await taskRepo.getTask(id, actor.workspaceId)
        : null;

      const patch = {};
      if (args?.title !== undefined || args?.name !== undefined) {
        patch.title = String(args?.title ?? args?.name ?? "").trim();
      }
      if (args?.prompt !== undefined) {
        patch.prompt = String(args.prompt || "").trim();
      }
      if (args?.scopeFolder !== undefined || args?.project !== undefined) {
        patch.scopeFolder = String(args?.scopeFolder ?? args?.project ?? "").trim();
      }
      if (args?.scopeType !== undefined) {
        patch.scopeType = String(args.scopeType || "").trim();
      }
      if (args?.scheduleType !== undefined) {
        patch.scheduleType = String(args.scheduleType || "").trim().toLowerCase();
      }
      if (args?.intervalMinutes !== undefined) {
        patch.intervalMinutes = toPositiveInt(args.intervalMinutes, null, { min: 5, max: 10080 });
      }
      if (args?.timezone !== undefined) {
        patch.timezone = String(args.timezone || "").trim();
      }
      if (args?.nextRunAt !== undefined) {
        patch.nextRunAt = String(args.nextRunAt || "").trim();
      }
      if (args?.maxActionsPerRun !== undefined) {
        patch.maxActionsPerRun = toPositiveInt(args.maxActionsPerRun, undefined, { min: 1, max: 25 });
      }
      if (args?.maxConsecutiveFailures !== undefined) {
        patch.maxConsecutiveFailures = toPositiveInt(args.maxConsecutiveFailures, undefined, { min: 1, max: 20 });
      }
      if (args?.dryRun !== undefined) {
        patch.dryRun = args.dryRun === true;
      }
      if (args?.spec !== undefined) {
        patch.taskSpec = normalizeTaskSpec(args.spec, {
          title: existing?.title || "",
          prompt: existing?.prompt || "",
          scopeFolder: patch.scopeFolder ?? existing?.scopeFolder ?? "",
          scheduleType: patch.scheduleType ?? existing?.scheduleType ?? "manual",
          intervalMinutes: patch.intervalMinutes ?? existing?.intervalMinutes ?? null,
        });
      }
      if (args?.status !== undefined) {
        patch.status = normalizeTaskStatus(args.status, { allowEmpty: false, allowAll: false });
      }
      if (Object.keys(patch).length === 0) {
        throw new Error("update_task requires at least one mutable field");
      }

      const task = await taskRepo.updateTask(id, patch, actor.workspaceId);
      return { task: mapTask(task) };
    },

    async complete_task(args, actor) {
      const id = normalizeTaskId(args?.id);
      if (!id) {
        throw new Error("complete_task requires id");
      }
      const task = await taskRepo.pauseTask(id, actor.workspaceId);
      return { task: mapTask(task) };
    },

    async delete_task(args, actor) {
      const id = normalizeTaskId(args?.id);
      if (!id) {
        throw new Error("delete_task requires id");
      }
      return taskRepo.deleteTask(id, actor.workspaceId);
    },
  };
}
