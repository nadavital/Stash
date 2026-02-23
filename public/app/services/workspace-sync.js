function toTrimmed(value = "") {
  return String(value || "").trim();
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function ensureEntityState(state = null) {
  return {
    notesById: state?.notesById && typeof state.notesById === "object" ? state.notesById : {},
    foldersById: state?.foldersById && typeof state.foldersById === "object" ? state.foldersById : {},
    notes: Array.isArray(state?.notes) ? state.notes : [],
  };
}

function mapToolName(name = "") {
  const normalized = toTrimmed(name).toLowerCase();
  switch (normalized) {
    case "create_note":
      return { entityType: "note", mutationType: "note.create" };
    case "update_note":
      return { entityType: "note", mutationType: "note.update" };
    case "update_note_markdown":
      return { entityType: "note", mutationType: "note.content.update" };
    case "update_note_attachment":
      return { entityType: "note", mutationType: "note.attachment.update" };
    case "add_note_comment":
      return { entityType: "note", mutationType: "note.comment.add" };
    case "restore_note_version":
      return { entityType: "note", mutationType: "note.version.restore" };
    case "retry_note_enrichment":
      return { entityType: "note", mutationType: "note.enrichment.retry" };
    case "delete_note":
      return { entityType: "note", mutationType: "note.delete" };
    case "create_folder":
      return { entityType: "folder", mutationType: "folder.create" };
    case "set_folder_collaborator":
      return { entityType: "folder", mutationType: "folder.collaborator.set" };
    case "remove_folder_collaborator":
      return { entityType: "folder", mutationType: "folder.collaborator.remove" };
    case "update_folder":
      return { entityType: "folder", mutationType: "folder.update" };
    case "delete_folder":
      return { entityType: "folder", mutationType: "folder.delete" };
    default:
      return { entityType: "", mutationType: "" };
  }
}

function normalizeAction(action = null) {
  if (!action || typeof action !== "object") return null;
  const mapped = mapToolName(action.name);
  const patch =
    action.patch && typeof action.patch === "object"
      ? action.patch
      : action.result && typeof action.result?.patch === "object"
        ? action.result.patch
        : null;
  const result = action.result && typeof action.result === "object" ? action.result : {};
  const nextRevision = toFiniteNumber(action.nextRevision)
    ?? toFiniteNumber(patch?.revision)
    ?? toFiniteNumber(result?.revision);
  const baseRevision = toFiniteNumber(action.baseRevision);
  const phase = toTrimmed(action.phase || action.status || "").toLowerCase();
  const entityType = toTrimmed(action.entityType || mapped.entityType).toLowerCase();
  const entityId = toTrimmed(
    action.entityId ||
      action.noteId ||
      action.folderId ||
      result.noteId ||
      result.folderId
  );
  const mutationType = toTrimmed(action.mutationType || mapped.mutationType).toLowerCase();

  if (!phase || !entityType) return null;
  if (!["start", "progress", "commit", "error", "done"].includes(phase)) return null;

  return {
    actionId: toTrimmed(action.actionId),
    phase: phase === "done" ? "commit" : phase,
    name: toTrimmed(action.name),
    entityType,
    entityId,
    mutationType,
    patch,
    baseRevision,
    nextRevision,
    result,
    error: toTrimmed(action.error),
  };
}

function cloneNote(note = null, id = "") {
  return {
    id: toTrimmed(note?.id || id),
    title: toTrimmed(note?.title),
    content: String(note?.content || ""),
    summary: String(note?.summary || ""),
    tags: Array.isArray(note?.tags) ? [...note.tags] : [],
    project: toTrimmed(note?.project),
    metadata: note?.metadata && typeof note.metadata === "object" ? { ...note.metadata } : {},
    status: toTrimmed(note?.status),
    revision: toFiniteNumber(note?.revision) || 1,
    sourceType: toTrimmed(note?.sourceType),
    sourceUrl: String(note?.sourceUrl || ""),
    fileName: String(note?.fileName || ""),
    fileMime: String(note?.fileMime || ""),
    fileSize: toFiniteNumber(note?.fileSize) || 0,
    rawContent: String(note?.rawContent || ""),
    markdownContent: String(note?.markdownContent || ""),
    createdAt: String(note?.createdAt || ""),
    updatedAt: String(note?.updatedAt || ""),
  };
}

function mergeNote(base = null, action = null) {
  const entityId = toTrimmed(action?.entityId || action?.result?.noteId || base?.id);
  if (!entityId) return null;
  const note = cloneNote(base, entityId);
  const patch = action?.patch && typeof action.patch === "object" ? action.patch : {};
  const result = action?.result && typeof action.result === "object" ? action.result : {};

  if (typeof patch.content === "string") note.content = patch.content;
  if (typeof patch.summary === "string") note.summary = patch.summary;
  if (typeof patch.rawContent === "string") note.rawContent = patch.rawContent;
  if (typeof patch.markdownContent === "string") note.markdownContent = patch.markdownContent;
  if (Array.isArray(patch.tags)) note.tags = patch.tags.map((tag) => String(tag || "").trim()).filter(Boolean);
  if (typeof patch.project === "string") note.project = toTrimmed(patch.project);
  if (typeof patch.status === "string") note.status = toTrimmed(patch.status);
  if (typeof patch.title === "string") {
    const title = toTrimmed(patch.title);
    note.metadata = { ...(note.metadata || {}), ...(title ? { title } : {}) };
  }

  if (typeof result.title === "string" && toTrimmed(result.title)) {
    const title = toTrimmed(result.title);
    note.metadata = { ...(note.metadata || {}), title };
  }
  if (typeof result.sourceType === "string" && toTrimmed(result.sourceType)) {
    note.sourceType = toTrimmed(result.sourceType);
  }
  if (typeof result.fileName === "string" && result.fileName) {
    note.fileName = String(result.fileName);
  }
  if (toFiniteNumber(action?.nextRevision) !== null) {
    note.revision = toFiniteNumber(action.nextRevision);
  } else if (toFiniteNumber(patch.revision) !== null) {
    note.revision = toFiniteNumber(patch.revision);
  }
  if (typeof patch.updatedAt === "string" && patch.updatedAt) {
    note.updatedAt = String(patch.updatedAt);
  } else if (typeof result.updatedAt === "string" && result.updatedAt) {
    note.updatedAt = String(result.updatedAt);
  }
  return note;
}

function cloneFolder(folder = null, id = "") {
  return {
    id: toTrimmed(folder?.id || id),
    name: toTrimmed(folder?.name),
    description: String(folder?.description || ""),
    color: toTrimmed(folder?.color),
    symbol: toTrimmed(folder?.symbol),
    parentId: toTrimmed(folder?.parentId),
    updatedAt: String(folder?.updatedAt || ""),
    createdAt: String(folder?.createdAt || ""),
  };
}

function mergeFolder(base = null, action = null) {
  const entityId = toTrimmed(action?.entityId || action?.result?.folderId || base?.id);
  if (!entityId) return null;
  const folder = cloneFolder(base, entityId);
  const patch = action?.patch && typeof action.patch === "object" ? action.patch : {};
  const result = action?.result && typeof action.result === "object" ? action.result : {};
  if (typeof patch.name === "string") folder.name = toTrimmed(patch.name);
  if (typeof patch.description === "string") folder.description = String(patch.description || "");
  if (typeof patch.color === "string") folder.color = toTrimmed(patch.color);
  if (typeof patch.symbol === "string") folder.symbol = toTrimmed(patch.symbol);
  if (typeof result.name === "string" && toTrimmed(result.name)) folder.name = toTrimmed(result.name);
  if (typeof patch.updatedAt === "string" && patch.updatedAt) {
    folder.updatedAt = String(patch.updatedAt);
  } else if (typeof result.updatedAt === "string" && result.updatedAt) {
    folder.updatedAt = String(result.updatedAt);
  }
  return folder;
}

function upsertNotesById(current = {}, notes = []) {
  let changed = false;
  const next = { ...(current || {}) };
  for (const raw of Array.isArray(notes) ? notes : []) {
    const id = toTrimmed(raw?.id);
    if (!id) continue;
    const prev = next[id];
    const candidate = cloneNote(raw, id);
    const prevRevision = toFiniteNumber(prev?.revision) || 0;
    const candidateRevision = toFiniteNumber(candidate?.revision) || 0;
    if (prev) {
      if (candidateRevision > 0 && prevRevision > 0 && candidateRevision < prevRevision) {
        continue;
      }
      if (candidateRevision === 0 && prevRevision > 0) {
        continue;
      }
    }
    if (!prev || JSON.stringify(prev) !== JSON.stringify(candidate)) {
      next[id] = candidate;
      changed = true;
    }
  }
  return { changed, next };
}

function upsertFoldersById(current = {}, folders = []) {
  let changed = false;
  const next = { ...(current || {}) };
  for (const raw of Array.isArray(folders) ? folders : []) {
    const id = toTrimmed(raw?.id);
    if (!id) continue;
    const prev = next[id];
    const candidate = cloneFolder(raw, id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(candidate)) {
      next[id] = candidate;
      changed = true;
    }
  }
  return { changed, next };
}

function hydrateNotesFromMap(notes = [], notesById = {}) {
  return (Array.isArray(notes) ? notes : []).map((note) => {
    const id = toTrimmed(note?.id);
    if (!id || !notesById[id]) return note;
    const canonical = notesById[id];
    return {
      ...note,
      ...canonical,
      metadata: {
        ...(note?.metadata || {}),
        ...(canonical?.metadata || {}),
      },
    };
  });
}

function applyActivityEventToState(state = null, event = null) {
  if (!event || typeof event !== "object") return { changed: false, patch: {} };
  const eventType = toTrimmed(event.eventType).toLowerCase();
  const entityType = toTrimmed(event.entityType).toLowerCase();
  const entityId = toTrimmed(event.entityId || event.noteId || event.folderId);
  if (!eventType || !entityType || !entityId) return { changed: false, patch: {} };

  const { notesById, foldersById, notes } = ensureEntityState(state);
  let nextNotesById = notesById;
  let nextFoldersById = foldersById;
  let nextNotes = notes;
  let changed = false;

  if (entityType === "note") {
    if (eventType === "note.deleted") {
      if (nextNotesById[entityId]) {
        nextNotesById = { ...nextNotesById };
        delete nextNotesById[entityId];
        nextNotes = nextNotes.filter((note) => toTrimmed(note?.id) !== entityId);
        changed = true;
      }
    } else if (eventType === "note.updated" || eventType === "note.created") {
      const prev = nextNotesById[entityId] || null;
      const candidate = cloneNote(prev, entityId);
      const details = event.details && typeof event.details === "object" ? event.details : {};
      if (typeof details.title === "string" && toTrimmed(details.title)) {
        candidate.metadata = { ...(candidate.metadata || {}), title: toTrimmed(details.title) };
      }
      if (typeof details.project === "string") {
        candidate.project = toTrimmed(details.project);
      }
      candidate.updatedAt = new Date().toISOString();
      if (!prev || JSON.stringify(prev) !== JSON.stringify(candidate)) {
        nextNotesById = { ...nextNotesById, [entityId]: candidate };
        nextNotes = hydrateNotesFromMap(nextNotes, nextNotesById);
        changed = true;
      }
    }
  } else if (entityType === "folder") {
    if (eventType === "folder.deleted") {
      if (nextFoldersById[entityId]) {
        nextFoldersById = { ...nextFoldersById };
        delete nextFoldersById[entityId];
        changed = true;
      }
    } else if (eventType === "folder.created" || eventType === "folder.updated") {
      const prev = nextFoldersById[entityId] || null;
      const candidate = cloneFolder(prev, entityId);
      const details = event.details && typeof event.details === "object" ? event.details : {};
      if (typeof details.folderName === "string" && toTrimmed(details.folderName)) {
        candidate.name = toTrimmed(details.folderName);
      }
      candidate.updatedAt = new Date().toISOString();
      if (!prev || JSON.stringify(prev) !== JSON.stringify(candidate)) {
        nextFoldersById = { ...nextFoldersById, [entityId]: candidate };
        changed = true;
      }
    }
  }

  if (!changed) return { changed: false, patch: {} };
  return {
    changed: true,
    patch: {
      notesById: nextNotesById,
      foldersById: nextFoldersById,
      notes: nextNotes,
    },
  };
}

export function createWorkspaceSync({ store, apiClient } = {}) {
  let unsubscribeEvents = null;

  function setStatePatch(patch = null) {
    if (!store || !patch || typeof patch !== "object") return false;
    store.setState(patch);
    return true;
  }

  function ingestNotes(notes = []) {
    if (!store) return false;
    const state = store.getState();
    const { notesById } = ensureEntityState(state);
    const merged = upsertNotesById(notesById, notes);
    if (!merged.changed) return false;
    return setStatePatch({
      notesById: merged.next,
      notes: hydrateNotesFromMap(state.notes, merged.next),
    });
  }

  function ingestFolders(folders = []) {
    if (!store) return false;
    const state = store.getState();
    const { foldersById } = ensureEntityState(state);
    const merged = upsertFoldersById(foldersById, folders);
    if (!merged.changed) return false;
    return setStatePatch({ foldersById: merged.next });
  }

  function applyAction(action = null) {
    if (!store) return false;
    const normalized = normalizeAction(action);
    if (!normalized || !normalized.entityType || !normalized.entityId) return false;
    if (normalized.phase === "error") return false;

    const state = store.getState();
    const { notesById, foldersById, notes } = ensureEntityState(state);

    if (normalized.entityType === "note") {
      const isDelete = normalized.mutationType === "note.delete";
      if (isDelete && normalized.phase === "commit") {
        if (!notesById[normalized.entityId]) return false;
        const nextNotesById = { ...notesById };
        delete nextNotesById[normalized.entityId];
        return setStatePatch({
          notesById: nextNotesById,
          notes: notes.filter((note) => toTrimmed(note?.id) !== normalized.entityId),
        });
      }

      const previous = notesById[normalized.entityId] || null;
      const previousRevision = toFiniteNumber(previous?.revision) || 0;
      const patchRevision = toFiniteNumber(normalized.patch?.revision);
      const actionRevision = toFiniteNumber(normalized.nextRevision);
      const candidateRevision = actionRevision ?? patchRevision ?? null;
      if (
        previous &&
        candidateRevision !== null &&
        candidateRevision > 0 &&
        previousRevision > 0 &&
        candidateRevision < previousRevision
      ) {
        return false;
      }
      const merged = mergeNote(previous, normalized);
      if (!merged) return false;
      if (previous && JSON.stringify(previous) === JSON.stringify(merged)) {
        return false;
      }
      const nextNotesById = { ...notesById, [normalized.entityId]: merged };
      return setStatePatch({
        notesById: nextNotesById,
        notes: hydrateNotesFromMap(notes, nextNotesById),
      });
    }

    if (normalized.entityType === "folder") {
      const isDelete = normalized.mutationType === "folder.delete";
      if (isDelete && normalized.phase === "commit") {
        if (!foldersById[normalized.entityId]) return false;
        const nextFoldersById = { ...foldersById };
        delete nextFoldersById[normalized.entityId];
        return setStatePatch({ foldersById: nextFoldersById });
      }

      const previous = foldersById[normalized.entityId] || null;
      const merged = mergeFolder(previous, normalized);
      if (!merged) return false;
      if (previous && JSON.stringify(previous) === JSON.stringify(merged)) {
        return false;
      }
      const nextFoldersById = { ...foldersById, [normalized.entityId]: merged };
      return setStatePatch({ foldersById: nextFoldersById });
    }

    return false;
  }

  function applyActivityEvent(event = null) {
    if (!store) return false;
    const state = store.getState();
    const result = applyActivityEventToState(state, event);
    if (!result.changed) return false;
    return setStatePatch(result.patch);
  }

  function hydrateNotes(notes = []) {
    if (!store) return Array.isArray(notes) ? notes : [];
    const state = store.getState();
    const { notesById } = ensureEntityState(state);
    return hydrateNotesFromMap(notes, notesById);
  }

  function hydrateFolders(folders = []) {
    if (!store) return Array.isArray(folders) ? folders : [];
    const state = store.getState();
    const { foldersById } = ensureEntityState(state);
    return (Array.isArray(folders) ? folders : []).map((folder) => {
      const id = toTrimmed(folder?.id);
      if (!id || !foldersById[id]) return folder;
      return { ...folder, ...foldersById[id] };
    });
  }

  function getNoteById(id = "") {
    if (!store) return null;
    const normalizedId = toTrimmed(id);
    if (!normalizedId) return null;
    const state = store.getState();
    return ensureEntityState(state).notesById[normalizedId] || null;
  }

  function getFolderById(id = "") {
    if (!store) return null;
    const normalizedId = toTrimmed(id);
    if (!normalizedId) return null;
    const state = store.getState();
    return ensureEntityState(state).foldersById[normalizedId] || null;
  }

  if (apiClient && typeof apiClient.subscribeToEvents === "function") {
    unsubscribeEvents = apiClient.subscribeToEvents((event) => {
      const eventType = toTrimmed(event?.type).toLowerCase();
      if (
        eventType === "workspace_action_start" ||
        eventType === "workspace_action_progress" ||
        eventType === "workspace_action_commit" ||
        eventType === "workspace_action_error"
      ) {
        const phaseMap = {
          workspace_action_start: "start",
          workspace_action_progress: "progress",
          workspace_action_commit: "commit",
          workspace_action_error: "error",
        };
        applyAction({
          ...(event || {}),
          phase: phaseMap[eventType] || toTrimmed(event?.phase).toLowerCase(),
        });
        return;
      }
      applyActivityEvent(event);
    });
  }

  return {
    ingestNotes,
    ingestFolders,
    applyAction,
    applyActivityEvent,
    hydrateNotes,
    hydrateFolders,
    getNoteById,
    getFolderById,
    dispose() {
      if (typeof unsubscribeEvents === "function") {
        unsubscribeEvents();
        unsubscribeEvents = null;
      }
    },
  };
}

export function __workspaceSyncTestUtils() {
  return {
    normalizeAction,
    mergeNote,
    mergeFolder,
    applyActivityEventToState,
  };
}
