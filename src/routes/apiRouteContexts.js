export function buildPublicAuthRouteContext(deps, { requestIp, requestOrigin }) {
  return {
    requestIp,
    requestOrigin,
    sendJson: deps.sendJson,
    readJsonBody: deps.readJsonBody,
    resolveErrorStatus: deps.resolveErrorStatus,
    config: deps.config,
    logger: deps.logger,
    checkAuthRate: deps.checkAuthRate,
    getAuthFailureStatus: deps.getAuthFailureStatus,
    registerAuthFailure: deps.registerAuthFailure,
    clearAuthFailures: deps.clearAuthFailures,
    recordAuthEvent: deps.recordAuthEvent,
    neonSignInWithEmailPassword: deps.neonSignInWithEmailPassword,
    resolveNeonActorFromToken: deps.resolveNeonActorFromToken,
    buildNeonSessionPayload: deps.buildNeonSessionPayload,
    firebaseSignInWithEmailPassword: deps.firebaseSignInWithEmailPassword,
    verifyFirebaseIdToken: deps.verifyFirebaseIdToken,
    authRepo: deps.authRepo,
    buildFirebaseSessionPayload: deps.buildFirebaseSessionPayload,
    firebaseSendEmailVerification: deps.firebaseSendEmailVerification,
    neonSignUpWithEmailPassword: deps.neonSignUpWithEmailPassword,
    firebaseSignUpWithEmailPassword: deps.firebaseSignUpWithEmailPassword,
    neonSendPasswordResetEmail: deps.neonSendPasswordResetEmail,
    firebaseSendPasswordResetEmail: deps.firebaseSendPasswordResetEmail,
    firebaseRefreshIdToken: deps.firebaseRefreshIdToken,
  };
}

export function buildAuthWorkspaceRouteContext(deps, { actor, requestIp, requiresEmailVerification }) {
  return {
    actor,
    requestIp,
    requiresEmailVerification,
    sendJson: deps.sendJson,
    readJsonBody: deps.readJsonBody,
    resolveErrorStatus: deps.resolveErrorStatus,
    config: deps.config,
    isWorkspaceManager: deps.isWorkspaceManager,
    authRepo: deps.authRepo,
    getEnrichmentQueueStats: deps.getEnrichmentQueueStats,
    firebaseSendEmailVerification: deps.firebaseSendEmailVerification,
    firebaseChangePassword: deps.firebaseChangePassword,
    verifyFirebaseIdToken: deps.verifyFirebaseIdToken,
    buildFirebaseSessionPayload: deps.buildFirebaseSessionPayload,
    revokeFirebaseUserSessions: deps.revokeFirebaseUserSessions,
    deleteFirebaseUser: deps.deleteFirebaseUser,
    registerAuthFailure: deps.registerAuthFailure,
    recordAuthEvent: deps.recordAuthEvent,
  };
}

export function buildNoteRouteContext(deps, { actor }) {
  return {
    actor,
    sendJson: deps.sendJson,
    resolveErrorStatus: deps.resolveErrorStatus,
    readJsonBody: deps.readJsonBody,
    validateNotePayload: deps.validateNotePayload,
    parseWorkingSetIds: deps.parseWorkingSetIds,
    listWorkspaceActivity: deps.listWorkspaceActivity,
    findRelatedMemories: deps.findRelatedMemories,
    retryMemoryEnrichment: deps.retryMemoryEnrichment,
    getMemoryById: deps.getMemoryById,
    deleteMemory: deps.deleteMemory,
    deleteProjectMemories: deps.deleteProjectMemories,
    searchMemories: deps.searchMemories,
    listRecentMemories: deps.listRecentMemories,
    createMemory: deps.createMemory,
  };
}

