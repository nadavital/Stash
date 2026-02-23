export function createMemoryAccessOps({
  config,
  folderRepo,
  collaborationRepo,
  logger,
  publishActivity,
  authorizationError,
  folderRoleRank,
}) {
  function isWorkspaceManager(actorContext = null) {
    const role = String(actorContext?.role || "").toLowerCase();
    return role === "owner" || role === "admin";
  }

  function noteOwnerId(note = null) {
    if (!note) return "";
    const explicitOwner = String(note.ownerUserId || "").trim();
    if (explicitOwner) return explicitOwner;
    const creator = String(note.createdByUserId || "").trim();
    if (creator) return creator;
    const metadataActor = String(note.metadata?.actorUserId || "").trim();
    return metadataActor;
  }

  function normalizeFolderMemberRole(role = "viewer") {
    const normalized = String(role || "").trim().toLowerCase();
    return Object.hasOwn(folderRoleRank, normalized) ? normalized : "";
  }

  function roleAtLeast(role = "", minimumRole = "viewer") {
    return (
      Number(folderRoleRank[normalizeFolderMemberRole(role)] || 0) >=
      Number(folderRoleRank[minimumRole] || 0)
    );
  }

  async function buildFolderAccessContext(actorContext = null) {
    const fallback = { roleByProjectName: new Map(), roleByFolderId: new Map() };
    if (!actorContext || isWorkspaceManager(actorContext)) return fallback;
    const userId = String(actorContext.userId || "").trim();
    if (!userId) return fallback;

    const [memberships, folders] = await Promise.all([
      collaborationRepo.listFolderMembershipsForUser({
        workspaceId: actorContext.workspaceId,
        userId,
      }),
      folderRepo.listAllFolders(actorContext.workspaceId),
    ]);

    const roleByFolderId = new Map();
    for (const membership of memberships || []) {
      const folderId = String(membership?.folderId || "").trim();
      if (!folderId) continue;
      roleByFolderId.set(folderId, normalizeFolderMemberRole(membership.role || "viewer"));
    }

    const roleByProjectName = new Map();
    for (const folder of folders || []) {
      const folderId = String(folder?.id || "").trim();
      const role = roleByFolderId.get(folderId);
      if (!role) continue;
      const folderName = String(folder?.name || "").trim().toLowerCase();
      if (!folderName) continue;
      roleByProjectName.set(folderName, role);
    }

    return { roleByProjectName, roleByFolderId };
  }

  function folderRoleForNote(note = null, accessContext = null) {
    const projectName = String(note?.project || "").trim().toLowerCase();
    if (!projectName || !accessContext?.roleByProjectName) return "";
    return normalizeFolderMemberRole(accessContext.roleByProjectName.get(projectName) || "");
  }

  function canReadNote(note, actorContext = null, accessContext = null) {
    if (!note || !actorContext) return false;
    if (isWorkspaceManager(actorContext)) return true;
    const userId = String(actorContext.userId || "").trim();
    if (!userId) return false;
    if (noteOwnerId(note) === userId) return true;
    return roleAtLeast(folderRoleForNote(note, accessContext), "viewer");
  }

  async function assertCanReadNote(note, actorContext = null, accessContext = null) {
    const resolvedAccessContext = accessContext || (await buildFolderAccessContext(actorContext));
    if (!canReadNote(note, actorContext, resolvedAccessContext)) {
      throw authorizationError("Forbidden: you do not have permission to access this item");
    }
  }

  function canMutateNote(note, actorContext = null, accessContext = null) {
    if (!note || !actorContext) return false;
    if (isWorkspaceManager(actorContext)) return true;
    const userId = String(actorContext.userId || "").trim();
    if (!userId) return false;
    if (noteOwnerId(note) === userId) return true;
    return roleAtLeast(folderRoleForNote(note, accessContext), "editor");
  }

  async function assertCanMutateNote(note, actorContext = null, accessContext = null) {
    const resolvedAccessContext = accessContext || (await buildFolderAccessContext(actorContext));
    if (!canMutateNote(note, actorContext, resolvedAccessContext)) {
      throw authorizationError("Forbidden: you do not have permission to modify this item");
    }
  }

  function assertWorkspaceManager(actorContext = null) {
    if (!isWorkspaceManager(actorContext)) {
      throw authorizationError("Forbidden: this operation requires workspace owner/admin privileges");
    }
  }

  async function resolveFolderByIdOrName(
    rawFolderId = "",
    workspaceId = config.defaultWorkspaceId
  ) {
    const normalized = String(rawFolderId || "").trim();
    if (!normalized) throw new Error("Missing folder id");
    let folder = await folderRepo.getFolder(normalized, workspaceId);
    if (!folder) {
      folder = await folderRepo.getFolderByName(normalized, workspaceId);
    }
    if (!folder && typeof folderRepo.getFolderByNameInsensitive === "function") {
      folder = await folderRepo.getFolderByNameInsensitive(normalized, workspaceId);
    }
    return folder || null;
  }

  async function resolveCanonicalProjectName(
    project = "",
    workspaceId = config.defaultWorkspaceId
  ) {
    const normalizedProject = String(project || "").trim();
    if (!normalizedProject) return "";

    const byId = await folderRepo.getFolder(normalizedProject, workspaceId);
    if (byId?.name) return String(byId.name).trim() || normalizedProject;

    const byName = await folderRepo.getFolderByName(normalizedProject, workspaceId);
    if (byName?.name) return String(byName.name).trim() || normalizedProject;

    if (typeof folderRepo.getFolderByNameInsensitive === "function") {
      const byNameInsensitive = await folderRepo.getFolderByNameInsensitive(
        normalizedProject,
        workspaceId
      );
      if (byNameInsensitive?.name) return String(byNameInsensitive.name).trim() || normalizedProject;
    }

    return normalizedProject;
  }

  function actorDisplayName(actorContext = null) {
    const fallback = String(actorContext?.userId || "").trim();
    return String(actorContext?.userName || actorContext?.name || "").trim() || fallback || "Unknown user";
  }

  async function getActorFolderRole(folder, actorContext = null, accessContext = null) {
    if (!folder || !actorContext) return "";
    if (isWorkspaceManager(actorContext)) return "manager";
    const actorUserId = String(actorContext.userId || "").trim();
    if (!actorUserId) return "";
    const folderId = String(folder.id || "").trim();
    if (!folderId) return "";

    if (accessContext?.roleByFolderId?.has(folderId)) {
      return normalizeFolderMemberRole(accessContext.roleByFolderId.get(folderId) || "");
    }
    const role = await collaborationRepo.getFolderMemberRole({
      workspaceId: actorContext.workspaceId,
      folderId,
      userId: actorUserId,
    });
    return normalizeFolderMemberRole(role || "");
  }

  async function assertCanViewFolder(folder, actorContext = null, accessContext = null) {
    if (!folder) throw authorizationError("Folder not found");
    if (isWorkspaceManager(actorContext)) return;
    const role = await getActorFolderRole(folder, actorContext, accessContext);
    if (!roleAtLeast(role, "viewer")) {
      throw authorizationError("Forbidden: you do not have permission to access this folder");
    }
  }

  async function assertCanManageFolder(folder, actorContext = null, accessContext = null) {
    if (!folder) throw authorizationError("Folder not found");
    if (isWorkspaceManager(actorContext)) return;
    const role = await getActorFolderRole(folder, actorContext, accessContext);
    if (!roleAtLeast(role, "manager")) {
      throw authorizationError("Forbidden: you do not have permission to manage folder collaborators");
    }
  }

  function buildActivityMessage(event = {}) {
    const details = event.details || {};
    const title = String(details.title || "").trim();
    const role = String(details.role || "").trim();
    switch (String(event.eventType || "").trim()) {
      case "note.created":
        return title ? `created "${title}"` : "created an item";
      case "note.updated":
        return title ? `updated "${title}"` : "updated an item";
      case "note.deleted":
        return title ? `deleted "${title}"` : "deleted an item";
      case "note.comment_added":
        return title ? `commented on "${title}"` : "added a comment";
      case "note.version_restored":
        return title ? `restored "${title}"` : "restored a version";
      case "note.enrichment_retry":
        return title ? `retried AI on "${title}"` : "retried enrichment";
      case "folder.created":
        return `created folder "${String(details.folderName || "").trim() || "folder"}"`;
      case "folder.updated":
        return `updated folder "${String(details.folderName || "").trim() || "folder"}"`;
      case "folder.deleted":
        return `deleted folder "${String(details.folderName || "").trim() || "folder"}"`;
      case "folder.shared":
        return `shared folder with ${String(details.userName || details.userEmail || "member")} (${role || "viewer"})`;
      case "folder.unshared":
        return `removed folder access for ${String(details.userName || details.userEmail || "member")}`;
      default:
        return String(details.message || "").trim() || "updated workspace";
    }
  }

  async function emitWorkspaceActivity({
    actorContext,
    eventType,
    entityType = "workspace",
    entityId = "",
    folderId = null,
    noteId = null,
    visibilityUserId = null,
    details = {},
  } = {}) {
    if (!actorContext?.workspaceId || !eventType) return null;
    try {
      const event = await collaborationRepo.createActivityEvent({
        workspaceId: actorContext.workspaceId,
        actorUserId: actorContext.userId || null,
        actorName: actorDisplayName(actorContext),
        eventType,
        entityType,
        entityId,
        folderId,
        noteId,
        visibilityUserId,
        details,
      });
      if (event) {
        const message = buildActivityMessage(event);
        publishActivity({
          type: "activity",
          message,
          ...event,
        });
      }
      return event;
    } catch (error) {
      logger.warn("activity_event_write_failed", {
        eventType,
        workspaceId: actorContext.workspaceId,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async function resolveFolderForNoteProject(
    note = null,
    workspaceId = config.defaultWorkspaceId
  ) {
    const project = String(note?.project || "").trim();
    if (!project) return null;
    return folderRepo.getFolderByName(project, workspaceId);
  }

  function noteDisplayTitle(note = null, maxChars = 120) {
    if (!note || typeof note !== "object") return "";
    const explicit = String(note?.metadata?.title || "").trim();
    if (explicit) return explicit.slice(0, maxChars);
    return String(note.summary || note.fileName || note.content || "").slice(0, maxChars);
  }

  async function emitNoteActivity({
    actorContext,
    note,
    eventType,
    details = {},
  } = {}) {
    if (!note || !eventType) return null;
    const folder = await resolveFolderForNoteProject(note, actorContext.workspaceId);
    const ownerUserId = noteOwnerId(note) || null;
    const keepNoteForeignKey = String(eventType || "").trim() !== "note.deleted";
    return emitWorkspaceActivity({
      actorContext,
      eventType,
      entityType: "note",
      entityId: note.id,
      folderId: folder?.id || null,
      noteId: keepNoteForeignKey ? note.id : null,
      visibilityUserId: folder ? null : ownerUserId,
      details: {
        title: noteDisplayTitle(note, 120),
        project: String(note.project || ""),
        ...details,
      },
    });
  }

  return {
    isWorkspaceManager,
    noteOwnerId,
    normalizeFolderMemberRole,
    roleAtLeast,
    buildFolderAccessContext,
    canReadNote,
    assertCanReadNote,
    canMutateNote,
    assertCanMutateNote,
    assertWorkspaceManager,
    resolveFolderByIdOrName,
    resolveCanonicalProjectName,
    assertCanViewFolder,
    assertCanManageFolder,
    emitWorkspaceActivity,
    noteDisplayTitle,
    emitNoteActivity,
    buildActivityMessage,
  };
}
