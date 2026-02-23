import { createWorkspaceHelpers } from "../toolShared.js";
import { createCaptureToolHandlers } from "./captureToolHandlers.js";
import { createCollaborationToolHandlers } from "./collaborationToolHandlers.js";
import { createQueryToolHandlers } from "./queryToolHandlers.js";
import { createNoteToolHandlers } from "./noteToolHandlers.js";

export function createToolHandlers(deps) {
  const {
    authRepo,
    folderRepo,
    createMemory,
    createWorkspaceFolder,
    listFolderCollaborators,
    setFolderCollaboratorRole,
    removeFolderCollaborator,
    listWorkspaceActivity,
    searchMemories,
    getMemoryRawContent,
    updateMemory,
    updateMemoryAttachment,
    updateMemoryExtractedContent,
    addMemoryComment,
    listMemoryVersions,
    restoreMemoryVersion,
    retryMemoryEnrichment,
  } = deps;

  const { resolveWorkspaceMemberForAgent, resolveFolderNameForAgent } = createWorkspaceHelpers({
    authRepo,
    folderRepo,
  });

  return {
    ...createCaptureToolHandlers({ createMemory }),
    ...createCollaborationToolHandlers({
      authRepo,
      createWorkspaceFolder,
      listFolderCollaborators,
      setFolderCollaboratorRole,
      removeFolderCollaborator,
      listWorkspaceActivity,
      resolveWorkspaceMemberForAgent,
      resolveFolderNameForAgent,
    }),
    ...createQueryToolHandlers({ searchMemories }),
    ...createNoteToolHandlers({
      getMemoryRawContent,
      updateMemory,
      updateMemoryAttachment,
      updateMemoryExtractedContent,
      addMemoryComment,
      listMemoryVersions,
      restoreMemoryVersion,
      retryMemoryEnrichment,
    }),
  };
}
