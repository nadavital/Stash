const FOLDER_MEMBER_ROLES = new Set(["viewer", "editor", "manager"]);

export function normalizeFolderMemberRole(role = "viewer") {
  const normalized = String(role || "").trim().toLowerCase();
  return FOLDER_MEMBER_ROLES.has(normalized) ? normalized : "viewer";
}

export function createWorkspaceHelpers({ authRepo, folderRepo }) {
  async function resolveWorkspaceMemberForAgent(actor, { userId = "", email = "" } = {}) {
    const normalizedUserId = String(userId || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedUserId && !normalizedEmail) {
      throw new Error("Missing collaborator identifier");
    }
    const members = await authRepo.listWorkspaceMembers(actor.workspaceId, { limit: 1000 });
    const resolved = members.find((member) => {
      const memberUserId = String(member.userId || "").trim();
      const memberEmail = String(member.email || "").trim().toLowerCase();
      if (normalizedUserId && memberUserId === normalizedUserId) return true;
      if (normalizedEmail && memberEmail === normalizedEmail) return true;
      return false;
    });
    if (!resolved) {
      throw new Error("Workspace member not found");
    }
    return resolved;
  }

  async function resolveFolderNameForAgent(folderRef, workspaceId) {
    const normalized = String(folderRef || "").trim();
    if (!normalized) return "";
    let folder = await folderRepo.getFolder(normalized, workspaceId);
    if (!folder) {
      folder = await folderRepo.getFolderByName(normalized, workspaceId);
    }
    return String(folder?.name || normalized);
  }

  return {
    resolveWorkspaceMemberForAgent,
    resolveFolderNameForAgent,
  };
}
