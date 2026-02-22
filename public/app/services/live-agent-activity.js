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
  actionName = "",
  text = "",
  status = "success",
  updatedAt = "",
} = {}) {
  const normalizedText = String(text || "").trim();
  if (!normalizedText) return null;
  return {
    id: String(id || "").trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

function withUpdatedEntry(entries = [], actionName = "", updater) {
  const nextEntries = [...entries];
  for (let i = 0; i < nextEntries.length; i += 1) {
    if (nextEntries[i].actionName !== actionName) continue;
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
  actionName = "",
  now = Date.now(),
} = {}) {
  const base = normalizeState(state);
  const entry = createEntry({
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
  const phase = String(action?.phase || "").trim().toLowerCase();
  if (!actionName || !phase) return base;

  const label = labelForAction(actionName);
  const stamp = makeTimestamp(now);
  const errorText = String(action?.error || "").trim();

  if (phase === "start") {
    const started = createEntry({
      actionName,
      text: `${label}...`,
      status: "running",
      updatedAt: stamp,
    });
    if (!started) return base;
    const entries = trimEntries([started, ...base.entries]);
    return {
      active: true,
      text: started.text,
      entries,
    };
  }

  if (phase !== "done") return base;

  const doneStatus = errorText ? "error" : "success";
  const doneText = errorText ? `${label} failed` : `${label} done`;
  let entries = withUpdatedEntry(base.entries, actionName, (entry) => ({
    ...entry,
    status: doneStatus,
    text: doneText,
    updatedAt: stamp,
  }));

  const updatedExisting = entries.some((entry) => (
    entry.actionName === actionName &&
    entry.updatedAt === stamp &&
    entry.text === doneText
  ));
  if (!updatedExisting) {
    const completed = createEntry({
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

