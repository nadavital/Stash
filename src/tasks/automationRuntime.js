import { runStreamingChatOrchestrator } from "../chat/orchestrator/streamingChatOrchestrator.js";

const BLOCKED_TOOLS = new Set([
  "ask_user_question",
  "list_tasks",
  "create_task",
  "update_task",
  "complete_task",
  "delete_task",
]);

const MUTATION_TOOLS = new Set([
  "create_note",
  "create_notes_bulk",
  "create_folder",
  "update_note",
  "update_note_attachment",
  "update_note_markdown",
  "add_note_comment",
  "restore_note_version",
  "retry_note_enrichment",
  "update_folder",
  "delete_folder",
  "set_folder_collaborator",
  "remove_folder_collaborator",
]);

function normalizeStatus(value = "") {
  return String(value || "").trim().toLowerCase();
}

function safeString(value, fallback = "") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function createSseCaptureSink() {
  return {
    chunks: [],
    write(chunk) {
      this.chunks.push(String(chunk || ""));
    },
  };
}

function parseTokenTextFromSseChunks(chunks = []) {
  const lines = String(Array.isArray(chunks) ? chunks.join("") : "").split(/\n/);
  const parts = [];
  let eventType = "";
  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
      continue;
    }
    if (!line.startsWith("data:")) {
      if (!line.trim()) {
        eventType = "";
      }
      continue;
    }
    const raw = line.slice("data:".length).trim();
    if (!raw) continue;
    if (eventType !== "token") continue;
    try {
      const parsed = JSON.parse(raw);
      const token = String(parsed?.token || "");
      if (token) parts.push(token);
    } catch {
      // Ignore malformed payloads.
    }
  }
  return parts.join("").trim();
}

function parseWorkspaceActionCommitsFromSseChunks(chunks = []) {
  const lines = String(Array.isArray(chunks) ? chunks.join("") : "").split(/\n/);
  const commits = [];
  let eventType = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
      continue;
    }
    if (!line.startsWith("data:")) {
      if (!line.trim()) {
        eventType = "";
      }
      continue;
    }
    if (eventType !== "workspace_action_commit") continue;
    const raw = line.slice("data:".length).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      commits.push({
        entityType: safeString(parsed.entityType),
        entityId: safeString(parsed.entityId),
        mutationType: safeString(parsed.mutationType),
        name: safeString(parsed.name),
      });
    } catch {
      // Ignore malformed payloads.
    }
  }

  return commits;
}

function buildAllowedTools(chatTools = []) {
  const source = Array.isArray(chatTools) ? chatTools : [];
  return source.filter((tool) => {
    const name = safeString(tool?.name).toLowerCase();
    if (!name) return false;
    return !BLOCKED_TOOLS.has(name);
  });
}

function buildAutomationInstructions({
  systemPrompt,
  task,
  maxActionsPerRun,
}) {
  const scopeFolder = safeString(task.scopeFolder);
  const scopeLine = scopeFolder
    ? `Limit all created/updated items to folder \"${scopeFolder}\".`
    : "Work at workspace scope unless the prompt names a folder.";

  return [
    String(systemPrompt || "").trim(),
    "",
    "You are running an unattended workspace automation.",
    "Never ask follow-up questions.",
    "Do not call task management tools.",
    scopeLine,
    `Perform at most ${maxActionsPerRun} mutating tool call(s).`,
    "If no action is needed, return a brief completion note.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAutomationInput(task) {
  const name = safeString(task.name, "Automation");
  const prompt = safeString(task.prompt, name);
  const scopeFolder = safeString(task.scopeFolder);

  const lines = [
    `Run automation: ${name}`,
    `Prompt: ${prompt}`,
  ];
  if (scopeFolder) {
    lines.push(`Target folder: ${scopeFolder}`);
  }

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: lines.join("\n"),
        },
      ],
    },
  ];
}

