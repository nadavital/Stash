export async function handleFolderRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    resolveErrorStatus,
    readJsonBody,
    folderRepo,
    createWorkspaceFolder,
    listFolderCollaborators,
    setFolderCollaboratorRole,
    removeFolderCollaborator,
    updateWorkspaceFolder,
    deleteWorkspaceFolder,
  } = context;

  if (req.method === "GET" && url.pathname === "/api/folders") {
    const parentId = url.searchParams.get("parentId") || null;
    const folders = await folderRepo.listFolders(parentId, actor.workspaceId);
    sendJson(res, 200, { items: folders, count: folders.length });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/folders") {
    const body = await readJsonBody(req);
    try {
      const folder = await createWorkspaceFolder({
        name: body.name,
        description: body.description,
        color: body.color,
        symbol: body.symbol,
        parentId: body.parentId,
        actor,
      });
      sendJson(res, 201, { folder });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : "Create failed" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/folders\/[^/]+\/collaborators$/)) {
    const suffix = "/collaborators";
    const encodedId = url.pathname.slice("/api/folders/".length, -suffix.length);
    const folderId = decodeURIComponent(encodedId || "").trim();
    if (!folderId) {
      sendJson(res, 400, { error: "Missing folder id" });
      return true;
    }
    try {
      const result = await listFolderCollaborators({
        folderId,
        actor,
      });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to list collaborators" });
    }
    return true;
  }

  if (req.method === "PUT" && url.pathname.match(/^\/api\/folders\/[^/]+\/collaborators\/[^/]+$/)) {
    const prefix = "/api/folders/";
    const marker = "/collaborators/";
    const markerIndex = url.pathname.indexOf(marker);
    const encodedFolderId = url.pathname.slice(prefix.length, markerIndex);
    const encodedUserId = url.pathname.slice(markerIndex + marker.length);
    const folderId = decodeURIComponent(encodedFolderId || "").trim();
    const userId = decodeURIComponent(encodedUserId || "").trim();
    if (!folderId || !userId) {
      sendJson(res, 400, { error: "Missing folder id or user id" });
      return true;
    }
    const body = await readJsonBody(req);
    try {
      const collaborator = await setFolderCollaboratorRole({
        folderId,
        userId,
        role: body.role || "viewer",
        actor,
      });
      sendJson(res, 200, { collaborator });
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to update collaborator role" });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/folders\/[^/]+\/collaborators\/[^/]+$/)) {
    const prefix = "/api/folders/";
    const marker = "/collaborators/";
    const markerIndex = url.pathname.indexOf(marker);
    const encodedFolderId = url.pathname.slice(prefix.length, markerIndex);
    const encodedUserId = url.pathname.slice(markerIndex + marker.length);
    const folderId = decodeURIComponent(encodedFolderId || "").trim();
    const userId = decodeURIComponent(encodedUserId || "").trim();
    if (!folderId || !userId) {
      sendJson(res, 400, { error: "Missing folder id or user id" });
      return true;
    }
    try {
      const result = await removeFolderCollaborator({
        folderId,
        userId,
        actor,
      });
      sendJson(res, 200, result);
    } catch (error) {
      const statusCode = resolveErrorStatus(error, 400);
      sendJson(res, statusCode, { error: error instanceof Error ? error.message : "Failed to remove collaborator" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.match(/^\/api\/folders\/[^/]+\/children$/)) {
    const encodedId = url.pathname.slice("/api/folders/".length, url.pathname.lastIndexOf("/children"));
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing folder id" });
      return true;
    }
    const children = await folderRepo.listFolders(id, actor.workspaceId);
    sendJson(res, 200, { items: children, count: children.length });
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/folders/")) {
    const encodedId = url.pathname.slice("/api/folders/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing folder id" });
      return true;
    }
    let folder = await folderRepo.getFolder(id, actor.workspaceId);
    if (!folder) {
      folder = await folderRepo.getFolderByName(id, actor.workspaceId);
    }
    if (!folder) {
      sendJson(res, 404, { error: "Folder not found" });
      return true;
    }
    sendJson(res, 200, { folder });
    return true;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/folders/")) {
    const encodedId = url.pathname.slice("/api/folders/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing folder id" });
      return true;
    }
    const body = await readJsonBody(req);
    try {
      const folder = await updateWorkspaceFolder({
        id,
        patch: {
          name: body.name,
          description: body.description,
          color: body.color,
          symbol: body.symbol,
          parentId: body.parentId,
        },
        actor,
      });
      sendJson(res, 200, { folder });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      sendJson(res, msg.includes("not found") ? 404 : 400, { error: msg });
    }
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/folders/")) {
    const encodedId = url.pathname.slice("/api/folders/".length);
    const id = decodeURIComponent(encodedId || "").trim();
    if (!id) {
      sendJson(res, 400, { error: "Missing folder id" });
      return true;
    }
    try {
      const result = await deleteWorkspaceFolder({ id, actor });
      sendJson(res, 200, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      sendJson(res, msg.includes("not found") ? 404 : 400, { error: msg });
    }
    return true;
  }

  return false;
}
