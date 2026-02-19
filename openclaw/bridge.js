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
import { taskRepo } from "../src/storage/provider.js";
import { closePostgresPool } from "../src/postgres/pool.js";
import { buildActorFromToolArgs } from "../src/toolAuth.js";

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

  let exitCode = 0;
  try {
    const actor = await buildActorFromToolArgs(args);
    let result;
    switch (toolName) {
      case "create_note":
        result = await createMemory({
          content: String(args.content || ""),
          sourceType: String(args.sourceType || "text"),
          sourceUrl: String(args.sourceUrl || ""),
          imageDataUrl: String(args.imageDataUrl || "").trim() || null,
          fileDataUrl: String(args.fileDataUrl || "").trim() || null,
          fileName: String(args.fileName || ""),
          fileMimeType: String(args.fileMimeType || ""),
          project: String(args.project || ""),
          metadata: { createdFrom: "openclaw-tool", actorUserId: actor.userId },
          actor,
        });
        break;
      case "get_note_raw_content":
        result = await getMemoryRawContent({
          id: String(args.id || ""),
          includeMarkdown: args.includeMarkdown !== false,
          maxChars: Number(args.maxChars || 12000),
          actor,
        });
        break;
      case "update_note":
        result = await updateMemory({
          id: String(args.id || ""),
          content: args.content,
          summary: args.summary,
          tags: Array.isArray(args.tags) ? args.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : undefined,
          project: args.project,
          actor,
        });
        break;
      case "update_note_markdown":
        result = await updateMemoryExtractedContent({
          id: String(args.id || ""),
          content: args.content,
          rawContent: args.rawContent,
          markdownContent: args.markdownContent,
          requeueEnrichment: args.requeueEnrichment !== false,
          actor,
        });
        break;
      case "add_note_comment":
        result = await addMemoryComment({
          id: String(args.id || ""),
          text: String(args.text || ""),
          actor,
        });
        break;
      case "list_note_versions":
        result = await listMemoryVersions({
          id: String(args.id || ""),
          actor,
        });
        break;
      case "restore_note_version":
        result = await restoreMemoryVersion({
          id: String(args.id || ""),
          versionNumber: Number(args.versionNumber || 0),
          actor,
        });
        break;
      case "search_notes":
        result = await searchNotesBm25({
          query: String(args.query || ""),
          project: String(args.project || ""),
          scope: String(args.scope || "all"),
          workingSetIds: args.workingSetIds,
          includeMarkdown: args.includeMarkdown === true,
          limit: Number(args.limit || 8),
          actor,
        });
        break;
      case "obtain_consolidated_memory_file":
        result = await readExtractedMarkdownMemory({
          filePath: String(args.filePath || ""),
          maxChars: Number(args.maxChars || 30000),
          actor,
        });
        break;
      case "get_tasks":
        result = await taskRepo.listOpenTasks(actor.workspaceId);
        break;
      case "complete_task":
        result = await taskRepo.completeTask(String(args.id || ""), actor.workspaceId);
        break;
      case "delete_note":
        result = await deleteMemory({
          id: String(args.id || ""),
          actor,
        });
        break;
      case "delete_project":
        result = await deleteProjectMemories({
          project: String(args.project || ""),
          actor,
        });
        break;
      case "retry_note_enrichment":
        result = await retryMemoryEnrichment({
          id: String(args.id || ""),
          actor,
        });
        break;
      case "get_enrichment_queue":
        result = await getEnrichmentQueueStats({
          actor,
          failedLimit: Number(args.failedLimit || 20),
        });
        break;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
  } catch (error) {
    exitCode = 1;
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`
    );
  } finally {
    await closePostgresPool().catch(() => {});
    process.exit(exitCode);
  }
}

run();
