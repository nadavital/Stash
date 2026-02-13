import { adaptAnswerResponse, adaptHealthResponse, adaptNotesResponse } from "./mappers.js";

const API_ENDPOINTS = Object.freeze({
  health: "/api/health",
  authLogin: "/api/auth/login",
  authSignup: "/api/auth/signup",
  authEmailVerificationSend: "/api/auth/email-verification/send",
  authPasswordReset: "/api/auth/password-reset",
  authPasswordChange: "/api/auth/password-change",
  authSignoutAll: "/api/auth/signout-all",
  authAccount: "/api/auth/account",
  authAudit: "/api/auth/audit",
  authRefresh: "/api/auth/refresh",
  authSession: "/api/auth/session",
  workspaces: "/api/workspaces",
  workspaceInvites: "/api/workspaces/invites",
  workspaceInvitesIncoming: "/api/workspaces/invites/incoming",
  notes: "/api/notes",
  projects: "/api/projects",
  chat: "/api/chat",
  context: "/api/context",
  tasks: "/api/tasks",
  folders: "/api/folders",
  events: "/api/events",
  tags: "/api/tags",
  stats: "/api/stats",
  export: "/api/export",
});

const AUTH_TOKEN_STORAGE_KEY = "stash.session.token";
const LEGACY_AUTH_TOKEN_STORAGE_KEY = "pm.session.token";
const AUTH_REFRESH_TOKEN_STORAGE_KEY = "stash.session.refreshToken";
const LEGACY_AUTH_REFRESH_TOKEN_STORAGE_KEY = "pm.session.refreshToken";
const WORKSPACE_ID_STORAGE_KEY = "stash.workspace.id";
const LEGACY_WORKSPACE_ID_STORAGE_KEY = "pm.workspace.id";

let cachedSessionToken = "";
let cachedRefreshToken = "";
let cachedWorkspaceId = "";
let refreshSessionPromise = null;

function getStoredSessionToken() {
  if (cachedSessionToken) return cachedSessionToken;
  try {
    const primary = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
    if (primary.trim()) {
      cachedSessionToken = primary.trim();
      return cachedSessionToken;
    }

    const legacy = window.localStorage.getItem(LEGACY_AUTH_TOKEN_STORAGE_KEY) || "";
    cachedSessionToken = legacy.trim();
    if (cachedSessionToken) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, cachedSessionToken);
      window.localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
    }
    return cachedSessionToken;
  } catch {
    return "";
  }
}

function setStoredSessionToken(token) {
  const normalized = String(token || "").trim();
  cachedSessionToken = normalized;
  try {
    if (normalized) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, normalized);
      window.localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}

function getStoredRefreshToken() {
  if (cachedRefreshToken) return cachedRefreshToken;
  try {
    const primary = window.localStorage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY) || "";
    if (primary.trim()) {
      cachedRefreshToken = primary.trim();
      return cachedRefreshToken;
    }

    const legacy = window.localStorage.getItem(LEGACY_AUTH_REFRESH_TOKEN_STORAGE_KEY) || "";
    cachedRefreshToken = legacy.trim();
    if (cachedRefreshToken) {
      window.localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, cachedRefreshToken);
      window.localStorage.removeItem(LEGACY_AUTH_REFRESH_TOKEN_STORAGE_KEY);
    }
    return cachedRefreshToken;
  } catch {
    return "";
  }
}

