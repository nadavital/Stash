import process from "node:process";
import { config } from "../src/config.js";
import { taskRepo } from "../src/tasksDb.js";
import {
  deleteMemory,
  deleteProjectMemories,
  readExtractedMarkdownMemory,
  searchNotesBm25,
} from "../src/memoryService.js";

const PROTOCOL_VERSION = "2024-11-05";

const TOOL_DEFS = [
  {
    name: "search_notes",
    description: "Search notes using BM25 ranking.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        project: { type: "string", description: "Optional project filter" },
        includeMarkdown: { type: "boolean", description: "Include markdown content in results", default: false },
        limit: { type: "number", description: "Max results", default: 8 },
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
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "obtain_consolidated_memory_file",
    description: "Read the consolidated markdown memory file.",
    inputSchema: {
      type: "object",
      properties: {
        maxChars: { type: "number", description: "Maximum characters to return", default: 30000 },
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
      },
      required: ["project"],
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
  switch (name) {
    case "search_notes": {
      const results = await searchNotesBm25({
        query: String(args.query || ""),
        project: String(args.project || ""),
        includeMarkdown: args.includeMarkdown === true,
        limit: Number(args.limit || 8),
      });
      return { results };
    }
    case "obtain_consolidated_memory_file": {
      const memoryFile = await readExtractedMarkdownMemory({
        maxChars: Number(args.maxChars || 30000),
      });
      return { memoryFile };
    }
    case "get_tasks": {
      const tasks = taskRepo.listOpenTasks();
      return { tasks };
    }
    case "complete_task": {
      const task = taskRepo.completeTask(String(args.id || ""));
      return { task };
    }
    case "delete_note": {
      const result = await deleteMemory({
        id: String(args.id || ""),
      });
      return result;
    }
    case "delete_project": {
      const result = await deleteProjectMemories({
        project: String(args.project || ""),
      });
      return result;
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
