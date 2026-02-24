import { createRateLimiter } from "../rateLimit.js";
import { createBuildChatWebSearchTool } from "../chat/chatWebSearch.js";
import { createChatToolExecutor } from "../chat/chatToolExecutor.js";
import { createAutomationRuntime } from "../tasks/automationRuntime.js";
import { createAuthFailureTracker } from "../auth/authSecurity.js";
import { createAuthEventRecorder } from "../auth/authEvents.js";
import { buildFirebaseSessionPayload, buildNeonSessionPayload } from "../auth/sessionPayloads.js";
import { createActorResolver } from "../auth/actorResolver.js";
import { createSseHandler } from "../events/sseStream.js";

function isWorkspaceManager(actor = null) {
  const role = String(actor?.role || "").toLowerCase();
  return role === "owner" || role === "admin";
}

export function createRuntimeServices(staticDeps, { logger }) {
  const checkAuthRate = createRateLimiter({ windowMs: 10 * 60 * 1000, maxRequests: 50 });
  const { getAuthFailureStatus, registerAuthFailure, clearAuthFailures } = createAuthFailureTracker();
  const recordAuthEvent = createAuthEventRecorder({ authRepo: staticDeps.authRepo, logger });

  const { resolveNeonActorFromToken, buildActorFromRequest } = createActorResolver({
    config: staticDeps.config,
    authRepo: staticDeps.authRepo,
    extractSessionTokenFromHeaders: staticDeps.extractSessionTokenFromHeaders,
    verifyFirebaseIdToken: staticDeps.verifyFirebaseIdToken,
    verifyNeonAccessToken: staticDeps.verifyNeonAccessToken,
    mapNeonClaimsToIdentity: staticDeps.mapNeonClaimsToIdentity,
  });

  const handleSSE = createSseHandler({
    enrichmentQueue: staticDeps.enrichmentQueue,
    subscribeActivity: staticDeps.subscribeActivity,
    collaborationRepo: staticDeps.collaborationRepo,
    isWorkspaceManager,
  });

  const buildChatWebSearchTool = createBuildChatWebSearchTool(staticDeps.config, staticDeps.buildWebSearchTool);
  const executeChatToolCall = createChatToolExecutor({
    authRepo: staticDeps.authRepo,
    folderRepo: staticDeps.folderRepo,
    taskRepo: staticDeps.taskRepo,
    createMemory: staticDeps.createMemory,
    batchCreateMemories: staticDeps.batchCreateMemories,
    createWorkspaceFolder: staticDeps.createWorkspaceFolder,
    listFolderCollaborators: staticDeps.listFolderCollaborators,
    setFolderCollaboratorRole: staticDeps.setFolderCollaboratorRole,
    removeFolderCollaborator: staticDeps.removeFolderCollaborator,
    listWorkspaceActivity: staticDeps.listWorkspaceActivity,
    searchMemories: staticDeps.searchMemories,
    getMemoryRawContent: staticDeps.getMemoryRawContent,
    updateMemory: staticDeps.updateMemory,
    updateMemoryAttachment: staticDeps.updateMemoryAttachment,
    updateMemoryExtractedContent: staticDeps.updateMemoryExtractedContent,
    addMemoryComment: staticDeps.addMemoryComment,
    listMemoryVersions: staticDeps.listMemoryVersions,
    restoreMemoryVersion: staticDeps.restoreMemoryVersion,
    retryMemoryEnrichment: staticDeps.retryMemoryEnrichment,
  });

  const automationRuntime = createAutomationRuntime({
    config: staticDeps.config,
    logger,
    hasOpenAI: staticDeps.hasOpenAI,
    CHAT_TOOLS: staticDeps.CHAT_TOOLS,
    CHAT_SYSTEM_PROMPT: staticDeps.CHAT_SYSTEM_PROMPT,
    createStreamingResponse: staticDeps.createStreamingResponse,
    extractOutputUrlCitations: staticDeps.extractOutputUrlCitations,
    createAgentToolHarness: staticDeps.createAgentToolHarness,
    resolveAgentToolArgs: staticDeps.resolveAgentToolArgs,
    executeChatToolCall,
    taskRepo: staticDeps.taskRepo,
  });

  return {
    checkAuthRate,
    getAuthFailureStatus,
    registerAuthFailure,
    clearAuthFailures,
    recordAuthEvent,
    resolveNeonActorFromToken,
    buildActorFromRequest,
    handleSSE,
    buildChatWebSearchTool,
    executeChatToolCall,
    runTaskNow: automationRuntime.runTaskNow,
    startAutomationRunner: automationRuntime.startAutomationRunner,
    stopAutomationRunner: automationRuntime.stopAutomationRunner,
    isWorkspaceManager,
    buildFirebaseSessionPayload,
    buildNeonSessionPayload,
  };
}