function setStoredRefreshToken(token) {
  const normalized = String(token || "").trim();
  cachedRefreshToken = normalized;
  try {
    if (normalized) {
      window.localStorage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, normalized);
      window.localStorage.removeItem(LEGACY_AUTH_REFRESH_TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.removeItem(AUTH_REFRESH_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_AUTH_REFRESH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}

function clearAuthTokens() {
  setStoredSessionToken("");
  setStoredRefreshToken("");
}

function getStoredWorkspaceId() {
  if (cachedWorkspaceId) return cachedWorkspaceId;
  try {
    const primary = window.localStorage.getItem(WORKSPACE_ID_STORAGE_KEY) || "";
    if (primary.trim()) {
      cachedWorkspaceId = primary.trim();
      return cachedWorkspaceId;
    }
    const legacy = window.localStorage.getItem(LEGACY_WORKSPACE_ID_STORAGE_KEY) || "";
    cachedWorkspaceId = legacy.trim();
    if (cachedWorkspaceId) {
      window.localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, cachedWorkspaceId);
      window.localStorage.removeItem(LEGACY_WORKSPACE_ID_STORAGE_KEY);
    }
    return cachedWorkspaceId;
  } catch {
    return "";
  }
}

function setStoredWorkspaceId(workspaceId) {
  const normalized = String(workspaceId || "").trim();
  cachedWorkspaceId = normalized;
  try {
    if (normalized) {
      window.localStorage.setItem(WORKSPACE_ID_STORAGE_KEY, normalized);
      window.localStorage.removeItem(LEGACY_WORKSPACE_ID_STORAGE_KEY);
    } else {
      window.localStorage.removeItem(WORKSPACE_ID_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_WORKSPACE_ID_STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}

function clearSessionToken() {
  clearAuthTokens();
  setStoredWorkspaceId("");
}

async function refreshSessionToken() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return "";

  if (refreshSessionPromise) return refreshSessionPromise;

  refreshSessionPromise = (async () => {
    const { response, payload } = await rawJsonFetch(API_ENDPOINTS.authRefresh, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearAuthTokens();
      return "";
    }

    const session = normalizeSessionResponse(payload);
    if (!session?.token) {
      clearAuthTokens();
      return "";
    }

    setStoredSessionToken(session.token);
    setStoredRefreshToken(session.refreshToken);
    setStoredWorkspaceId(session.workspaceId);
    return session.token;
  })().finally(() => {
    refreshSessionPromise = null;
  });

  return refreshSessionPromise;
}

async function rawJsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function parseError(payload, statusCode) {
  const message = String(payload?.error || `Request failed (${statusCode})`).trim();
  const error = new Error(message || `Request failed (${statusCode})`);
  error.status = statusCode;
  error.payload = payload;
  return error;
}

async function jsonFetch(url, options = {}) {
  const {
    skipAuth = false,
    json = true,
    headers: customHeaders,
    workspaceId,
    ...fetchOptions
  } = options;

  const token = skipAuth ? "" : getStoredSessionToken();
  if (!skipAuth && !token) {
    const error = new Error("Not authenticated");
    error.status = 401;
    throw error;
  }

  const selectedWorkspaceId = String(workspaceId || getStoredWorkspaceId() || "").trim();
  const headers = {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(selectedWorkspaceId ? { "X-Workspace-Id": selectedWorkspaceId } : {}),
    ...(customHeaders || {}),
  };

  let { response, payload } = await rawJsonFetch(url, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok && response.status === 401 && !skipAuth) {
    const refreshedToken = await refreshSessionToken();
    if (refreshedToken) {
      const retryHeaders = {
        ...(json ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${refreshedToken}`,
        ...(selectedWorkspaceId ? { "X-Workspace-Id": selectedWorkspaceId } : {}),
        ...(customHeaders || {}),
      };
      const retried = await rawJsonFetch(url, {
        ...fetchOptions,
        headers: retryHeaders,
      });
      response = retried.response;
      payload = retried.payload;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !skipAuth) {
      clearSessionToken();
    }
    throw parseError(payload, response.status);
  }

  return payload;
}

function normalizeActorResponse(payload = {}) {
  const actor = payload?.actor || payload?.session?.actor || null;
  if (!actor) return null;
  return {
    userId: actor.userId,
    userEmail: actor.userEmail,
    userName: actor.userName || "",
    workspaceId: actor.workspaceId,
    workspaceName: actor.workspaceName,
    workspaceSlug: actor.workspaceSlug || "",
    role: actor.role || "member",
    emailVerified: actor.emailVerified !== false,
    requiresEmailVerification: payload?.requiresEmailVerification === true,
    provider: actor.provider || "",
  };
}

function normalizeSessionResponse(payload = {}) {
  const session = payload?.session || null;
  if (!session) return null;
  return {
    token: session.token,
    refreshToken: session.refreshToken || "",
    userId: session.user?.id || "",
    userEmail: session.user?.email || "",
    userName: session.user?.displayName || "",
    workspaceId: session.workspace?.id || "",
    workspaceName: session.workspace?.name || "",
    workspaceSlug: session.workspace?.slug || "",
    role: session.role || "member",
    expiresAt: session.expiresAt || "",
    provider: session.provider || "",
    emailVerified: session.user?.emailVerified !== false,
    requiresEmailVerification: session.requiresEmailVerification === true,
  };
}

export function createApiClient({ adapterDebug = false } = {}) {
  function adapterLog(...args) {
    if (!adapterDebug) return;
    // eslint-disable-next-line no-console
    console.debug("[adapter]", ...args);
  }

  return {
    adapterLog,

    isAuthenticated() {
      return Boolean(getStoredSessionToken());
    },

    async login({ email, password } = {}) {
      const payload = await jsonFetch(API_ENDPOINTS.authLogin, {
        skipAuth: true,
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const session = normalizeSessionResponse(payload);
      if (!session?.token) {
        throw new Error("Invalid login response");
      }
      setStoredSessionToken(session.token);
      setStoredRefreshToken(session.refreshToken);
      setStoredWorkspaceId(session.workspaceId);
      return session;
    },

    async signup({ email, name = "", password } = {}) {
      const payload = await jsonFetch(API_ENDPOINTS.authSignup, {
        skipAuth: true,
        method: "POST",
        body: JSON.stringify({
          email,
          name,
          password,
        }),
      });

      const session = normalizeSessionResponse(payload);
      if (!session?.token) {
        throw new Error("Invalid sign-up response");
      }
      setStoredSessionToken(session.token);
      setStoredRefreshToken(session.refreshToken);
      setStoredWorkspaceId(session.workspaceId);
      return session;
    },

    async resendEmailVerification() {
      return jsonFetch(API_ENDPOINTS.authEmailVerificationSend, {
        method: "POST",
      });
    },

    async requestPasswordReset({ email } = {}) {
      return jsonFetch(API_ENDPOINTS.authPasswordReset, {
        skipAuth: true,
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },

    async changePassword({ currentPassword = "", newPassword = "" } = {}) {
      const payload = await jsonFetch(API_ENDPOINTS.authPasswordChange, {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const session = normalizeSessionResponse(payload);
      if (session?.token) {
        setStoredSessionToken(session.token);
        setStoredRefreshToken(session.refreshToken);
        setStoredWorkspaceId(session.workspaceId);
      }
      return payload;
    },

    async signOutAll() {
      const payload = await jsonFetch(API_ENDPOINTS.authSignoutAll, {
        method: "POST",
      });
      clearSessionToken();
      return payload;
    },

    async deleteAccount({ password = "" } = {}) {
      const payload = await jsonFetch(API_ENDPOINTS.authAccount, {
        method: "DELETE",
        body: JSON.stringify({ password }),
      });
      clearSessionToken();
      return payload;
    },

    async fetchSession() {
      const token = getStoredSessionToken();
      if (!token) return null;

      try {
        const payload = await jsonFetch(API_ENDPOINTS.authSession, { method: "GET" });
        const actor = normalizeActorResponse(payload);
        if (actor?.workspaceId) {
          setStoredWorkspaceId(actor.workspaceId);
        }
        return actor;
      } catch (error) {
        if (error && typeof error === "object" && error.status === 401) {
          clearSessionToken();
          return null;
        }
        throw error;
      }
    },

    logout() {
      clearSessionToken();
    },

    getWorkspaceId() {
      return getStoredWorkspaceId();
    },

    setWorkspaceId(workspaceId) {
      setStoredWorkspaceId(workspaceId);
    },

    async fetchWorkspaces() {
      return jsonFetch(API_ENDPOINTS.workspaces);
    },

    async fetchWorkspaceInvites({ status = "", limit = 100 } = {}) {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (limit) params.set("limit", String(limit));
      return jsonFetch(`${API_ENDPOINTS.workspaceInvites}?${params.toString()}`);
    },

    async fetchIncomingWorkspaceInvites({ limit = 100 } = {}) {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      return jsonFetch(`${API_ENDPOINTS.workspaceInvitesIncoming}?${params.toString()}`);
    },

    async createWorkspaceInvite({ email, role = "member", expiresInHours = 72 } = {}) {
      return jsonFetch(API_ENDPOINTS.workspaceInvites, {
        method: "POST",
        body: JSON.stringify({ email, role, expiresInHours }),
      });
    },

    async acceptWorkspaceInvite(token) {
      const normalizedToken = String(token || "").trim();
      if (!normalizedToken) throw new Error("Missing invite token");
      return jsonFetch(`${API_ENDPOINTS.workspaceInvites}/${encodeURIComponent(normalizedToken)}/accept`, {
        method: "POST",
      });
    },

    async revokeWorkspaceInvite(inviteId) {
      const normalizedId = String(inviteId || "").trim();
      if (!normalizedId) throw new Error("Missing invite id");
      return jsonFetch(`${API_ENDPOINTS.workspaceInvites}/${encodeURIComponent(normalizedId)}`, {
        method: "DELETE",
      });
    },

    async fetchAuthAudit({ limit = 100 } = {}) {
      const params = new URLSearchParams();
      if (limit) params.set("limit", String(limit));
      return jsonFetch(`${API_ENDPOINTS.authAudit}?${params.toString()}`);
    },

    async health() {
      const payload = await jsonFetch(API_ENDPOINTS.health, { skipAuth: true });
      return adaptHealthResponse(payload);
    },

    async fetchNotes({ query = "", project = "", limit = 80, offset = 0 } = {}) {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (project) params.set("project", project);
      params.set("limit", String(limit));
      if (offset > 0) params.set("offset", String(offset));
      const payload = await jsonFetch(`${API_ENDPOINTS.notes}?${params.toString()}`);
      return adaptNotesResponse(payload);
    },

    async saveNote(payload) {
      return jsonFetch(API_ENDPOINTS.notes, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async deleteNote(id) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) {
        throw new Error("Missing id");
      }
      return jsonFetch(`${API_ENDPOINTS.notes}/${encodeURIComponent(normalizedId)}`, {
        method: "DELETE",
      });
    },

    async deleteProject(project) {
      const normalizedProject = String(project || "").trim();
      if (!normalizedProject) {
        throw new Error("Missing project");
      }
      return jsonFetch(`${API_ENDPOINTS.projects}/${encodeURIComponent(normalizedProject)}`, {
        method: "DELETE",
      });
    },

    async ask(payload) {
      const response = await jsonFetch(API_ENDPOINTS.chat, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return adaptAnswerResponse(response, "chat");
    },

    async askStreaming(payload, { onCitations, onToken, onDone, onError }) {
      try {
        const token = getStoredSessionToken();
        const selectedWorkspaceId = String(getStoredWorkspaceId() || "").trim();
        if (!token) {
          const authError = new Error("Not authenticated");
          authError.status = 401;
          throw authError;
        }

        const response = await fetch(API_ENDPOINTS.chat, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
            ...(selectedWorkspaceId ? { "X-Workspace-Id": selectedWorkspaceId } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          if (response.status === 401) {
            clearSessionToken();
          }
          throw parseError(err, response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              try {
                const parsed = JSON.parse(data);
                if (eventType === "citations" && onCitations) onCitations(parsed.citations || []);
                else if (eventType === "token" && onToken) onToken(parsed.token || "");
                else if (eventType === "done" && onDone) onDone();
              } catch {
                // skip malformed event payloads
              }
              eventType = "";
            }
          }
        }

        if (onDone) onDone();
      } catch (error) {
        if (onError) onError(error);
      }
    },

    async context(payload) {
      const response = await jsonFetch(API_ENDPOINTS.context, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return adaptAnswerResponse(response, "context");
    },

    async fetchTasks({ status = "open" } = {}) {
      const params = new URLSearchParams();
      if (status) params.set("status", String(status));
      return jsonFetch(`${API_ENDPOINTS.tasks}?${params.toString()}`);
    },

    async createTask(payload) {
      return jsonFetch(API_ENDPOINTS.tasks, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async updateTask(id, payload) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) throw new Error("Missing task id");
      return jsonFetch(`${API_ENDPOINTS.tasks}/${encodeURIComponent(normalizedId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },

    async deleteTask(id) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) throw new Error("Missing task id");
      return jsonFetch(`${API_ENDPOINTS.tasks}/${encodeURIComponent(normalizedId)}`, {
        method: "DELETE",
      });
    },

    async fetchFolders({ parentId } = {}) {
      const params = new URLSearchParams();
      if (parentId) params.set("parentId", String(parentId));
      return jsonFetch(`${API_ENDPOINTS.folders}?${params.toString()}`);
    },

    async createFolder(payload) {
      return jsonFetch(API_ENDPOINTS.folders, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async getFolder(id) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) throw new Error("Missing folder id");
      return jsonFetch(`${API_ENDPOINTS.folders}/${encodeURIComponent(normalizedId)}`);
    },

    async updateFolder(id, payload) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) throw new Error("Missing folder id");
      return jsonFetch(`${API_ENDPOINTS.folders}/${encodeURIComponent(normalizedId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },

    async deleteFolder(id) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) throw new Error("Missing folder id");
      return jsonFetch(`${API_ENDPOINTS.folders}/${encodeURIComponent(normalizedId)}`, {
        method: "DELETE",
      });
    },

    async fetchSubfolders(id) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) throw new Error("Missing folder id");
      return jsonFetch(`${API_ENDPOINTS.folders}/${encodeURIComponent(normalizedId)}/children`);
    },

    async updateNote(id, payload) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) throw new Error("Missing id");
      return jsonFetch(`${API_ENDPOINTS.notes}/${encodeURIComponent(normalizedId)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },

    async addNoteComment(id, payload) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) throw new Error("Missing id");
      return jsonFetch(`${API_ENDPOINTS.notes}/${encodeURIComponent(normalizedId)}/comments`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    async fetchTags() {
      return jsonFetch(API_ENDPOINTS.tags);
    },

    async renameTag(oldTag, newTag) {
      return jsonFetch(`${API_ENDPOINTS.tags}/rename`, {
        method: "POST",
        body: JSON.stringify({ oldTag, newTag }),
      });
    },

    async deleteTag(tag) {
      const normalizedTag = String(tag || "").trim();
      if (!normalizedTag) throw new Error("Missing tag");
      return jsonFetch(`${API_ENDPOINTS.tags}/${encodeURIComponent(normalizedTag)}`, {
        method: "DELETE",
      });
    },

    async fetchStats() {
      return jsonFetch(API_ENDPOINTS.stats);
    },

    async batchDeleteNotes(ids) {
      return jsonFetch(`${API_ENDPOINTS.notes}/batch-delete`, {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },

    async batchMoveNotes(ids, project) {
      return jsonFetch(`${API_ENDPOINTS.notes}/batch-move`, {
        method: "POST",
        body: JSON.stringify({ ids, project }),
      });
    },

    exportUrl({ project = "", format = "json" } = {}) {
      const params = new URLSearchParams();
      if (project) params.set("project", project);
      if (format) params.set("format", format);
      const token = getStoredSessionToken();
      const selectedWorkspaceId = String(getStoredWorkspaceId() || "").trim();
      if (token) params.set("sessionToken", token);
      if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
      return `${API_ENDPOINTS.export}?${params.toString()}`;
    },

    subscribeToEvents(onEvent) {
      const token = getStoredSessionToken();
      if (!token) {
        adapterLog("SSE skipped: missing auth token");
        return () => {};
      }

      const params = new URLSearchParams();
      params.set("sessionToken", token);
      const selectedWorkspaceId = String(getStoredWorkspaceId() || "").trim();
      if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
      const eventSource = new EventSource(`${API_ENDPOINTS.events}?${params.toString()}`);
      eventSource.addEventListener("job:start", (e) => {
        try { onEvent({ type: "job:start", ...JSON.parse(e.data) }); } catch { /* no-op */ }
      });
      eventSource.addEventListener("job:complete", (e) => {
        try { onEvent({ type: "job:complete", ...JSON.parse(e.data) }); } catch { /* no-op */ }
      });
      eventSource.addEventListener("job:error", (e) => {
        try { onEvent({ type: "job:error", ...JSON.parse(e.data) }); } catch { /* no-op */ }
      });
      eventSource.addEventListener("connected", () => {
        adapterLog("SSE connected");
      });
      eventSource.onerror = () => {
        adapterLog("SSE connection error, will auto-reconnect");
      };
      return () => eventSource.close();
    },
  };
}
