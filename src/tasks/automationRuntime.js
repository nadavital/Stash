import { runStreamingChatOrchestrator } from "../chat/orchestrator/streamingChatOrchestrator.js";
import { normalizeTaskSpec, taskSpecPrefersPerItemNotes } from "./taskSpec.js";

const BLOCKED_TOOLS = new Set([
  "ask_user_question",
  "propose_task",
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

const EXTERNAL_SOURCE_TOOL_HINTS = new Set([
  "search_web",
  "browse_web",
  "fetch_url",
  "fetch_rss",
  "get_rss_feed",
  "web_search",
  "open_url",
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
      const patch = parsed.patch && typeof parsed.patch === "object" && !Array.isArray(parsed.patch)
        ? {
            title: safeString(parsed.patch.title),
            name: safeString(parsed.patch.name),
            project: safeString(parsed.patch.project),
          }
        : null;
      const rawResult = parsed.result && typeof parsed.result === "object" && !Array.isArray(parsed.result)
        ? parsed.result
        : null;
      const result = rawResult
        ? {
            noteId: safeString(rawResult.noteId),
            folderId: safeString(rawResult.folderId),
            id: safeString(rawResult.id),
            title: safeString(rawResult.title),
            name: safeString(rawResult.name),
            project: safeString(rawResult.project),
            task: rawResult.task && typeof rawResult.task === "object" && !Array.isArray(rawResult.task)
              ? {
                  id: safeString(rawResult.task.id),
                  title: safeString(rawResult.task.title),
                  name: safeString(rawResult.task.name),
                }
              : null,
          }
        : null;
      commits.push({
        entityType: safeString(parsed.entityType),
        entityId: safeString(parsed.entityId),
        mutationType: safeString(parsed.mutationType),
        name: safeString(parsed.name),
        patch,
        result,
      });
    } catch {
      // Ignore malformed payloads.
    }
  }

  return commits;
}

function parseWebSourcesFromSseChunks(chunks = []) {
  const lines = String(Array.isArray(chunks) ? chunks.join("") : "").split(/\n/);
  const sources = [];
  const seen = new Set();
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
    if (eventType !== "web_sources") continue;
    const raw = line.slice("data:".length).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.webSources) ? parsed.webSources : [];
      for (const entry of list) {
        const url = safeString(entry?.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        sources.push({
          url,
          title: safeString(entry?.title),
        });
        if (sources.length >= 24) return sources;
      }
    } catch {
      // Ignore malformed payloads.
    }
  }

  return sources;
}

function parseWebSearchCallsFromSseChunks(chunks = []) {
  const lines = String(Array.isArray(chunks) ? chunks.join("") : "").split(/\n/);
  const calls = [];
  const seen = new Set();
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
    if (eventType !== "web_search_trace") continue;
    const raw = line.slice("data:".length).trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.webSearchCalls) ? parsed.webSearchCalls : [];
      for (const entry of list) {
        const id = safeString(entry?.id) || `query:${safeString(entry?.query)}`;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        calls.push({
          id: safeString(entry?.id),
          query: safeString(entry?.query),
          status: safeString(entry?.status, "completed").toLowerCase() || "completed",
          sourceCount: clampInt(entry?.sourceCount, 0, 0, 500),
        });
        if (calls.length >= 20) return calls;
      }
    } catch {
      // Ignore malformed payloads.
    }
  }

  return calls;
}

function summarizeMutationCommits(commits = [], mutationActions = 0) {
  const entries = Array.isArray(commits) ? commits : [];
  if (!entries.length) {
    if (mutationActions > 0) {
      return `Executed ${mutationActions} action${mutationActions === 1 ? "" : "s"}.`;
    }
    return "";
  }

  const countByType = new Map();
  const createdNoteTitles = [];

  for (const entry of entries) {
    const type = safeString(entry?.mutationType).toLowerCase();
    if (!type) continue;
    countByType.set(type, (countByType.get(type) || 0) + 1);
    if (type === "note.create") {
      const title = safeString(entry?.result?.title || entry?.patch?.title);
      if (title) createdNoteTitles.push(title);
    }
  }

  const parts = [];
  const noteCreates = Number(countByType.get("note.create") || 0);
  const noteUpdates = Number(countByType.get("note.update") || 0) + Number(countByType.get("note.content.update") || 0);
  const folderCreates = Number(countByType.get("folder.create") || 0);
  const folderUpdates = Number(countByType.get("folder.update") || 0);
  const taskMutations = Number(countByType.get("task.create") || 0) + Number(countByType.get("task.update") || 0);

  if (noteCreates > 0) parts.push(`Created ${noteCreates} note${noteCreates === 1 ? "" : "s"}`);
  if (noteUpdates > 0) parts.push(`Updated ${noteUpdates} note${noteUpdates === 1 ? "" : "s"}`);
  if (folderCreates > 0) parts.push(`Created ${folderCreates} folder${folderCreates === 1 ? "" : "s"}`);
  if (folderUpdates > 0) parts.push(`Updated ${folderUpdates} folder${folderUpdates === 1 ? "" : "s"}`);
  if (taskMutations > 0) parts.push(`Updated ${taskMutations} automation${taskMutations === 1 ? "" : "s"}`);

  if (!parts.length) {
    parts.push(`Committed ${entries.length} workspace mutation${entries.length === 1 ? "" : "s"}`);
  }

  const titlePreview = [...new Set(createdNoteTitles)].slice(0, 2);
  if (titlePreview.length > 0) {
    return `${parts.join("; ")} (${titlePreview.join(", ")}).`;
  }
  return `${parts.join("; ")}.`;
}

