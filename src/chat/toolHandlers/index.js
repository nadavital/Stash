import { createWorkspaceHelpers } from "../toolShared.js";
import { createCaptureToolHandlers } from "./captureToolHandlers.js";
import { createCollaborationToolHandlers } from "./collaborationToolHandlers.js";
import { createQueryToolHandlers } from "./queryToolHandlers.js";
import { createNoteToolHandlers } from "./noteToolHandlers.js";
import { createTaskToolHandlers } from "./taskToolHandlers.js";

export function createToolHandlers(deps) {
  const {
    authRepo,
    folderRepo,
    taskRepo,
    createMemory,
    batchCreateMemories,
    createWorkspaceFolder,
    listFolderCollaborators,
    setFolderCollaboratorRole,
    removeFolderCollaborator,
    listWorkspaceActivity,
    searchMemories,
    fetchExternalContent,
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
    ...createCaptureToolHandlers({ createMemory, batchCreateMemories }),
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
    ...createQueryToolHandlers({ searchMemories, fetchExternalContent }),
    ...createTaskToolHandlers({ taskRepo }),
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