export function buildMetaRouteContext(deps, { actor }) {
  return {
    actor,
    sendJson: deps.sendJson,
    isWorkspaceManager: deps.isWorkspaceManager,
    readJsonBody: deps.readJsonBody,
    listProjects: deps.listProjects,
    listTags: deps.listTags,
    noteRepo: deps.noteRepo,
    getMemoryStats: deps.getMemoryStats,
    getEnrichmentQueueStats: deps.getEnrichmentQueueStats,
    enrichmentQueue: deps.enrichmentQueue,
    exportMemories: deps.exportMemories,
  };
}

export function buildChatRouteContext(deps, { actor }) {
  return {
    actor,
    sendJson: deps.sendJson,
    readJsonBody: deps.readJsonBody,
    parseWorkingSetIds: deps.parseWorkingSetIds,
    normalizeRecentChatMessages: deps.normalizeRecentChatMessages,
    isLikelyExternalInfoRequest: deps.isLikelyExternalInfoRequest,
    extractDomainsFromText: deps.extractDomainsFromText,
    extractDomainFromUrl: deps.extractDomainFromUrl,
    searchMemories: deps.searchMemories,
    noteRepo: deps.noteRepo,
    buildChatWebSearchTool: deps.buildChatWebSearchTool,
    CHAT_TOOLS: deps.CHAT_TOOLS,
    createCitationNoteAliasMap: deps.createCitationNoteAliasMap,
    createCitationNoteNameAliasMap: deps.createCitationNoteNameAliasMap,
    createStreamingResponse: deps.createStreamingResponse,
    extractOutputUrlCitations: deps.extractOutputUrlCitations,
    buildCitationBlock: deps.buildCitationBlock,
    CHAT_SYSTEM_PROMPT: deps.CHAT_SYSTEM_PROMPT,
    createAgentToolHarness: deps.createAgentToolHarness,
    resolveAgentToolArgs: deps.resolveAgentToolArgs,
    executeChatToolCall: deps.executeChatToolCall,
    logger: deps.logger,
    buildAgentNoteTitle: deps.buildAgentNoteTitle,
    createMemory: deps.createMemory,
    askMemories: deps.askMemories,
    buildProjectContext: deps.buildProjectContext,
  };
}

export function buildFolderRouteContext(deps, { actor }) {
  return {
    actor,
    sendJson: deps.sendJson,
    resolveErrorStatus: deps.resolveErrorStatus,
    readJsonBody: deps.readJsonBody,
    folderRepo: deps.folderRepo,
    createWorkspaceFolder: deps.createWorkspaceFolder,
    listFolderCollaborators: deps.listFolderCollaborators,
    setFolderCollaboratorRole: deps.setFolderCollaboratorRole,
    removeFolderCollaborator: deps.removeFolderCollaborator,
    updateWorkspaceFolder: deps.updateWorkspaceFolder,
    deleteWorkspaceFolder: deps.deleteWorkspaceFolder,
  };
}

export function buildTaskRouteContext(deps, { actor }) {
  return {
    actor,
    sendJson: deps.sendJson,
    readJsonBody: deps.readJsonBody,
    taskRepo: deps.taskRepo,
  };
}

export function buildNoteMutationRouteContext(deps, { actor }) {
  return {
    actor,
    sendJson: deps.sendJson,
    resolveErrorStatus: deps.resolveErrorStatus,
    readJsonBody: deps.readJsonBody,
    validateNotePayload: deps.validateNotePayload,
    addMemoryComment: deps.addMemoryComment,
    listMemoryVersions: deps.listMemoryVersions,
    restoreMemoryVersion: deps.restoreMemoryVersion,
    updateMemoryExtractedContent: deps.updateMemoryExtractedContent,
    updateMemory: deps.updateMemory,
  };
}

export function buildBatchRouteContext(deps, { actor }) {
  return {
    actor,
    sendJson: deps.sendJson,
    resolveErrorStatus: deps.resolveErrorStatus,
    readJsonBody: deps.readJsonBody,
    validateBatchPayload: deps.validateBatchPayload,
    batchDeleteMemories: deps.batchDeleteMemories,
    batchMoveMemories: deps.batchMoveMemories,
  };
}