function buildAllowedTools(chatTools = []) {
  const source = Array.isArray(chatTools) ? chatTools : [];
  return source.filter((tool) => {
    const name = safeString(tool?.name).toLowerCase();
    if (!name) return false;
    return !BLOCKED_TOOLS.has(name);
  });
}

function hasExternalSourceTooling(allowedToolNames = new Set()) {
  for (const hint of EXTERNAL_SOURCE_TOOL_HINTS) {
    if (allowedToolNames.has(hint)) return true;
  }
  return false;
}

function resolveTaskSpec(task = {}) {
  const scopeFolder = safeString(task.scopeFolder || task.project);
  return normalizeTaskSpec(task.taskSpec ?? task.spec, {
    title: safeString(task.name || task.title),
    prompt: safeString(task.prompt),
    scopeFolder,
  });
}

function resolveTaskScopeFolder(task = {}, taskSpec = null) {
  const specFolder = safeString(taskSpec?.destination?.folder);
  if (specFolder) return specFolder;
  return safeString(task.scopeFolder || task.project);
}

function normalizeDomain(value = "") {
  const raw = safeString(value).toLowerCase();
  if (!raw) return "";
  const strippedScheme = raw.replace(/^https?:\/\//, "");
  const host = strippedScheme.split("/")[0].split("?")[0].split("#")[0];
  if (!host || host.includes(" ")) return "";
  return host.replace(/\.$/, "");
}

function extractDomainsFromQuery(text = "") {
  const matches = String(text || "").match(/site:([a-z0-9.-]+\.[a-z]{2,})(?:\b|\/)/gi) || [];
  return matches
    .map((entry) => normalizeDomain(entry.replace(/^site:/i, "")))
    .filter(Boolean);
}

function extractDomainsFromUrls(text = "") {
  const matches = String(text || "").match(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/:?#]|$)/gi) || [];
  return matches
    .map((entry) => {
      const url = String(entry || "").trim();
      try {
        return normalizeDomain(new URL(url).hostname);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function resolveSourceDomains(task = {}, taskSpec = null) {
  const spec = taskSpec && typeof taskSpec === "object" ? taskSpec : resolveTaskSpec(task);
  const fromSpec = Array.isArray(spec?.source?.domains) ? spec.source.domains : [];
  const sourceText = `${safeString(spec?.source?.query)} ${safeString(task?.name)} ${safeString(task?.prompt)}`.trim();
  const fromQuery = extractDomainsFromQuery(sourceText);
  const fromUrls = extractDomainsFromUrls(sourceText);
  return [...new Set([...fromSpec, ...fromQuery, ...fromUrls].map((value) => normalizeDomain(value)).filter(Boolean))]
    .slice(0, 8);
}

function buildRssFeedCandidates(domains = []) {
  const urls = [];
  for (const rawDomain of Array.isArray(domains) ? domains : []) {
    const domain = normalizeDomain(rawDomain);
    if (!domain) continue;
    const host = domain.startsWith("www.") ? domain : `www.${domain}`;
    urls.push(`https://${host}/rss/index.xml`);
    urls.push(`https://${host}/rss`);
    urls.push(`https://${host}/feed`);
    urls.push(`https://${host}/rss.xml`);
    urls.push(`https://${host}/feed.xml`);
    urls.push(`https://${domain}/rss/index.xml`);
    urls.push(`https://${domain}/rss`);
    urls.push(`https://${domain}/feed`);
    urls.push(`https://${domain}/rss.xml`);
    urls.push(`https://${domain}/feed.xml`);
  }
  return [...new Set(urls)].slice(0, 12);
}

function taskRequiresExternalResearch(task = {}, taskSpec = null) {
  const spec = taskSpec && typeof taskSpec === "object" ? taskSpec : resolveTaskSpec(task);
  const sourceMode = safeString(spec?.source?.mode).toLowerCase();
  if (sourceMode === "web" || sourceMode === "mixed") return true;
  if (sourceMode === "workspace") return false;
  const text = `${safeString(task?.name)}\n${safeString(task?.title)}\n${safeString(task?.prompt)}`.toLowerCase();
  if (!text) return false;
  const sourceSignal = /(the verge|techcrunch|wired|nyt|new york times|bloomberg|reuters|news|headline|headlines|rss|articles?)/i;
  const freshnessSignal = /(latest|today|yesterday|last\s+\d+\s*(h|hr|hour|hours|d|day|days)|daily|every day|24h|24 hours)/i;
  return sourceSignal.test(text) && freshnessSignal.test(text);
}

function buildAutomationInstructions({
  systemPrompt,
  taskSpec,
  scopeFolder,
  maxActionsPerRun,
  hasRssTool = false,
  sourceDomains = [],
}) {
  const scopeLine = scopeFolder
    ? `Limit all created/updated items to folder \"${scopeFolder}\".`
    : "Work at workspace scope unless the prompt names a folder.";
  const sourceMode = safeString(taskSpec?.source?.mode).toLowerCase() || "workspace";
  const sourceQuery = safeString(taskSpec?.source?.query);
  const resolvedSourceDomains = Array.isArray(sourceDomains) && sourceDomains.length > 0
    ? sourceDomains.map((domain) => safeString(domain)).filter(Boolean).slice(0, 8)
    : (Array.isArray(taskSpec?.source?.domains)
      ? taskSpec.source.domains.map((domain) => safeString(domain)).filter(Boolean).slice(0, 8)
      : []);
  const rssFeedCandidates = buildRssFeedCandidates(resolvedSourceDomains);
  const lookbackHours = Number(taskSpec?.source?.lookbackHours);
  const prefersPerItemNotes = taskSpecPrefersPerItemNotes(taskSpec);
  const includeDigestIndex = taskSpec?.output?.includeDigestIndex === true;
  const dedupeEnabled = taskSpec?.dedupe?.enabled !== false;
  const dedupeStrategy = safeString(taskSpec?.dedupe?.strategy, "by_title_date");
  const namingPattern = safeString(taskSpec?.destination?.namingPattern);

  return [
    String(systemPrompt || "").trim(),
    "",
    "You are running an unattended workspace automation.",
    "Never ask follow-up questions.",
    "Do not call task management tools.",
    "Never create placeholder/config/spec-only notes about the automation itself.",
    prefersPerItemNotes
      ? "Output mode: create one note per source item (use create_notes_bulk when possible)."
      : "Output mode: create or update one consolidated note for the run.",
    includeDigestIndex ? "Also maintain one digest index note that links/summarizes per-item notes." : "",
    dedupeEnabled
      ? `Before writing notes, search existing notes and avoid duplicates using strategy: ${dedupeStrategy}.`
      : "Duplicate checks are disabled for this run.",
    sourceMode === "workspace" ? "Primary source is workspace notes." : "",
    sourceMode === "web" ? "Primary source is external web content." : "",
    sourceMode === "mixed" ? "Use both workspace notes and external web sources." : "",
    hasRssTool && (sourceMode === "web" || sourceMode === "mixed")
      ? "For news/blog collection, prefer fetch_rss on known feed URLs before broader web search."
      : "",
    sourceMode === "web" || sourceMode === "mixed"
      ? "When web search returns any sources, treat external retrieval as available. Do not report 'no results' unless all web search calls return zero sources."
      : "",
    sourceMode === "web" || sourceMode === "mixed"
      ? "If candidate links are excluded by filters (for example freshness/relevance), state that they were filtered out and why; do not call them missing."
      : "",
    sourceMode === "web" || sourceMode === "mixed"
      ? "Do not discard a candidate only because publish date/author is missing; save it with unknown fields when needed."
      : "",
    sourceQuery ? `When searching external sources, start from query: "${sourceQuery}".` : "",
    resolvedSourceDomains.length ? `Preferred source domains: ${resolvedSourceDomains.join(", ")}.` : "",
    hasRssTool && rssFeedCandidates.length
      ? `RSS feed candidates to try first: ${rssFeedCandidates.join(", ")}.`
      : "",
    Number.isFinite(lookbackHours) && lookbackHours > 0 ? `Freshness window: prioritize last ${Math.floor(lookbackHours)} hours.` : "",
    namingPattern ? `Use destination naming pattern when creating titles: "${namingPattern}".` : "",
    "If required external sources are unavailable through current tools, do not fabricate results or save placeholders; return a brief limitation summary instead.",
    scopeLine,
    `Perform at most ${maxActionsPerRun} mutating tool call(s).`,
    "If no action is needed, return a brief completion note.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAutomationInput(task, { taskSpec, scopeFolder } = {}) {
  const name = safeString(task.name, "Automation");
  const prompt = safeString(task.prompt, name);
  const sourceMode = safeString(taskSpec?.source?.mode, "workspace");
  const outputMode = safeString(taskSpec?.output?.mode, "single_note");

  const lines = [
    `Run automation: ${name}`,
    `Prompt: ${prompt}`,
    `Source mode: ${sourceMode}`,
    `Output mode: ${outputMode}`,
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
  buildChatWebSearchTool = null,
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

    const taskSpec = resolveTaskSpec(task);
    const scopeFolder = resolveTaskScopeFolder(task, taskSpec);
    const sourceDomains = resolveSourceDomains(task, taskSpec);
    const webSearchTool = typeof buildChatWebSearchTool === "function"
      ? buildChatWebSearchTool(sourceDomains)
      : null;
    const responseInclude = webSearchTool ? ["web_search_call.action.sources"] : undefined;
    const hasRssTooling = allowedToolNames.has("fetch_rss") && sourceDomains.length > 0;
    const hasExternalSourceCapability = hasExternalSourceTooling(allowedToolNames) || Boolean(webSearchTool) || hasRssTooling;
    if (taskRequiresExternalResearch(task, taskSpec) && !hasExternalSourceCapability) {
      throw new Error("Automation requires external source retrieval (web/RSS), but no external source tool is configured.");
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
          contextProject: scopeFolder,
        });
        if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
          return resolved;
        }

        const normalizedName = safeString(name).toLowerCase();
        if (
          scopeFolder &&
          (normalizedName === "create_note" || normalizedName === "create_notes_bulk")
        ) {
          if (normalizedName === "create_note" && !safeString(resolved.project)) {
            return {
              ...resolved,
              project: scopeFolder,
            };
          }
          if (normalizedName === "create_notes_bulk") {
            const items = Array.isArray(resolved.items)
              ? resolved.items.map((item) => {
                  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
                  if (safeString(item.project)) return item;
                  return {
                    ...item,
                    project: scopeFolder,
                  };
                })
              : resolved.items;
            return {
              ...resolved,
              ...(safeString(resolved.project) ? {} : { project: scopeFolder }),
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
            project: safeString(args?.project || scopeFolder, ""),
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
      responseTools: webSearchTool ? [...allowedTools, webSearchTool] : allowedTools,
      responseInclude,
      harness,
      initialInput: buildAutomationInput(task, { taskSpec, scopeFolder }),
      initialInstructions: buildAutomationInstructions({
        systemPrompt: CHAT_SYSTEM_PROMPT,
        taskSpec,
        scopeFolder,
        maxActionsPerRun,
        hasRssTool: allowedToolNames.has("fetch_rss"),
        sourceDomains,
      }),
      maxToolRounds: clampInt(maxActionsPerRun + 1, 4, 1, 8),
      temperature: 0.1,
    });

    const outputText = parseTokenTextFromSseChunks(sink.chunks);
    const mutationCommits = parseWorkspaceActionCommitsFromSseChunks(sink.chunks);
    const webSources = parseWebSourcesFromSseChunks(sink.chunks);
    const webSearchCalls = parseWebSearchCallsFromSseChunks(sink.chunks);
    const mutationCount = mutationCommits.length > 0 ? mutationCommits.length : mutationActions;
    const mutationSummary = summarizeMutationCommits(mutationCommits, mutationActions);
    let fallbackSummary = `Automation executed (${mutationActions} action${mutationActions === 1 ? "" : "s"}).`;
    if (mutationCount === 0 && webSearchCalls.length > 0) {
      const searches = webSearchCalls.length;
      fallbackSummary = `Executed ${searches} web search call${searches === 1 ? "" : "s"}; no workspace mutations.`;
      const withSources = webSearchCalls.some((entry) => Number(entry?.sourceCount || 0) > 0);
      if (!withSources) {
        fallbackSummary = `${fallbackSummary} Web search returned no sources.`;
      }
    }
    const normalizedSummary = safeString(mutationSummary, fallbackSummary);

    return {
      summary: normalizedSummary.slice(0, 800),
      output: {
        text: outputText,
        mutationCount,
        mutationActions,
        mutations: mutationCommits.slice(-100),
        webSources: webSources.slice(0, 24),
        webSearchCalls: webSearchCalls.slice(0, 20),
      },
      trace: {
        trigger,
        toolCalls: mutationActions,
        mutationCount,
        webSources: webSources.slice(0, 24),
        webSearchCalls: webSearchCalls.slice(0, 20),
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