export function buildApiHandlerDeps(staticDeps, runtimeServices, { startedAt, logger }) {
  return {
    startedAt,
    config: staticDeps.config,
    logger,
    sendJson: staticDeps.sendJson,
    sendUnauthorized: staticDeps.sendUnauthorized,
    readJsonBody: staticDeps.readJsonBody,
    resolveErrorStatus: staticDeps.resolveErrorStatus,
    getRequestIp: staticDeps.getRequestIp,
    getRequestOrigin: staticDeps.getRequestOrigin,
    hasOpenAI: staticDeps.hasOpenAI,
    isFirebaseConfigured: staticDeps.isFirebaseConfigured,
    isNeonConfigured: staticDeps.isNeonConfigured,
    providerName: staticDeps.providerName,
    storageBridgeMode: staticDeps.storageBridgeMode,
    enrichmentQueue: staticDeps.enrichmentQueue,
    checkAuthRate: runtimeServices.checkAuthRate,
    getAuthFailureStatus: runtimeServices.getAuthFailureStatus,
    registerAuthFailure: runtimeServices.registerAuthFailure,
    clearAuthFailures: runtimeServices.clearAuthFailures,
    recordAuthEvent: runtimeServices.recordAuthEvent,
    neonSignInWithEmailPassword: staticDeps.neonSignInWithEmailPassword,
    resolveNeonActorFromToken: runtimeServices.resolveNeonActorFromToken,
    buildNeonSessionPayload: runtimeServices.buildNeonSessionPayload,
    firebaseSignInWithEmailPassword: staticDeps.firebaseSignInWithEmailPassword,
    verifyFirebaseIdToken: staticDeps.verifyFirebaseIdToken,
    authRepo: staticDeps.authRepo,
    buildFirebaseSessionPayload: runtimeServices.buildFirebaseSessionPayload,
    firebaseSendEmailVerification: staticDeps.firebaseSendEmailVerification,
    neonSignUpWithEmailPassword: staticDeps.neonSignUpWithEmailPassword,
    firebaseSignUpWithEmailPassword: staticDeps.firebaseSignUpWithEmailPassword,
    neonSendPasswordResetEmail: staticDeps.neonSendPasswordResetEmail,
    firebaseSendPasswordResetEmail: staticDeps.firebaseSendPasswordResetEmail,
    firebaseRefreshIdToken: staticDeps.firebaseRefreshIdToken,
    buildActorFromRequest: runtimeServices.buildActorFromRequest,
    isWorkspaceManager: runtimeServices.isWorkspaceManager,
    getEnrichmentQueueStats: staticDeps.getEnrichmentQueueStats,
    firebaseChangePassword: staticDeps.firebaseChangePassword,
    revokeFirebaseUserSessions: staticDeps.revokeFirebaseUserSessions,
    deleteFirebaseUser: staticDeps.deleteFirebaseUser,
    handleSSE: runtimeServices.handleSSE,
    validateNotePayload: staticDeps.validateNotePayload,
    parseWorkingSetIds: staticDeps.parseWorkingSetIds,
    listWorkspaceActivity: staticDeps.listWorkspaceActivity,
    findRelatedMemories: staticDeps.findRelatedMemories,
    retryMemoryEnrichment: staticDeps.retryMemoryEnrichment,
    getMemoryById: staticDeps.getMemoryById,
    deleteMemory: staticDeps.deleteMemory,
    deleteProjectMemories: staticDeps.deleteProjectMemories,
    searchMemories: staticDeps.searchMemories,
    listRecentMemories: staticDeps.listRecentMemories,
    createMemory: staticDeps.createMemory,
    listProjects: staticDeps.listProjects,
    listTags: staticDeps.listTags,
    noteRepo: staticDeps.noteRepo,
    getMemoryStats: staticDeps.getMemoryStats,
    exportMemories: staticDeps.exportMemories,
    normalizeRecentChatMessages: staticDeps.normalizeRecentChatMessages,
    isLikelyExternalInfoRequest: staticDeps.isLikelyExternalInfoRequest,
    extractDomainsFromText: staticDeps.extractDomainsFromText,
    extractDomainFromUrl: staticDeps.extractDomainFromUrl,
    buildChatWebSearchTool: runtimeServices.buildChatWebSearchTool,
    CHAT_TOOLS: staticDeps.CHAT_TOOLS,
    createCitationNoteAliasMap: staticDeps.createCitationNoteAliasMap,
    createCitationNoteNameAliasMap: staticDeps.createCitationNoteNameAliasMap,
    createStreamingResponse: staticDeps.createStreamingResponse,
    extractOutputUrlCitations: staticDeps.extractOutputUrlCitations,
    buildCitationBlock: staticDeps.buildCitationBlock,
    CHAT_SYSTEM_PROMPT: staticDeps.CHAT_SYSTEM_PROMPT,
    createAgentToolHarness: staticDeps.createAgentToolHarness,
    resolveAgentToolArgs: staticDeps.resolveAgentToolArgs,
    executeChatToolCall: runtimeServices.executeChatToolCall,
    buildAgentNoteTitle: staticDeps.buildAgentNoteTitle,
    askMemories: staticDeps.askMemories,
    buildProjectContext: staticDeps.buildProjectContext,
    folderRepo: staticDeps.folderRepo,
    createWorkspaceFolder: staticDeps.createWorkspaceFolder,
    listFolderCollaborators: staticDeps.listFolderCollaborators,
    setFolderCollaboratorRole: staticDeps.setFolderCollaboratorRole,
    removeFolderCollaborator: staticDeps.removeFolderCollaborator,
    updateWorkspaceFolder: staticDeps.updateWorkspaceFolder,
    deleteWorkspaceFolder: staticDeps.deleteWorkspaceFolder,
    taskRepo: staticDeps.taskRepo,
    runTaskNow: runtimeServices.runTaskNow,
    addMemoryComment: staticDeps.addMemoryComment,
    listMemoryVersions: staticDeps.listMemoryVersions,
    restoreMemoryVersion: staticDeps.restoreMemoryVersion,
    updateMemoryExtractedContent: staticDeps.updateMemoryExtractedContent,
    updateMemory: staticDeps.updateMemory,
    validateBatchPayload: staticDeps.validateBatchPayload,
    validateBatchCreatePayload: staticDeps.validateBatchCreatePayload,
    batchCreateMemories: staticDeps.batchCreateMemories,
    batchDeleteMemories: staticDeps.batchDeleteMemories,
    batchMoveMemories: staticDeps.batchMoveMemories,
  };
}
