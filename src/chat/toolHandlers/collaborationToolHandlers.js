import { normalizeFolderMemberRole } from "../toolShared.js";

export function createCollaborationToolHandlers({
  authRepo,
  createWorkspaceFolder,
  listFolderCollaborators,
  setFolderCollaboratorRole,
  removeFolderCollaborator,
  listWorkspaceActivity,
  resolveWorkspaceMemberForAgent,
  resolveFolderNameForAgent,
}) {
  return {
    async create_folder(args, actor) {
      const folder = await createWorkspaceFolder({
        name: args.name,
        description: args.description || "",
        color: args.color || "",
        actor,
      });
      return { folderId: folder.id, name: folder.name, folderName: folder.name };
    },

    async list_workspace_members(args, actor) {
      const query = String(args.query || "").trim().toLowerCase();
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
      const members = await authRepo.listWorkspaceMembers(actor.workspaceId, { limit: Math.max(limit * 2, 100) });
      const filtered = query
        ? members.filter((member) => {
            const haystack = `${member.userId || ""} ${member.email || ""} ${member.name || ""}`.toLowerCase();
            return haystack.includes(query);
          })
        : members;
      return {
        members: filtered.slice(0, limit).map((member) => ({
          userId: String(member.userId || ""),
          email: String(member.email || ""),
          name: String(member.name || ""),
          role: String(member.role || "member"),
        })),
      };
    },

    async list_folder_collaborators(args, actor) {
      const result = await listFolderCollaborators({
        folderId: String(args.folderId || "").trim(),
        actor,
      });
      return {
        folder: {
          id: result.folder?.id || "",
          name: result.folder?.name || "",
        },
        collaborators: (result.items || []).map((item) => ({
          userId: String(item.userId || ""),
          userEmail: String(item.userEmail || ""),
          userName: String(item.userName || ""),
          role: String(item.role || "viewer"),
        })),
      };
    },

    async set_folder_collaborator(args, actor) {
      const target = await resolveWorkspaceMemberForAgent(actor, {
        userId: args.userId,
        email: args.email,
      });
      const collaborator = await setFolderCollaboratorRole({
        folderId: String(args.folderId || "").trim(),
        userId: target.userId,
        role: normalizeFolderMemberRole(args.role),
        actor,
      });
      const folderName = await resolveFolderNameForAgent(collaborator.folderId || args.folderId, actor.workspaceId);
      return {
        folderId: String(collaborator.folderId || ""),
        folderName,
        userId: String(collaborator.userId || ""),
        userEmail: String(collaborator.userEmail || ""),
        userName: String(collaborator.userName || ""),
        role: String(collaborator.role || "viewer"),
      };
    },

    async remove_folder_collaborator(args, actor) {
      const target = await resolveWorkspaceMemberForAgent(actor, {
        userId: args.userId,
        email: args.email,
      });
      const result = await removeFolderCollaborator({
        folderId: String(args.folderId || "").trim(),
        userId: target.userId,
        actor,
      });
      const folderName = await resolveFolderNameForAgent(args.folderId, actor.workspaceId);
      return {
        folderId: String(args.folderId || "").trim(),
        folderName,
        userId: String(target.userId || ""),
        removed: Number(result.removed || 0),
      };
    },

    async list_activity(args, actor) {
      const result = await listWorkspaceActivity({
        actor,
        folderId: String(args.folderId || "").trim(),
        noteId: String(args.noteId || "").trim(),
        limit: Math.min(Math.max(Number(args.limit) || 30, 1), 200),
      });
      return {
        items: (result.items || []).map((item) => ({
          id: item.id,
          eventType: item.eventType,
          folderId: item.folderId || "",
          folderName: item.folderName || "",
          noteId: item.noteId || "",
          actorName: item.actorName || "",
          message: item.message || "",
          createdAt: item.createdAt,
        })),
      };
    },
  };
}
