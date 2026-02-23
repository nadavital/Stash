const ACTION_LABELS = Object.freeze({
  create_note: "Saving item",
  create_folder: "Creating folder",
  search_notes: "Searching notes",
  get_note_raw_content: "Loading note content",
  update_note: "Updating item",
  update_note_markdown: "Updating content",
  update_note_attachment: "Updating attachment",
  add_note_comment: "Adding comment",
  list_note_versions: "Loading versions",
  restore_note_version: "Restoring version",
  retry_note_enrichment: "Retrying enrichment",
  list_activity: "Loading activity",
  set_folder_collaborator: "Updating collaborators",
  remove_folder_collaborator: "Updating collaborators",
  list_folder_collaborators: "Loading collaborators",
});

const NOTE_MUTATION_ACTIONS = new Set([
  "create_note",
  "update_note",
  "update_note_markdown",
  "update_note_attachment",
  "add_note_comment",
  "restore_note_version",
  "retry_note_enrichment",
]);

function isNoteMutationAction(actionName = "") {
  return NOTE_MUTATION_ACTIONS.has(String(actionName || "").trim());
}

function normalizeStatus(value, fallback = "success") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["running", "success", "error", "queued"].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeEntries(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      id: String(entry.id || "").trim(),
      actionId: String(entry.actionId || "").trim(),
      actionName: String(entry.actionName || "").trim(),
      text: String(entry.text || "").trim(),
      status: normalizeStatus(entry.status, "success"),
      updatedAt: String(entry.updatedAt || "").trim(),
    }))
    .filter((entry) => entry.text);
}

function normalizeState(state = null) {
  return {
    active: Boolean(state?.active),
    text: String(state?.text || "").trim(),
    entries: normalizeEntries(state?.entries),
  };
}

function makeTimestamp(now = Date.now()) {
  return new Date(Number.isFinite(Number(now)) ? Number(now) : Date.now()).toISOString();
}

function trimEntries(entries = [], max = 8) {
  return normalizeEntries(entries).slice(0, max);
}

function createEntry({
  id = "",
  actionId = "",
  actionName = "",
  text = "",
  status = "success",
  updatedAt = "",
} = {}) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return null;
  return {
    id: String(id || "").trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    actionId: String(actionId || "").trim(),
    actionName: String(actionName || "").trim(),
    text: normalizedText,
    status: normalizeStatus(status, "success"),
    updatedAt: String(updatedAt || "").trim() || makeTimestamp(),
  };
}

function labelForAction(name = "") {
  const normalized = String(name || "").trim();
  if (!normalized) return "Working";
  return ACTION_LABELS[normalized] || "Working";
}

function withUpdatedEntry(entries = [], actionName = "", actionId = "", updater) {
  const nextEntries = [...entries];
  const normalizedActionId = String(actionId || "").trim();
  for (let i = 0; i < nextEntries.length; i += 1) {
    if (normalizedActionId) {
      if (String(nextEntries[i].actionId || "").trim() !== normalizedActionId) continue;
    } else if (nextEntries[i].actionName !== actionName) {
      continue;
    }
    if (nextEntries[i].status !== "running") continue;
    const updated = updater(nextEntries[i], i);
    if (updated) {
      nextEntries[i] = updated;
      return nextEntries;
    }
  }
  return nextEntries;
}

export function createLiveAgentActivityState() {
  return {
    active: false,
    text: "",
    entries: [],
  };
}

export function pushLiveAgentActivityEntry(state = null, {
  text = "",
  status = "success",
  actionId = "",
  actionName = "",
  now = Date.now(),
} = {}) {
  const base = normalizeState(state);
  const entry = createEntry({
    actionId,
    actionName,
    text,
    status,
    updatedAt: makeTimestamp(now),
  });
  if (!entry) return base;
  const entries = trimEntries([entry, ...base.entries]);
  return {
    active: entries.some((candidate) => candidate.status === "running"),
    text: entry.text,
    entries,
  };
}

export function applyWorkspaceActionToLiveActivity(state = null, action = null, now = Date.now()) {
  const base = normalizeState(state);
  const actionName = String(action?.name || "").trim();
  const actionId = String(action?.actionId || "").trim();
  const phase = String(action?.phase || "").trim().toLowerCase();
  if (!actionName || !phase) return base;

  const label = labelForAction(actionName);
  const stamp = makeTimestamp(now);
  const errorText = String(action?.error || "").trim();
  const noteMutation = isNoteMutationAction(actionName);

  if (phase === "start" || phase === "progress") {
    const runningText = noteMutation ? "Agent editing..." : `${label}...`;
    let entries = withUpdatedEntry(base.entries, actionName, actionId, (entry) => ({
      ...entry,
      status: "running",
      text: runningText,
      updatedAt: stamp,
    }));
    const hasRunningEntry = entries.some((entry) => (
      (actionId ? String(entry.actionId || "").trim() === actionId : entry.actionName === actionName) &&
      entry.status === "running"
    ));
    if (!hasRunningEntry) {
      const started = createEntry({
        actionId,
        actionName,
        text: runningText,
        status: "running",
        updatedAt: stamp,
      });
      if (started) {
        entries = [started, ...entries];
      }
    }
    entries = trimEntries(entries);
    return {
      active: true,
      text: runningText,
      entries,
    };
  }

  if (phase !== "commit" && phase !== "done" && phase !== "error") return base;

  const doneStatus = phase === "error" || errorText ? "error" : "success";
  const doneText = doneStatus === "error"
    ? (noteMutation ? "Couldn’t apply AI update" : `${label} failed`)
    : (noteMutation ? "Updated by AI just now" : `${label} done`);

  let entries = withUpdatedEntry(base.entries, actionName, actionId, (entry) => ({
    ...entry,
    status: doneStatus,
    text: doneText,
    updatedAt: stamp,
  }));

  const updatedExisting = entries.some((entry) => (
    (actionId ? String(entry.actionId || "").trim() === actionId : entry.actionName === actionName) &&
    entry.updatedAt === stamp &&
    entry.text === doneText
  ));
  if (!updatedExisting) {
    const completed = createEntry({
      actionId,
      actionName,
      text: doneText,
      status: doneStatus,
      updatedAt: stamp,
    });
    if (completed) {
      entries = [completed, ...entries];
    }
  }

  entries = trimEntries(entries);
  return {
    active: entries.some((entry) => entry.status === "running"),
    text: doneText,
    entries,
  };
}
