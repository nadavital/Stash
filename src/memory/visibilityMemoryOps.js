export function createVisibilityMemoryOps({
  normalizeMemoryScope,
  normalizeWorkingSetIds,
  clampInt,
  noteRepo,
  buildFolderAccessContext,
  canReadNote,
  isWorkspaceManager,
}) {
  function sortNotesByRecency(notes = []) {
    return [...(Array.isArray(notes) ? notes : [])].sort((a, b) => {
      const aTime = Date.parse(a?.updatedAt || a?.createdAt || "") || 0;
      const bTime = Date.parse(b?.updatedAt || b?.createdAt || "") || 0;
      return bTime - aTime;
    });
  }

  async function loadWorkingSetNotesForActor(actorContext, workingSetIds = [], contextNoteId = "") {
    const ids = normalizeWorkingSetIds(
      [...normalizeWorkingSetIds(workingSetIds, 100), String(contextNoteId || "").trim()],
      100
    );
    if (ids.length === 0) return [];

    const notes = await Promise.all(ids.map((id) => noteRepo.getNoteById(id, actorContext.workspaceId)));
    const accessContext = await buildFolderAccessContext(actorContext);
    return notes.filter((note) => note && canReadNote(note, actorContext, accessContext));
  }

  async function listVisibleNotesForActor({
    actorContext,
    project = "",
    limit = 200,
    offset = 0,
    scope = "all",
    workingSetIds = [],
    contextNoteId = "",
  } = {}) {
    const normalizedScope = normalizeMemoryScope(scope);
    const normalizedProject = String(project || "").trim();
    const boundedLimit = clampInt(limit, 1, 10000, 200);
    const boundedOffset = clampInt(offset, 0, 100000, 0);
    if (normalizedScope === "item") {
      const notes = sortNotesByRecency(
        await loadWorkingSetNotesForActor(actorContext, workingSetIds, contextNoteId)
      );
      return notes.slice(boundedOffset, boundedOffset + boundedLimit);
    }

    if (normalizedScope === "project" && !normalizedProject) {
      return [];
    }

    if (normalizedScope === "user") {
      return noteRepo.listByProjectForUser(
        normalizedProject || null,
        boundedLimit,
        boundedOffset,
        actorContext.workspaceId,
        actorContext.userId
      );
    }

    if (
      isWorkspaceManager(actorContext) &&
      (normalizedScope === "all" ||
        normalizedScope === "workspace" ||
        normalizedScope === "project")
    ) {
      return noteRepo.listByProject(
        normalizedProject || null,
        boundedLimit,
        boundedOffset,
        actorContext.workspaceId
      );
    }
    const fetchLimit = Math.min(Math.max((boundedOffset + boundedLimit) * 4, boundedLimit), 5000);
    const allWorkspaceNotes = await noteRepo.listByProject(
      normalizedProject || null,
      fetchLimit,
      0,
      actorContext.workspaceId
    );
    const accessContext = await buildFolderAccessContext(actorContext);
    const visibleNotes = allWorkspaceNotes.filter((note) => canReadNote(note, actorContext, accessContext));
    return visibleNotes.slice(boundedOffset, boundedOffset + boundedLimit);
  }

  async function listSearchCandidatesForActor({
    actorContext,
    project = "",
    maxCandidates = 500,
    scope = "all",
    workingSetIds = [],
    contextNoteId = "",
  } = {}) {
    const normalizedScope = normalizeMemoryScope(scope);
    const normalizedProject = String(project || "").trim();

    if (normalizedScope === "item") {
      return sortNotesByRecency(
        await loadWorkingSetNotesForActor(actorContext, workingSetIds, contextNoteId)
      ).slice(0, maxCandidates);
    }

    if (normalizedScope === "project" && !normalizedProject) {
      return [];
    }

    if (normalizedScope === "user") {
      return noteRepo.listByProjectForUser(
        normalizedProject || null,
        maxCandidates,
        0,
        actorContext.workspaceId,
        actorContext.userId
      );
    }

    if (
      isWorkspaceManager(actorContext) &&
      (normalizedScope === "all" ||
        normalizedScope === "workspace" ||
        normalizedScope === "project")
    ) {
      return noteRepo.listByProject(
        normalizedProject || null,
        maxCandidates,
        0,
        actorContext.workspaceId
      );
    }
    const candidateFetchLimit = Math.min(Math.max(maxCandidates * 4, maxCandidates), 5000);
    const allWorkspaceNotes = await noteRepo.listByProject(
      normalizedProject || null,
      candidateFetchLimit,
      0,
      actorContext.workspaceId
    );
    const accessContext = await buildFolderAccessContext(actorContext);
    return allWorkspaceNotes
      .filter((note) => canReadNote(note, actorContext, accessContext))
      .slice(0, maxCandidates);
  }

  return {
    loadWorkingSetNotesForActor,
    listVisibleNotesForActor,
    listSearchCandidatesForActor,
  };
}
