import {
  handleDeleteAccountRoute,
  handleEmailVerificationSendRoute,
  handleEnrichmentQueueRoute,
  handlePasswordChangeRoute,
  handleSignoutAllRoute,
  handleUnverifiedAccessGate,
  sendAuthSession,
} from "./authAccountRouteHandlers.js";
import {
  handleAuthAuditRoute,
  handleIncomingInvitesRoute,
  handleWorkspacesRoute,
  handleWorkspaceInvitesAcceptRoute,
  handleWorkspaceInvitesCreateRoute,
  handleWorkspaceInvitesListRoute,
  handleWorkspaceInvitesRevokeRoute,
  handleWorkspaceMembersRoute,
} from "./workspaceCollaborationRouteHandlers.js";

export async function handleAuthWorkspaceRoutes(req, res, url, context) {
  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    sendAuthSession(res, context);
    return true;
  }

  if (handleUnverifiedAccessGate(req, res, url, context)) {
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/enrichment/queue") {
    await handleEnrichmentQueueRoute(res, url, context);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/email-verification/send") {
    await handleEmailVerificationSendRoute(res, context);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/password-change") {
    await handlePasswordChangeRoute(req, res, context);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signout-all") {
    await handleSignoutAllRoute(res, context);
    return true;
  }

  if (req.method === "DELETE" && url.pathname === "/api/auth/account") {
    await handleDeleteAccountRoute(req, res, context);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces") {
    await handleWorkspacesRoute(res, context);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces/members") {
    await handleWorkspaceMembersRoute(res, url, context);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces/invites/incoming") {
    await handleIncomingInvitesRoute(res, url, context);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/workspaces/invites") {
    await handleWorkspaceInvitesListRoute(res, url, context);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/workspaces/invites") {
    await handleWorkspaceInvitesCreateRoute(req, res, context);
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/workspaces/invites/") && url.pathname.endsWith("/accept")) {
    await handleWorkspaceInvitesAcceptRoute(res, url, context);
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/workspaces/invites/")) {
    await handleWorkspaceInvitesRevokeRoute(res, url, context);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/audit") {
    await handleAuthAuditRoute(res, url, context);
    return true;
  }

  return false;
}
