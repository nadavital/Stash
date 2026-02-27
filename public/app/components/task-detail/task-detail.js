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

function toStateClass(state = "") {
  return String(state || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/[^a-z0-9-]/g, "");
}

function stateLabel(state = "") {
  if (state === "pending_approval") return "Pending approval";
  if (state === "active") return "Active";
  return "Paused";
}

function stateActionLabel(state = "") {
  if (state === "pending_approval") return "Approve";
  if (state === "active") return "Pause";
  return "Resume";
}

function formatDateTime(value = "") {
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

function formatDuration(startedAt = "", finishedAt = "") {
  const start = new Date(String(startedAt || ""));
  const end = new Date(String(finishedAt || ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  if (!durationMs) return "";
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!seconds) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function formatSchedule(task = {}) {
  const scheduleType = String(task?.scheduleType || "").trim().toLowerCase();
  if (scheduleType !== "interval") return "Manual";

  const interval = Math.max(1, Number(task?.intervalMinutes || 0));
  let cadence = "Interval";
  if (interval % 1440 === 0) {
    const days = Math.floor(interval / 1440);
    cadence = days === 1 ? "Daily" : `Every ${days} days`;
  } else if (interval % 60 === 0) {
    const hours = Math.floor(interval / 60);
    cadence = hours === 1 ? "Hourly" : `Every ${hours} hours`;
  } else {
    cadence = `Every ${interval} minutes`;
  }

  const nextRunTime = formatTimeOnly(task?.nextRunAt);
  if (nextRunTime && /daily/i.test(cadence)) {
    return `${cadence} at ${nextRunTime}`;
  }

  return cadence;
}

function normalizeComparableText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildPromptSummary(task = {}) {
  const title = String(task?.title || task?.name || "").trim();
  const prompt = String(task?.prompt || "").replace(/\s+/g, " ").trim();
  if (!prompt) return "";

  const normalizedPrompt = normalizeComparableText(prompt);
  const normalizedTitle = normalizeComparableText(title);
  if (normalizedTitle && (
    normalizedPrompt === normalizedTitle
    || normalizedPrompt.startsWith(`${normalizedTitle}:`)
    || normalizedPrompt.startsWith(`${normalizedTitle} -`)
  )) {
    return "";
  }

  const firstSentence = prompt.split(/(?<=[.!?])\s+/)[0] || prompt;
  return firstSentence.slice(0, 220);
}

function formatRunStatus(status = "") {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "unknown";
  return normalized;
}

function formatRunStatusLabel(status = "") {
  const normalized = formatRunStatus(status);
  if (normalized === "success" || normalized === "succeeded") return "Succeeded";
  if (normalized === "failed" || normalized === "error") return "Failed";
  if (normalized === "running") return "Running";
  if (normalized === "cancelled" || normalized === "canceled") return "Canceled";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeRunTraces(run = {}) {
  const traces = Array.isArray(run?.trace?.traces) ? run.trace.traces : [];
  return traces
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .slice(-40)
    .map((entry) => ({
      name: String(entry.name || "").trim().toLowerCase(),
      status: String(entry.status || "").trim().toLowerCase() || "unknown",
      durationMs: Number(entry.durationMs || 0),
      cacheHit: entry.cacheHit === true,
      error: String(entry.error || "").trim(),
    }));
}

function normalizeRunMutations(run = {}) {
  const mutations = Array.isArray(run?.output?.mutations) ? run.output.mutations : [];
  return mutations
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .slice(-40)
    .map((entry) => {
      const result = entry.result && typeof entry.result === "object" ? entry.result : null;
      const patch = entry.patch && typeof entry.patch === "object" ? entry.patch : null;
      const resultTask = result?.task && typeof result.task === "object" ? result.task : null;
      const fallbackId = String(
        result?.noteId
        || result?.folderId
        || resultTask?.id
        || result?.id
        || entry.entityId
        || ""
      ).trim();
      const fallbackTitle = String(
        result?.title
        || resultTask?.title
        || resultTask?.name
        || patch?.title
        || patch?.name
        || ""
      ).trim();
      return {
        mutationType: String(entry.mutationType || "").trim().toLowerCase(),
        entityType: String(entry.entityType || "").trim().toLowerCase(),
        entityId: fallbackId,
        name: String(entry.name || "").trim().toLowerCase(),
        title: fallbackTitle,
      };
    });
}

function normalizeRunWebSources(run = {}) {
  const fromOutput = Array.isArray(run?.output?.webSources) ? run.output.webSources : [];
  const fromTrace = Array.isArray(run?.trace?.webSources) ? run.trace.webSources : [];
  const source = [...fromOutput, ...fromTrace];
  const seen = new Set();
  const items = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const url = String(entry.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({
      url,
      title: String(entry.title || "").trim(),
    });
    if (items.length >= 16) break;
  }
  return items;
}

function normalizeRunWebSearchCalls(run = {}) {
  const fromOutput = Array.isArray(run?.output?.webSearchCalls) ? run.output.webSearchCalls : [];
  const fromTrace = Array.isArray(run?.trace?.webSearchCalls) ? run.trace.webSearchCalls : [];
  const source = [...fromOutput, ...fromTrace];
  const seen = new Set();
  const calls = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const id = String(entry.id || "").trim() || `query:${String(entry.query || "").trim()}`;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    calls.push({
      id: String(entry.id || "").trim(),
      query: String(entry.query || "").trim(),
      status: String(entry.status || "").trim().toLowerCase() || "completed",
      sourceCount: Math.max(0, Math.floor(Number(entry.sourceCount || 0) || 0)),
    });
    if (calls.length >= 16) break;
  }
  return calls;
}

function renderMutationLabel(mutation = {}) {
  const mutationType = String(mutation?.mutationType || "").trim().toLowerCase();
  if (mutationType === "note.create") return "Created note";
  if (mutationType === "note.update") return "Updated note";
  if (mutationType === "note.content.update") return "Updated note content";
  if (mutationType === "folder.create") return "Created folder";
  if (mutationType === "folder.update") return "Updated folder";
  if (mutationType === "task.create") return "Created automation";
  if (mutationType === "task.update") return "Updated automation";
  return mutationType || "Mutated workspace item";
}

function buildHumanRunSummary(run = {}) {
  const mutations = normalizeRunMutations(run);
  if (!mutations.length) {
    const error = String(run?.error || "").replace(/\s+/g, " ").trim();
    if (error) return error;
    const summary = String(run?.summary || "").replace(/\s+/g, " ").trim();
    return summary || "Run completed.";
  }

  let noteCreates = 0;
  let noteUpdates = 0;
  let folderCreates = 0;
  let folderUpdates = 0;
  let taskMutations = 0;
  const createdNoteTitles = [];
  for (const mutation of mutations) {
    const type = String(mutation?.mutationType || "").trim().toLowerCase();
    if (type === "note.create") {
      noteCreates += 1;
      if (mutation.title) createdNoteTitles.push(mutation.title);
      continue;
    }
    if (type === "note.update" || type === "note.content.update") {
      noteUpdates += 1;
      continue;
    }
    if (type === "folder.create") {
      folderCreates += 1;
      continue;
    }
    if (type === "folder.update") {
      folderUpdates += 1;
      continue;
    }
    if (type === "task.create" || type === "task.update") {
      taskMutations += 1;
    }
  }

  const parts = [];
  if (noteCreates > 0) parts.push(`Created ${noteCreates} note${noteCreates === 1 ? "" : "s"}`);
  if (noteUpdates > 0) parts.push(`Updated ${noteUpdates} note${noteUpdates === 1 ? "" : "s"}`);
  if (folderCreates > 0) parts.push(`Created ${folderCreates} folder${folderCreates === 1 ? "" : "s"}`);
  if (folderUpdates > 0) parts.push(`Updated ${folderUpdates} folder${folderUpdates === 1 ? "" : "s"}`);
  if (taskMutations > 0) parts.push(`Updated ${taskMutations} automation${taskMutations === 1 ? "" : "s"}`);
  if (!parts.length) parts.push(`Committed ${mutations.length} mutation${mutations.length === 1 ? "" : "s"}`);

  const titlePreview = [...new Set(createdNoteTitles)].slice(0, 2);
  const titleSuffix = titlePreview.length ? ` (${titlePreview.join(", ")})` : "";
  return `${parts.join("; ")}${titleSuffix}.`;
}

function renderRunArtifactPreview(run = {}) {
  const mutations = normalizeRunMutations(run);
  if (!mutations.length) return "";
  const preview = mutations.slice(0, 3);
  return `
    <p class="task-detail-run-artifacts-preview">
      ${preview.map((mutation) => {
        const typeLabel = renderMutationLabel(mutation);
        const label = mutation.title || mutation.entityId || mutation.entityType || "workspace item";
        return `<span class="task-detail-run-artifact-pill">${escapeHtml(typeLabel)}: ${escapeHtml(label)}</span>`;
      }).join("")}
      ${mutations.length > 3 ? `<span class="task-detail-run-artifact-pill">+${mutations.length - 3} more</span>` : ""}
    </p>
  `;
}

function buildRunHoverText(run = {}, body = "") {
  const traces = normalizeRunTraces(run);
  const mutations = normalizeRunMutations(run);
  const webSources = normalizeRunWebSources(run);
  const webSearchCalls = normalizeRunWebSearchCalls(run);
  const bits = [];
  if (body) bits.push(body);
  if (traces.length) {
    bits.push(`Tools: ${traces.map((trace) => trace.name || "tool").join(", ")}`);
  }
  if (mutations.length) {
    bits.push(`Mutations: ${mutations.length}`);
  }
  if (webSources.length) {
    bits.push(`Web sources: ${webSources.length}`);
  }
  if (webSearchCalls.length) {
    bits.push(`Web searches: ${webSearchCalls.length}`);
  }
  return bits.join(" | ").slice(0, 280);
}

function renderRunInspector(run = {}, { taskId = "", runIndex = -1 } = {}) {
  const traces = normalizeRunTraces(run);
  const mutations = normalizeRunMutations(run);
  const webSources = normalizeRunWebSources(run);
  const webSearchCalls = normalizeRunWebSearchCalls(run);
  const outputText = String(run?.output?.text || "").trim();
  const runId = String(run?.id || "").trim();
  const summaryBits = [];
  if (traces.length) summaryBits.push(`${traces.length} tool call${traces.length === 1 ? "" : "s"}`);
  if (mutations.length) summaryBits.push(`${mutations.length} mutation${mutations.length === 1 ? "" : "s"}`);
  if (webSources.length) summaryBits.push(`${webSources.length} web source${webSources.length === 1 ? "" : "s"}`);
  if (webSearchCalls.length) summaryBits.push(`${webSearchCalls.length} web search${webSearchCalls.length === 1 ? "" : "es"}`);
  if (!summaryBits.length && !outputText) return "";

  const traceListMarkup = traces.length
    ? `
      <div class="task-detail-run-inspector-block">
        <p class="task-detail-run-inspector-label">Tool trace</p>
        <ul class="task-detail-run-inspector-list">
          ${traces.map((trace) => {
            const duration = Number.isFinite(trace.durationMs) && trace.durationMs > 0
              ? `${Math.round(trace.durationMs)}ms`
              : "";
            const traceMeta = [trace.status || "unknown", duration, trace.cacheHit ? "cache" : ""]
              .filter(Boolean)
              .join(" \u00b7 ");
            const traceError = trace.error ? ` \u2014 ${trace.error}` : "";
            return `<li>${escapeHtml(trace.name || "tool")} (${escapeHtml(traceMeta)})${escapeHtml(traceError)}</li>`;
          }).join("")}
        </ul>
      </div>
    `
    : "";

  const mutationListMarkup = mutations.length
    ? `
      <div class="task-detail-run-inspector-block">
        <p class="task-detail-run-inspector-label">Artifacts</p>
        <ul class="task-detail-run-inspector-list">
          ${mutations.map((mutation) => {
            const label = renderMutationLabel(mutation);
            const entityRef = mutation.title
              ? `${mutation.title}${mutation.entityId ? ` (${mutation.entityId})` : ""}`
              : mutation.entityId || mutation.entityType || "workspace item";
            const canOpen = Boolean(
              mutation.entityId
              && (mutation.entityType === "note" || mutation.entityType === "folder" || mutation.entityType === "task")
            );
            if (!canOpen) {
              return `<li>${escapeHtml(label)}: ${escapeHtml(entityRef)}</li>`;
            }
            return `
              <li>
                <button
                  type="button"
                  class="task-detail-run-entity-btn"
                  data-task-detail-action="open-entity"
                  data-entity-type="${escapeHtml(mutation.entityType)}"
                  data-entity-id="${escapeHtml(mutation.entityId)}"
                >
                  ${escapeHtml(label)}: ${escapeHtml(entityRef)}
                </button>
              </li>
            `;
          }).join("")}
        </ul>
      </div>
    `
    : "";

  const outputMarkup = outputText
    ? `
      <div class="task-detail-run-inspector-block">
        <p class="task-detail-run-inspector-label">Model summary</p>
        <pre class="task-detail-run-output">${escapeHtml(outputText)}</pre>
      </div>
    `
    : "";

  const webSourcesMarkup = webSources.length
    ? `
      <div class="task-detail-run-inspector-block">
        <p class="task-detail-run-inspector-label">Web sources</p>
        <ul class="task-detail-run-inspector-list">
          ${webSources.map((source) => {
            const label = source.title || source.url;
            return `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a></li>`;
          }).join("")}
        </ul>
      </div>
    `
    : "";

  const webSearchMarkup = webSearchCalls.length
    ? `
      <div class="task-detail-run-inspector-block">
        <p class="task-detail-run-inspector-label">Web search diagnostics</p>
        <ul class="task-detail-run-inspector-list">
          ${webSearchCalls.map((search) => {
            const query = search.query || "(query unavailable)";
            const meta = `${search.status || "completed"} \u00b7 ${search.sourceCount} source${search.sourceCount === 1 ? "" : "s"}`;
            return `<li>${escapeHtml(query)} (${escapeHtml(meta)})</li>`;
          }).join("")}
        </ul>
      </div>
    `
    : "";

  const inspectorActionsMarkup = (taskId || runId || runIndex >= 0)
    ? `
      <div class="task-detail-run-inspector-actions">
        <button
          type="button"
          class="task-detail-run-copy-btn"
          data-task-detail-action="copy-run-debug"
          data-task-id="${escapeHtml(taskId)}"
          data-run-id="${escapeHtml(runId)}"
          data-run-index="${Number.isFinite(Number(runIndex)) ? String(Math.max(0, Math.floor(Number(runIndex)))) : ""}"
        >
          Copy run debug
        </button>
      </div>
    `
    : "";

  return `
    <details class="task-detail-run-inspector">
      <summary class="task-detail-run-inspector-toggle">View run details (${escapeHtml(summaryBits.join(" \u00b7 "))})</summary>
      <div class="task-detail-run-inspector-content">
        ${traceListMarkup}
        ${webSearchMarkup}
        ${webSourcesMarkup}
        ${mutationListMarkup}
        ${outputMarkup}
        ${inspectorActionsMarkup}
      </div>
    </details>
  `;
}

function renderRuns(runs = [], { loading = false, taskId = "" } = {}) {
  if (loading) {
    return `<li class="task-detail-run task-detail-run--placeholder">Loading runs...</li>`;
  }
  const entries = Array.isArray(runs) ? runs : [];
  if (!entries.length) {
    return `<li class="task-detail-run task-detail-run--placeholder">No runs yet.</li>`;
  }

  return entries.map((run, runIndex) => {
    const status = formatRunStatus(run?.status);
    const statusClass = toStateClass(status);
    const statusText = formatRunStatusLabel(status);
    const startedAt = formatDateTime(run?.startedAt);
    const finishedAt = formatDateTime(run?.finishedAt);
    const duration = formatDuration(run?.startedAt, run?.finishedAt);
    const body = buildHumanRunSummary(run);
    const hoverText = buildRunHoverText(run, body);
    const artifactPreviewMarkup = renderRunArtifactPreview(run);
    const inspectorMarkup = renderRunInspector(run, { taskId, runIndex });

    return `
      <li class="task-detail-run is-${escapeHtml(statusClass)}">
        <p class="task-detail-run-head">
          <span class="task-detail-run-status is-${escapeHtml(statusClass)}">${escapeHtml(statusText)}</span>
          ${startedAt ? `<span>${escapeHtml(startedAt)}</span>` : ""}
          ${duration ? `<span>${escapeHtml(duration)}</span>` : ""}
        </p>
        <p class="task-detail-run-body"${hoverText ? ` title="${escapeHtml(hoverText)}"` : ""}>${escapeHtml(body)}</p>
        ${artifactPreviewMarkup}
        ${inspectorMarkup}
        ${
          finishedAt && finishedAt !== startedAt
            ? `<p class="task-detail-run-foot">Finished ${escapeHtml(finishedAt)}</p>`
            : ""
        }
      </li>
    `;
  }).join("");
}

export function renderTaskDetailHTML({
  idBase = "task-detail",
  emptyText = "Select an automation card to inspect runs.",
} = {}) {
  return `
    <section class="task-detail" data-component="task-detail" data-id-base="${escapeHtml(idBase)}" aria-label="Automation detail">
      <div id="${escapeHtml(idBase)}-content" class="task-detail-content hidden"></div>
      <p id="${escapeHtml(idBase)}-empty" class="task-detail-empty">${escapeHtml(emptyText)}</p>
    </section>
  `;
}

export function queryTaskDetailEls(root, { idBase = "task-detail" } = {}) {
  return {
    taskDetailRoot: root.querySelector(`[data-component="task-detail"][data-id-base="${String(idBase || "")}"]`),
    taskDetailContent: root.querySelector(`#${String(idBase || "")}-content`),
    taskDetailEmpty: root.querySelector(`#${String(idBase || "")}-empty`),
  };
}

export function renderTaskDetail(
  els,
  {
    task = null,
    runs = [],
    runsLoading = false,
    showBack = false,
    runPendingTaskId = "",
    notFoundText = "Automation not found.",
  } = {},
) {
  if (!els?.taskDetailContent || !els?.taskDetailEmpty) return;

  if (!task || typeof task !== "object") {
    els.taskDetailContent.innerHTML = "";
    els.taskDetailContent.classList.add("hidden");
    els.taskDetailEmpty.textContent = String(notFoundText || "Automation not found.");
    els.taskDetailEmpty.classList.remove("hidden");
    return;
  }

  const id = String(task?.id || "").trim();
  const title = String(task?.title || task?.name || "").trim() || "Untitled automation";
  const state = normalizeState(task);
  const stateClass = toStateClass(state);
  const schedule = formatSchedule(task);
  const destination = String(task?.scopeFolder || task?.project || "").trim() || "Workspace root";
  const nextRunAt = formatDateTime(task?.nextRunAt);
  const summary = buildPromptSummary(task);
  const canRun = state !== "pending_approval";
  const runPending = canRun && String(runPendingTaskId || "").trim() === id;

  els.taskDetailContent.classList.remove("hidden");
  els.taskDetailEmpty.classList.add("hidden");
  els.taskDetailContent.innerHTML = `
    <article class="task-detail-card is-${escapeHtml(stateClass)}">
      <header class="task-detail-head">
        <div class="task-detail-heading">
          <p class="task-detail-label">Automation</p>
          <h2 class="task-detail-title">${escapeHtml(title)}</h2>
          <p class="task-detail-status-row">
            <span class="task-detail-status is-${escapeHtml(stateClass)}">${escapeHtml(stateLabel(state))}</span>
            <span>${escapeHtml(schedule)}</span>
            ${nextRunAt ? `<span>Next ${escapeHtml(nextRunAt)}</span>` : ""}
          </p>
        </div>
        ${
          showBack
            ? `
              <button
                type="button"
                class="task-detail-nav-btn"
                data-task-detail-action="back"
                aria-label="Back to automations list"
              >
                Back
              </button>
            `
            : ""
        }
      </header>

      <p class="task-detail-destination">Saves to ${escapeHtml(destination)}</p>
      ${summary ? `<p class="task-detail-summary">${escapeHtml(summary)}</p>` : ""}

      <div class="task-detail-actions">
        ${
          canRun
            ? `
              <button
                type="button"
                class="task-detail-action-btn is-primary"
                data-task-detail-action="run"
                data-task-id="${escapeHtml(id)}"
                ${runPending ? "disabled aria-busy=\"true\"" : ""}
              >
                ${runPending ? "Running..." : "Run now"}
              </button>
            `
            : ""
        }
        <button
          type="button"
          class="task-detail-action-btn"
          data-task-detail-action="state"
          data-task-id="${escapeHtml(id)}"
          data-task-state="${escapeHtml(state)}"
        >
          ${escapeHtml(stateActionLabel(state))}
        </button>
        <button
          type="button"
          class="task-detail-action-btn"
          data-task-detail-action="edit"
          data-task-id="${escapeHtml(id)}"
        >
          Edit
        </button>
        <button
          type="button"
          class="task-detail-action-btn is-danger"
          data-task-detail-action="delete"
          data-task-id="${escapeHtml(id)}"
          data-task-title="${escapeHtml(title)}"
        >
          Delete
        </button>
      </div>
      ${runPending ? `<p class="task-detail-run-pending">Automation run in progress. This view refreshes once it completes.</p>` : ""}

      <section class="task-detail-runs" aria-label="Automation runs">
        <p class="task-detail-runs-title">Recent runs</p>
        <ul class="task-detail-runs-list">
          ${renderRuns(runs, { loading: runsLoading, taskId: id })}
        </ul>
      </section>
    </article>
  `;
}

export function initTaskDetail(els, callbacks = {}) {
  const disposers = [];

  function on(target, eventName, handler) {
    if (!target) return;
    target.addEventListener(eventName, handler);
    disposers.push(() => target.removeEventListener(eventName, handler));
  }

  on(els?.taskDetailRoot, "click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("[data-task-detail-action]");
    if (!(button instanceof HTMLButtonElement)) return;

    const action = String(button.dataset.taskDetailAction || "").trim();
    const entityType = String(button.dataset.entityType || "").trim().toLowerCase();
    const entityId = String(button.dataset.entityId || "").trim();
    const taskId = String(button.dataset.taskId || "").trim();
    const runId = String(button.dataset.runId || "").trim();
    const runIndexRaw = Number(button.dataset.runIndex);
    const runIndex = Number.isFinite(runIndexRaw) ? Math.max(0, Math.floor(runIndexRaw)) : -1;
    const state = String(button.dataset.taskState || "").trim().toLowerCase();
    const title = String(button.dataset.taskTitle || "").trim();

    if (action === "open-entity" && typeof callbacks.onOpenEntity === "function") {
      if (!entityId || !entityType) return;
      await callbacks.onOpenEntity({ entityType, entityId });
      return;
    }

    if (action === "copy-run-debug" && typeof callbacks.onCopyRunDebug === "function") {
      await callbacks.onCopyRunDebug({ taskId, runId, runIndex });
      return;
    }

    if (action === "back" && typeof callbacks.onBack === "function") {
      await callbacks.onBack();
      return;
    }
    if (!taskId) return;

    if (action === "run" && typeof callbacks.onRun === "function") {
      await callbacks.onRun({ id: taskId });
      return;
    }
    if (action === "state" && typeof callbacks.onToggle === "function") {
      await callbacks.onToggle({ id: taskId, state });
      return;
    }
    if (action === "edit" && typeof callbacks.onEdit === "function") {
      await callbacks.onEdit({ id: taskId });
      return;
    }
    if (action === "delete" && typeof callbacks.onDelete === "function") {
      await callbacks.onDelete({ id: taskId, title });
    }
  });

  return () => {
    for (const dispose of disposers) dispose();
  };
}
