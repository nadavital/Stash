import process from "node:process";
import { config } from "../src/config.js";
import { taskRepo } from "../src/storage/provider.js";
import { buildActorFromToolArgs } from "../src/toolAuth.js";
import {
  addMemoryComment,
  createMemory,
  deleteMemory,
  deleteProjectMemories,
  getEnrichmentQueueStats,
  getMemoryRawContent,
  listMemoryVersions,
  readExtractedMarkdownMemory,
  retryMemoryEnrichment,
  restoreMemoryVersion,
  searchNotesBm25,
  updateMemory,
  updateMemoryExtractedContent,
} from "../src/memoryService.js";

const PROTOCOL_VERSION = "2024-11-05";

const TOOL_DEFS = [
  {
    name: "create_note",
    description: "Create a note, link, image, or file-backed item.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Primary text content (optional for file-only capture)" },
        sourceType: { type: "string", enum: ["text", "link", "image", "file"], default: "text" },
        sourceUrl: { type: "string", description: "Optional source URL" },
        project: { type: "string", description: "Optional folder/project" },
        imageDataUrl: { type: "string", description: "Image data URL payload" },
        fileDataUrl: { type: "string", description: "File data URL payload" },
        fileName: { type: "string", description: "Original file name" },
        fileMimeType: { type: "string", description: "Original file MIME type" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_note_raw_content",
    description: "Get extracted raw/markdown content for a note.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        includeMarkdown: { type: "boolean", description: "Include markdownContent", default: true },
        maxChars: { type: "number", description: "Maximum characters to return", default: 12000 },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "update_note",
    description: "Update note content/summary/tags/project.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        content: { type: "string", description: "Updated content" },
        summary: { type: "string", description: "Updated summary" },
        tags: { type: "array", items: { type: "string" }, description: "Updated tags" },
        project: { type: "string", description: "Updated project/folder" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "update_note_markdown",
    description: "Edit extracted raw/markdown content fields, with optional re-enrichment.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        content: { type: "string", description: "Optional top-level note content override" },
        rawContent: { type: "string", description: "Updated extracted raw text" },
        markdownContent: { type: "string", description: "Updated extracted markdown text" },
        requeueEnrichment: { type: "boolean", description: "Re-run enrichment after edit", default: true },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "add_note_comment",
    description: "Add a contextual comment to a note.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        text: { type: "string", description: "Comment text" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "list_note_versions",
    description: "List version history for a note.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "restore_note_version",
    description: "Restore note to a previous version number.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        versionNumber: { type: "number", description: "Version number to restore" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id", "versionNumber"],
      additionalProperties: false,
    },
  },
  {
    name: "search_notes",
    description: "Search notes using BM25 ranking.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        project: { type: "string", description: "Optional project filter" },
        scope: {
          type: "string",
          enum: ["all", "workspace", "user", "project", "item"],
          description: "Memory scope selector",
          default: "all",
        },
        workingSetIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional note ids to treat as a focused working set",
        },
        includeMarkdown: { type: "boolean", description: "Include markdown content in results", default: false },
        limit: { type: "number", description: "Max results", default: 8 },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_tasks",
    description: "List open tasks from the local task store.",
    inputSchema: {
      type: "object",
      properties: {
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "obtain_consolidated_memory_file",
    description: "Read the consolidated markdown memory file.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Optional absolute path override" },
        maxChars: { type: "number", description: "Maximum characters to return", default: 30000 },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed (closed) by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id to mark closed" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_note",
    description: "Delete a memory note by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id to delete" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_project",
    description: "Delete all notes in a project folder by project name.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project folder name to delete" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
  {
    name: "retry_note_enrichment",
    description: "Retry enrichment for a note id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_enrichment_queue",
    description: "Get enrichment queue counts and failed jobs (workspace owners/admins only).",
    inputSchema: {
      type: "object",
      properties: {
        failedLimit: { type: "number", description: "Max failed jobs to include", default: 20 },
        sessionToken: {
          type: "string",
          description: "Auth token (optional when STASH_SESSION_TOKEN env var is set on the MCP server)",
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id override (or set STASH_WORKSPACE_ID on MCP server)",
        },
      },
      additionalProperties: false,
    },
  },
];

function sendMessage(payload) {
  const json = JSON.stringify(payload);
  const bytes = Buffer.byteLength(json, "utf8");
  process.stdout.write(`Content-Length: ${bytes}\r\n\r\n${json}`);
}

function sendError(id, code, message, data = undefined) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}

function sendResult(id, result) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
}

