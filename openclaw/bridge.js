import {
  deleteMemory,
  deleteProjectMemories,
  readExtractedMarkdownMemory,
  searchNotesBm25,
} from "../src/memoryService.js";
import { taskRepo } from "../src/tasksDb.js";

async function run() {
  const [, , toolName, rawArgs] = process.argv;
  if (!toolName) {
    process.stderr.write("Usage: node openclaw/bridge.js <tool_name> '<json_args>'\n");
    process.exit(1);
  }

  let args = {};
  if (rawArgs) {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      process.stderr.write("Invalid JSON args\n");
      process.exit(1);
    }
  }

  try {
    let result;
    switch (toolName) {
      case "search_notes":
        result = await searchNotesBm25({
          query: String(args.query || ""),
          project: String(args.project || ""),
          includeMarkdown: args.includeMarkdown === true,
          limit: Number(args.limit || 8),
        });
        break;
      case "obtain_consolidated_memory_file":
        result = await readExtractedMarkdownMemory({
          maxChars: Number(args.maxChars || 30000),
        });
        break;
      case "get_tasks":
        result = taskRepo.listOpenTasks();
        break;
      case "complete_task":
        result = taskRepo.completeTask(String(args.id || ""));
        break;
      case "delete_note":
        result = await deleteMemory({
          id: String(args.id || ""),
        });
        break;
      case "delete_project":
        result = await deleteProjectMemories({
          project: String(args.project || ""),
        });
        break;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`
    );
    process.exit(1);
  }
}

run();
