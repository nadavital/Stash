import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SERVER_PATH = path.join(ROOT, "mcp/server.js");
const SESSION_TOKEN = String(process.env.STASH_SESSION_TOKEN || "").trim();
const WORKSPACE_ID = String(process.env.STASH_WORKSPACE_ID || "").trim();

function encodeMessage(payload) {
  const body = JSON.stringify(payload);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function parseMessagesFromBuffer(buffer) {
  const messages = [];
  let remainder = buffer;

  while (true) {
    const headerEnd = remainder.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const header = remainder.slice(0, headerEnd).toString("utf8");
    const m = header.match(/Content-Length:\s*(\d+)/i);
    if (!m) break;

    const contentLength = Number(m[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;
    if (remainder.length < bodyEnd) break;

    const body = remainder.slice(bodyStart, bodyEnd).toString("utf8");
    try {
      messages.push(JSON.parse(body));
    } catch {
      // skip malformed message
    }

    remainder = remainder.slice(bodyEnd);
  }

  return { messages, remainder };
}

function parseToolPayload(callResponse) {
  if (callResponse?.result?.isError) {
    return {
      ok: false,
      error: callResponse?.result?.content?.[0]?.text || "Unknown tool error",
    };
  }

  const text = callResponse?.result?.content?.[0]?.text;
  if (!text) return { ok: false, error: "Missing tool response content" };

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `Could not parse tool response JSON: ${error.message}` };
  }
}

async function main() {
  if (!SESSION_TOKEN) {
    console.error("Missing auth token. Set STASH_SESSION_TOKEN before running this script.");
    process.exit(1);
  }

  const child = spawn("node", [SERVER_PATH], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let nextId = 1;
  let stdoutBuffer = Buffer.alloc(0);
  const responsesById = new Map();

  child.stdout.on("data", (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    const parsed = parseMessagesFromBuffer(stdoutBuffer);
    stdoutBuffer = parsed.remainder;
    for (const msg of parsed.messages) {
      if (msg?.id !== undefined) responsesById.set(msg.id, msg);
    }
  });

  child.stderr.on("data", (chunk) => {
    const line = chunk.toString("utf8").trim();
    if (line) {
      // Keep stderr visible for debugging startup issues.
      console.error(`[mcp-server] ${line}`);
    }
  });

  function waitForResponse(id, timeoutMs = 15000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (responsesById.has(id)) {
          clearInterval(timer);
          resolve(responsesById.get(id));
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for response id=${id}`));
        }
      }, 20);
    });
  }

  async function rpc(method, params) {
    const id = nextId++;
    child.stdin.write(encodeMessage({ jsonrpc: "2.0", id, method, params }));
    return await waitForResponse(id);
  }

  try {
    const init = await rpc("initialize", { protocolVersion: "2024-11-05" });
    console.log("initialize:", init.result?.serverInfo || init.error);

    const list = await rpc("tools/list", {});
    const tools = list.result?.tools || [];
    const toolNames = tools.map((t) => t.name);
    console.log("tools/list count:", toolNames.length);
    console.log("tools:", toolNames.join(", "));

    const expectedTools = [
      "search_notes",
      "get_tasks",
      "obtain_consolidated_memory_file",
      "complete_task",
      "delete_note",
      "delete_project",
    ];
    const missingTools = expectedTools.filter((name) => !toolNames.includes(name));
    if (missingTools.length) {
      console.error(`Missing expected tools: ${missingTools.join(", ")}`);
    }

    const checks = [
      { name: "get_tasks", args: {} },
      { name: "search_notes", args: { query: "integration mcp", limit: 3 } },
      { name: "obtain_consolidated_memory_file", args: { maxChars: 200 } },
      { name: "complete_task", args: { id: "task-002" } },
      { name: "delete_note", args: { id: "missing-note-id" } },
      { name: "delete_project", args: { project: "missing-project" } },
    ];

    for (const check of checks) {
      const call = await rpc("tools/call", {
        name: check.name,
        arguments: {
          sessionToken: SESSION_TOKEN,
          ...(WORKSPACE_ID ? { workspaceId: WORKSPACE_ID } : {}),
          ...check.args,
        },
      });
      const parsed = parseToolPayload(call);
      if (!parsed.ok) {
        console.error(`${check.name}: ERROR -> ${parsed.error}`);
        continue;
      }

      const topKeys = Object.keys(parsed.data || {});
      console.log(`${check.name}: OK keys=${topKeys.join(",")}`);

      if (check.name === "get_tasks") {
        const tasks = parsed.data?.tasks || [];
        console.log(`get_tasks count=${tasks.length}`);
      }
      if (check.name === "search_notes") {
        const results = parsed.data?.results || [];
        const top = results[0]?.note;
        if (top) {
          console.log(`search_notes top=${top.id} project=${top.project || ""}`);
        }
      }
      if (check.name === "complete_task") {
        const task = parsed.data?.task || {};
        console.log(`complete_task id=${task.id || ""} status=${task.status || ""}`);
      }
      if (check.name === "delete_note") {
        console.log(`delete_note deleted=${parsed.data?.deleted === true ? "true" : "false"}`);
      }
      if (check.name === "delete_project") {
        console.log(`delete_project deletedCount=${Number(parsed.data?.deletedCount || 0)}`);
      }
    }

    console.log("MCP client test completed.");
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error("MCP client test failed:", error.message);
  process.exit(1);
});