async function callTool(name, args = {}) {
  const actor = await buildActorFromToolArgs(args);
  switch (name) {
    case "create_note": {
      const note = await createMemory({
        content: String(args.content || ""),
        sourceType: String(args.sourceType || "text"),
        sourceUrl: String(args.sourceUrl || ""),
        imageDataUrl: String(args.imageDataUrl || "").trim() || null,
        fileDataUrl: String(args.fileDataUrl || "").trim() || null,
        fileName: String(args.fileName || ""),
        fileMimeType: String(args.fileMimeType || ""),
        project: String(args.project || ""),
        metadata: { createdFrom: "mcp-tool", actorUserId: actor.userId },
        actor,
      });
      return { note };
    }
    case "get_note_raw_content": {
      return getMemoryRawContent({
        id: String(args.id || ""),
        includeMarkdown: args.includeMarkdown !== false,
        maxChars: Number(args.maxChars || 12000),
        actor,
      });
    }
    case "update_note": {
      const note = await updateMemory({
        id: String(args.id || ""),
        content: args.content,
        summary: args.summary,
        tags: Array.isArray(args.tags) ? args.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : undefined,
        project: args.project,
        actor,
      });
      return { note };
    }
    case "update_note_markdown": {
      const note = await updateMemoryExtractedContent({
        id: String(args.id || ""),
        content: args.content,
        rawContent: args.rawContent,
        markdownContent: args.markdownContent,
        requeueEnrichment: args.requeueEnrichment !== false,
        actor,
      });
      return { note };
    }
    case "add_note_comment": {
      return addMemoryComment({
        id: String(args.id || ""),
        text: String(args.text || ""),
        actor,
      });
    }
    case "list_note_versions": {
      return listMemoryVersions({
        id: String(args.id || ""),
        actor,
      });
    }
    case "restore_note_version": {
      const note = await restoreMemoryVersion({
        id: String(args.id || ""),
        versionNumber: Number(args.versionNumber || 0),
        actor,
      });
      return { note };
    }
    case "search_notes": {
      const results = await searchNotesBm25({
        query: String(args.query || ""),
        project: String(args.project || ""),
        scope: String(args.scope || "all"),
        workingSetIds: args.workingSetIds,
        includeMarkdown: args.includeMarkdown === true,
        limit: Number(args.limit || 8),
        actor,
      });
      return { results };
    }
    case "obtain_consolidated_memory_file": {
      const memoryFile = await readExtractedMarkdownMemory({
        filePath: String(args.filePath || ""),
        maxChars: Number(args.maxChars || 30000),
        actor,
      });
      return { memoryFile };
    }
    case "get_tasks": {
      const tasks = await taskRepo.listOpenTasks(actor.workspaceId);
      return { tasks };
    }
    case "complete_task": {
      const task = await taskRepo.completeTask(String(args.id || ""), actor.workspaceId);
      return { task };
    }
    case "delete_note": {
      const result = await deleteMemory({
        id: String(args.id || ""),
        actor,
      });
      return result;
    }
    case "delete_project": {
      const result = await deleteProjectMemories({
        project: String(args.project || ""),
        actor,
      });
      return result;
    }
    case "retry_note_enrichment": {
      return retryMemoryEnrichment({
        id: String(args.id || ""),
        actor,
      });
    }
    case "get_enrichment_queue": {
      return getEnrichmentQueueStats({
        actor,
        failedLimit: Number(args.failedLimit || 20),
      });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  if (method === "initialize") {
    sendResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: config.mcpServerName,
        version: config.mcpServerVersion,
      },
    });
    return;
  }

  if (method === "tools/list") {
    sendResult(id, { tools: TOOL_DEFS });
    return;
  }

  if (method === "tools/call") {
    try {
      const name = params?.name;
      const args = params?.arguments || {};
      const result = await callTool(name, args);
      sendResult(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (error) {
      sendResult(id, {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Unknown error",
          },
        ],
      });
    }
    return;
  }

  if (method === "ping") {
    sendResult(id, { ok: true, serverTime: new Date().toISOString() });
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = Buffer.alloc(0);

function tryParseMessages() {
  while (true) {
    const delimiter = buffer.indexOf("\r\n\r\n");
    if (delimiter !== -1) {
      const headerText = buffer.slice(0, delimiter).toString("utf8");
      const headers = headerText.split("\r\n");
      let contentLength = 0;

      for (const header of headers) {
        const splitIndex = header.indexOf(":");
        if (splitIndex === -1) continue;
        const key = header.slice(0, splitIndex).trim().toLowerCase();
        const value = header.slice(splitIndex + 1).trim();
        if (key === "content-length") {
          contentLength = Number(value);
        }
      }

      if (Number.isFinite(contentLength) && contentLength > 0) {
        const bodyStart = delimiter + 4;
        const bodyEnd = bodyStart + contentLength;
        if (buffer.length < bodyEnd) return;

        const bodyText = buffer.slice(bodyStart, bodyEnd).toString("utf8");
        buffer = buffer.slice(bodyEnd);

        let message;
        try {
          message = JSON.parse(bodyText);
        } catch {
          continue;
        }

        handleRequest(message).catch((error) => {
          if (message && message.id !== undefined) {
            sendError(message.id, -32603, error instanceof Error ? error.message : "Internal error");
          }
        });
        continue;
      }
    }

    const newline = buffer.indexOf("\n");
    if (newline === -1) return;
    const line = buffer.slice(0, newline).toString("utf8").replace(/\r$/, "");
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }

    handleRequest(message).catch((error) => {
      if (message?.id !== undefined) {
        sendError(message.id, -32603, error instanceof Error ? error.message : "Internal error");
      }
    });
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  tryParseMessages();
});

process.stdin.on("error", (error) => {
  process.stderr.write(`stdin error: ${error.message}\n`);
});

process.stderr.write(`MCP server started: ${config.mcpServerName}@${config.mcpServerVersion}\n`);