export function createAutomationRuntime({
  config,
  logger,
  hasOpenAI,
  CHAT_TOOLS,
  CHAT_SYSTEM_PROMPT,
  createStreamingResponse,
  extractOutputUrlCitations,
  createAgentToolHarness,
  resolveAgentToolArgs,
  executeChatToolCall,
  taskRepo,
}) {
  if (!taskRepo) {
    return {
      runTaskNow: async () => {
        throw new Error("Task repository unavailable");
      },
      startAutomationRunner: () => {},
      stopAutomationRunner: () => {},
    };
  }

  const allowedTools = buildAllowedTools(CHAT_TOOLS);
  const allowedToolNames = new Set(allowedTools.map((tool) => safeString(tool.name).toLowerCase()).filter(Boolean));
  const pollIntervalMs = clampInt(config?.automationPollIntervalMs, 30000, 5000, 5 * 60 * 1000);
  const pollBatchSize = clampInt(config?.automationPollBatchSize, 4, 1, 25);

  let pollTimer = null;
  let polling = false;

  async function executeAutomationTask(task, { taskId, workspaceId, runId, triggeredByUserId = "", trigger = "manual" } = {}) {
    if (!hasOpenAI()) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const actor = {
      userId: safeString(triggeredByUserId || task.createdByUserId, "automation"),
      workspaceId: safeString(workspaceId || task.workspaceId),
      role: "member",
    };

    const maxActionsPerRun = clampInt(task.maxActionsPerRun, 4, 1, 25);
    let mutationActions = 0;

    const harness = createAgentToolHarness({
      actor,
      requestId: safeString(runId, `auto-${Date.now()}`),
      resolveArgs: (name, args) => {
        const resolved = resolveAgentToolArgs(name, args, {
          contextProject: safeString(task.scopeFolder),
        });
        if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
          return resolved;
        }

        const normalizedName = safeString(name).toLowerCase();
        if (
          safeString(task.scopeFolder) &&
          (normalizedName === "create_note" || normalizedName === "create_notes_bulk")
        ) {
          if (normalizedName === "create_note" && !safeString(resolved.project)) {
            return {
              ...resolved,
              project: task.scopeFolder,
            };
          }
          if (normalizedName === "create_notes_bulk") {
            const items = Array.isArray(resolved.items)
              ? resolved.items.map((item) => {
                  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
                  if (safeString(item.project)) return item;
                  return {
                    ...item,
                    project: task.scopeFolder,
                  };
                })
              : resolved.items;
            return {
              ...resolved,
              ...(safeString(resolved.project) ? {} : { project: task.scopeFolder }),
              items,
            };
          }
        }

        return resolved;
      },
      executeTool: async (name, args, toolActor) => {
        const normalizedName = safeString(name).toLowerCase();
        if (!allowedToolNames.has(normalizedName)) {
          throw new Error(`Tool not allowed for automation: ${normalizedName}`);
        }

        if (MUTATION_TOOLS.has(normalizedName)) {
          if (mutationActions >= maxActionsPerRun) {
            throw new Error(`Action limit reached (${maxActionsPerRun})`);
          }
          mutationActions += 1;
        }

        if (normalizedName === "search_notes") {
          const scopedArgs = {
            ...args,
            scope: safeString(args?.scope, "workspace"),
            project: safeString(args?.project || task.scopeFolder, ""),
          };
          return executeChatToolCall(name, scopedArgs, toolActor);
        }

        return executeChatToolCall(name, args, toolActor);
      },
    });

    const sink = createSseCaptureSink();
    await runStreamingChatOrchestrator({
      res: sink,
      createStreamingResponse,
      extractOutputUrlCitations,
      responseTools: allowedTools,
      responseInclude: undefined,
      harness,
      initialInput: buildAutomationInput(task),
      initialInstructions: buildAutomationInstructions({
        systemPrompt: CHAT_SYSTEM_PROMPT,
        task,
        maxActionsPerRun,
      }),
      maxToolRounds: clampInt(maxActionsPerRun + 1, 4, 1, 8),
      temperature: 0.1,
    });

    const outputText = parseTokenTextFromSseChunks(sink.chunks);
    const mutationCommits = parseWorkspaceActionCommitsFromSseChunks(sink.chunks);
    const mutationCount = mutationCommits.length > 0 ? mutationCommits.length : mutationActions;
    const normalizedSummary = safeString(outputText, `Automation executed (${mutationActions} action${mutationActions === 1 ? "" : "s"}).`);

    return {
      summary: normalizedSummary.slice(0, 800),
      output: {
        text: outputText,
        mutationCount,
        mutationActions,
        mutations: mutationCommits.slice(-100),
      },
      trace: {
        trigger,
        toolCalls: mutationActions,
        mutationCount,
        traces: Array.isArray(harness.traces) ? harness.traces.slice(-80) : [],
      },
    };
  }

  async function runTaskNow({ taskId, workspaceId, triggeredByUserId = "", trigger = "manual" } = {}) {
    const normalizedTaskId = safeString(taskId);
    const normalizedWorkspaceId = safeString(workspaceId);
    if (!normalizedTaskId) {
      throw new Error("Missing task id");
    }
    if (!normalizedWorkspaceId) {
      throw new Error("Missing workspace id");
    }

    const task = await taskRepo.getTask(normalizedTaskId, normalizedWorkspaceId);
    if (normalizeStatus(task.approvalStatus) !== "approved") {
      throw new Error("Task must be approved before it can run");
    }

    if (normalizeStatus(trigger) === "schedule") {
      const isActive = normalizeStatus(task.status) === "active" && task.enabled === true;
      if (!isActive) {
        return {
          skipped: true,
          reason: "task_not_active",
          taskId: normalizedTaskId,
        };
      }
    }

    const run = await taskRepo.createTaskRun({
      taskId: normalizedTaskId,
      workspaceId: normalizedWorkspaceId,
      status: "running",
      summary: `Triggered by ${safeString(trigger, "manual")}`,
      trace: {
        trigger: safeString(trigger, "manual"),
      },
    });

    try {
      const execution = await executeAutomationTask(task, {
        taskId: normalizedTaskId,
        workspaceId: normalizedWorkspaceId,
        runId: run.id,
        triggeredByUserId,
        trigger,
      });

      const completed = await taskRepo.completeTaskRun(run.id, {
        status: "succeeded",
        summary: execution.summary,
        trace: execution.trace,
        output: execution.output,
      });

      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await taskRepo.completeTaskRun(run.id, {
        status: "failed",
        summary: "Automation run failed",
        error: message,
        trace: {
          trigger: safeString(trigger, "manual"),
          message,
        },
      });
      throw Object.assign(new Error(message), {
        run: failed,
      });
    }
  }

  async function pollDueTasks() {
    if (polling) return;
    polling = true;
    try {
      const dueTasks = await taskRepo.claimDueTasks({ limit: pollBatchSize });
      for (const task of dueTasks) {
        try {
          await runTaskNow({
            taskId: task.id,
            workspaceId: task.workspaceId,
            triggeredByUserId: task.createdByUserId,
            trigger: "schedule",
          });
        } catch (error) {
          logger.warn("automation_run_failed", {
            taskId: task.id,
            workspaceId: task.workspaceId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      logger.error("automation_poll_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      polling = false;
    }
  }

  function startAutomationRunner() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      pollDueTasks();
    }, pollIntervalMs);
    if (typeof pollTimer.unref === "function") {
      pollTimer.unref();
    }
    pollDueTasks();
  }

  function stopAutomationRunner() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  return {
    runTaskNow,
    startAutomationRunner,
    stopAutomationRunner,
  };
}
