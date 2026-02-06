import { adaptAnswerResponse, adaptHealthResponse, adaptNotesResponse } from "./mappers.js";

const API_ENDPOINTS = Object.freeze({
  health: "/api/health",
  notes: "/api/notes",
  projects: "/api/projects",
  chat: "/api/chat",
  context: "/api/context",
  tasks: "/api/tasks",
});

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }

  return payload;
}

export function createApiClient({ adapterDebug = false } = {}) {
  function adapterLog(...args) {
    if (!adapterDebug) return;
    // eslint-disable-next-line no-console
    console.debug("[adapter]", ...args);
  }

  return {
    adapterLog,
    async health() {
      const payload = await jsonFetch(API_ENDPOINTS.health);
      return adaptHealthResponse(payload);
    },
    async fetchNotes({ query = "", project = "", limit = 80 } = {}) {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (project) params.set("project", project);
      params.set("limit", String(limit));
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
  };
}
