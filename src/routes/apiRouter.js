import { handleMetaRoutes } from "./metaRoutes.js";
import { handleBatchNoteRoutes } from "./batchNoteRoutes.js";
import { handleFolderRoutes } from "./folderRoutes.js";
import { handleTaskRoutes } from "./taskRoutes.js";
import { handleNoteMutationRoutes } from "./noteMutationRoutes.js";
import { handleNoteRoutes } from "./noteRoutes.js";
import { handlePublicAuthRoutes } from "./publicAuthRoutes.js";
import { handleAuthWorkspaceRoutes } from "./authWorkspaceRoutes.js";
import { handleChatRoutes } from "./chatRoutes.js";
import {
  buildPublicAuthRouteContext,
  buildAuthWorkspaceRouteContext,
  buildNoteRouteContext,
  buildMetaRouteContext,
  buildChatRouteContext,
  buildFolderRouteContext,
  buildTaskRouteContext,
  buildNoteMutationRouteContext,
  buildBatchRouteContext,
} from "./apiRouteContexts.js";
import { handleApiHealth } from "./apiHealth.js";

const defaultRouteHandlers = {
  handleApiHealth,
  handlePublicAuthRoutes,
  handleAuthWorkspaceRoutes,
  handleNoteRoutes,
  handleMetaRoutes,
  handleChatRoutes,
  handleFolderRoutes,
  handleTaskRoutes,
  handleNoteMutationRoutes,
  handleBatchNoteRoutes,
};

export function createApiHandler(deps, routeHandlers = defaultRouteHandlers) {
  return async function handleApi(req, res, url) {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Token, X-Workspace-Id",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      });
      res.end();
      return;
    }

    if (await routeHandlers.handleApiHealth(req, res, { ...deps, url })) {
      return;
    }

    const requestIp = deps.getRequestIp(req);
    const requestOrigin = deps.getRequestOrigin(req);
    if (
      await routeHandlers.handlePublicAuthRoutes(
        req,
        res,
        url,
        buildPublicAuthRouteContext(deps, { requestIp, requestOrigin }),
      )
    ) {
      return;
    }

    const actor = await deps.buildActorFromRequest(req, {
      url,
      allowQueryToken:
        req.method === "GET" && (url.pathname === "/api/events" || url.pathname === "/api/export"),
    });
    if (!actor) {
      deps.sendUnauthorized(res, deps.config.authProvider);
      return;
    }

    const requiresEmailVerification =
      (deps.config.authProvider === "firebase" || deps.config.authProvider === "neon") &&
      deps.config.authRequireEmailVerification &&
      !actor.emailVerified;

    if (
      await routeHandlers.handleAuthWorkspaceRoutes(
        req,
        res,
        url,
        buildAuthWorkspaceRouteContext(deps, { actor, requestIp, requiresEmailVerification }),
      )
    ) {
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      deps.handleSSE(req, res, actor);
      return;
    }

    if (await routeHandlers.handleNoteRoutes(req, res, url, buildNoteRouteContext(deps, { actor }))) {
      return;
    }

    if (await routeHandlers.handleMetaRoutes(req, res, url, buildMetaRouteContext(deps, { actor }))) {
      return;
    }

    if (await routeHandlers.handleChatRoutes(req, res, url, buildChatRouteContext(deps, { actor }))) {
      return;
    }

    if (await routeHandlers.handleFolderRoutes(req, res, url, buildFolderRouteContext(deps, { actor }))) {
      return;
    }

    if (await routeHandlers.handleTaskRoutes(req, res, url, buildTaskRouteContext(deps, { actor }))) {
      return;
    }

    if (await routeHandlers.handleNoteMutationRoutes(req, res, url, buildNoteMutationRouteContext(deps, { actor }))) {
      return;
    }

    if (await routeHandlers.handleBatchNoteRoutes(req, res, url, buildBatchRouteContext(deps, { actor }))) {
      return;
    }

    deps.sendJson(res, 404, { error: "API route not found" });
  };
}
