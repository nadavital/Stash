function toBoundedLimit(value, min = 1, max = 200, fallback = 60) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function createCollaborationMemoryOps({
  resolveActor,
  folderRepo,
  collaborationRepo,
  authRepo,
  emitWorkspaceActivity,
  resolveFolderByIdOrName,
  buildFolderAccessContext,
  assertCanViewFolder,
  assertCanManageFolder,
  normalizeFolderMemberRole,
  isWorkspaceManager,
  buildActivityMessage,
}) {
  async function createWorkspaceFolder({
    name,
    description = "",
    color = "green",
    symbol = "DOC",
    parentId = null,
    actor = null,
  } = {}) {
    const actorContext = resolveActor(actor);
    const folder = await folderRepo.createFolder({
      name,
      description,
      color,
      symbol,
      parentId,
      workspaceId: actorContext.workspaceId,
    });
    if (actorContext.userId) {
      await collaborationRepo.upsertFolderMember({
        workspaceId: actorContext.workspaceId,
        folderId: folder.id,
        userId: actorContext.userId,
        role: "manager",
        createdByUserId: actorContext.userId,
      });
    }
    await emitWorkspaceActivity({
      actorContext,
      eventType: "folder.created",
      entityType: "folder",
      entityId: folder.id,
      folderId: folder.id,
      details: {
        folderName: folder.name,
      },
    });
    return folder;
  }

  async function updateWorkspaceFolder({
    id,
    patch = {},
    actor = null,
  } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing folder id");
    const existing = await resolveFolderByIdOrName(normalizedId, actorContext.workspaceId);
    if (!existing) throw new Error("Folder not found");
    const updated = await folderRepo.updateFolder(existing.id, patch, actorContext.workspaceId);
    await emitWorkspaceActivity({
      actorContext,
      eventType: "folder.updated",
      entityType: "folder",
      entityId: updated.id,
      folderId: updated.id,
      details: {
        folderName: updated.name,
      },
    });
    return updated;
  }

  async function deleteWorkspaceFolder({
    id,
    actor = null,
  } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing folder id");
    const existing = await resolveFolderByIdOrName(normalizedId, actorContext.workspaceId);
    if (!existing) throw new Error("Folder not found");
    const result = await folderRepo.deleteFolder(existing.id, actorContext.workspaceId);
    await emitWorkspaceActivity({
      actorContext,
      eventType: "folder.deleted",
      entityType: "folder",
      entityId: existing.id,
      details: {
        folderName: existing.name,
      },
    });
    return result;
  }

  async function listFolderCollaborators({
    folderId,
    actor = null,
  } = {}) {
    const actorContext = resolveActor(actor);
    const folder = await resolveFolderByIdOrName(folderId, actorContext.workspaceId);
    if (!folder) throw new Error("Folder not found");
    const accessContext = await buildFolderAccessContext(actorContext);
    await assertCanViewFolder(folder, actorContext, accessContext);
    const items = await collaborationRepo.listFolderMembers({
      workspaceId: actorContext.workspaceId,
      folderId: folder.id,
    });
    return { folder, items, count: items.length };
  }

  async function setFolderCollaboratorRole({
    folderId,
    userId,
    role = "viewer",
    actor = null,
  } = {}) {
    const actorContext = resolveActor(actor);
    const folder = await resolveFolderByIdOrName(folderId, actorContext.workspaceId);
    if (!folder) throw new Error("Folder not found");
    await assertCanManageFolder(folder, actorContext);
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) throw new Error("Missing user id");

    const workspaceMembers = await authRepo.listWorkspaceMembers(actorContext.workspaceId, { limit: 1000 });
    const targetMember = workspaceMembers.find((entry) => String(entry.userId || "").trim() === normalizedUserId);
    if (!targetMember) {
      throw new Error("User is not a member of this workspace");
    }

    const normalizedRole = normalizeFolderMemberRole(role);
    const roleToSet = normalizedRole || "viewer";
    const collaborator = await collaborationRepo.upsertFolderMember({
      workspaceId: actorContext.workspaceId,
      folderId: folder.id,
      userId: normalizedUserId,
      role: roleToSet,
      createdByUserId: actorContext.userId,
    });

    await emitWorkspaceActivity({
      actorContext,
      eventType: "folder.shared",
      entityType: "folder",
      entityId: folder.id,
      folderId: folder.id,
      details: {
        folderName: folder.name,
        role: roleToSet,
        userId: targetMember.userId,
        userEmail: targetMember.email,
        userName: targetMember.name,
      },
    });

    return collaborator;
  }

  async function removeFolderCollaborator({
    folderId,
    userId,
    actor = null,
  } = {}) {
    const actorContext = resolveActor(actor);
    const folder = await resolveFolderByIdOrName(folderId, actorContext.workspaceId);
    if (!folder) throw new Error("Folder not found");
    await assertCanManageFolder(folder, actorContext);
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) throw new Error("Missing user id");

    const beforeMembers = await collaborationRepo.listFolderMembers({
      workspaceId: actorContext.workspaceId,
      folderId: folder.id,
    });
    const target = beforeMembers.find((entry) => String(entry.userId || "").trim() === normalizedUserId);
    if (!target) {
      return { removed: 0 };
    }
    if (target.role === "manager") {
      const managerCount = beforeMembers.filter((entry) => entry.role === "manager").length;
      if (managerCount <= 1) {
        throw new Error("Folder must retain at least one manager");
      }
    }

    const removed = await collaborationRepo.removeFolderMember({
      workspaceId: actorContext.workspaceId,
      folderId: folder.id,
      userId: normalizedUserId,
    });
    if (removed > 0) {
      await emitWorkspaceActivity({
        actorContext,
        eventType: "folder.unshared",
        entityType: "folder",
        entityId: folder.id,
        folderId: folder.id,
        details: {
          folderName: folder.name,
          role: target.role,
          userId: target.userId,
          userEmail: target.userEmail,
          userName: target.userName,
        },
      });
    }
    return { removed };
  }

  async function listWorkspaceActivity({
    actor = null,
    folderId = "",
    noteId = "",
    limit = 60,
  } = {}) {
    const actorContext = resolveActor(actor);
    const boundedLimit = toBoundedLimit(limit, 1, 200, 60);
    let resolvedFolderId = "";
    if (String(folderId || "").trim()) {
      const folder = await resolveFolderByIdOrName(folderId, actorContext.workspaceId);
      if (!folder) throw new Error("Folder not found");
      await assertCanViewFolder(folder, actorContext);
      resolvedFolderId = folder.id;
    }
    const events = await collaborationRepo.listActivityEvents({
      workspaceId: actorContext.workspaceId,
      folderId: resolvedFolderId,
      noteId: String(noteId || "").trim(),
      limit: Math.min(500, boundedLimit * 4),
    });

    let visibleEvents = events;
    if (!isWorkspaceManager(actorContext)) {
      const accessContext = await buildFolderAccessContext(actorContext);
      const actorUserId = String(actorContext.userId || "").trim();
      visibleEvents = events.filter((event) => {
        const visibilityUserId = String(event.visibilityUserId || "").trim();
        if (visibilityUserId) {
          return visibilityUserId === actorUserId;
        }
        const eventFolderId = String(event.folderId || "").trim();
        if (eventFolderId) {
          return accessContext.roleByFolderId.has(eventFolderId);
        }
        return true;
      });
    }

    const items = visibleEvents.slice(0, boundedLimit).map((event) => ({
      ...event,
      actorName: String(event.actorName || "").trim() || "Unknown user",
      message: buildActivityMessage(event),
    }));
    return {
      items,
      count: items.length,
    };
  }

  return {
    createWorkspaceFolder,
    updateWorkspaceFolder,
    deleteWorkspaceFolder,
    listFolderCollaborators,
    setFolderCollaboratorRole,
    removeFolderCollaborator,
    listWorkspaceActivity,
  };
}
