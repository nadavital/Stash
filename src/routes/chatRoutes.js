import {
  buildStreamingPromptAndInput,
  resolveStreamingChatSearchContext,
} from "../chat/context/streamingChatContext.js";
import { runStreamingChatOrchestrator } from "../chat/orchestrator/streamingChatOrchestrator.js";
import { writeSseEvent } from "../chat/orchestrator/sseEvents.js";

export async function handleChatRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    readJsonBody,
    parseWorkingSetIds,
    normalizeRecentChatMessages,
    extractDomainsFromText,
    extractDomainFromUrl,
    noteRepo,
    buildChatWebSearchTool,
    CHAT_TOOLS,
    createCitationNoteAliasMap,
    createCitationNoteNameAliasMap,
    createStreamingResponse,
    extractOutputUrlCitations,
    CHAT_SYSTEM_PROMPT,
    createAgentToolHarness,
    resolveAgentToolArgs,
    executeChatToolCall,
    logger,
    buildAgentNoteTitle,
    createMemory,
    askMemories,
    buildProjectContext,
  } = context;

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const body = await readJsonBody(req);
    const wantsStream = (req.headers.accept || "").includes("text/event-stream");
    const scope = String(body.scope || "all");
    const workingSetIds = parseWorkingSetIds(body.workingSetIds);
    const recentMessages = normalizeRecentChatMessages(body.recentMessages, 100);
    const chatAttachment = {
      imageDataUrl: String(body.imageDataUrl || "").trim() || null,
      fileDataUrl: String(body.fileDataUrl || "").trim() || null,
      fileName: String(body.fileName || "").trim(),
      fileMimeType: String(body.fileMimeType || "").trim(),
    };
    const hasAttachment = Boolean(chatAttachment.imageDataUrl || chatAttachment.fileDataUrl);

    if (wantsStream) {
      // Streaming agent path: search for context, then stream with tools
      const question = String(body.question || "").trim() || (hasAttachment ? "Save this attachment to Stash." : "");
      if (!question) {
        sendJson(res, 400, { error: "Missing question" });
        return true;
      }
      const {
        contextNoteId,
        contextNote,
        contextNoteSourceUrl,
        citations,
        webSearchDomains,
      } = await resolveStreamingChatSearchContext({
        body,
        actor,
        question,
        scope,
        workingSetIds,
        noteRepo,
        extractDomainsFromText,
        extractDomainFromUrl,
      });
      const webSearchTool = buildChatWebSearchTool(webSearchDomains);
      const responseTools = webSearchTool ? [...CHAT_TOOLS, webSearchTool] : CHAT_TOOLS;
      const responseInclude = webSearchTool ? ["web_search_call.action.sources"] : undefined;
      const citationAliasMap = createCitationNoteAliasMap(citations);
      const noteNameAliasMap = createCitationNoteNameAliasMap(citations);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      writeSseEvent(res, "citations", { citations });

      try {
        const { systemPrompt, initialInput } = buildStreamingPromptAndInput({
          question,
          recentMessages,
          citations,
          scope,
          workingSetIds,
          project: String(body.project || ""),
          contextNoteId,
          contextNote,
          contextNoteSourceUrl,
          hasAttachment,
          CHAT_SYSTEM_PROMPT,
        });
        const harness = createAgentToolHarness({
          actor,
          requestId: String(req.headers["x-request-id"] || "").trim(),
          resolveArgs: (name, args) => resolveAgentToolArgs(name, args, {
            contextNoteId,
            contextProject: String(body.project || "").trim(),
            citationAliasMap,
            noteNameAliasMap,
          }),
          executeTool: (name, args, toolActor) => {
            if (name !== "search_notes") {
              return executeChatToolCall(name, args, toolActor, { chatAttachment: hasAttachment ? chatAttachment : null });
            }
            const scopedArgs = {
              ...args,
              scope: String(args?.scope || scope || "all"),
              project: String(args?.project || body.project || ""),
              workingSetIds:
                Array.isArray(args?.workingSetIds) && args.workingSetIds.length > 0
                  ? args.workingSetIds
                  : workingSetIds,
            };
            return executeChatToolCall(name, scopedArgs, toolActor, { chatAttachment: hasAttachment ? chatAttachment : null });
          },
        });

        await runStreamingChatOrchestrator({
          res,
          createStreamingResponse,
          extractOutputUrlCitations,
          responseTools,
          responseInclude,
          harness,
          initialInput,
          initialInstructions: systemPrompt,
          maxToolRounds: 3,
          temperature: 0.2,
        });
        res.end();
      } catch (error) {
        const streamErrorMessage = error instanceof Error ? error.message : String(error);
        logger.error("chat_stream_failed", {
          error: streamErrorMessage,
          scope,
          hasAttachment,
        });
        writeSseEvent(res, "debug_error", {
          code: "chat_stream_failed",
          message: streamErrorMessage,
          scope,
          hasAttachment,
          at: new Date().toISOString(),
        });
        const fallbackText = "I hit a temporary issue while completing that. Please retry your last message.";
        writeSseEvent(res, "token", { token: fallbackText });
        writeSseEvent(res, "done", { done: true });
        res.end();
      }
      return true;
    }

    if (hasAttachment && String(body.captureIntent || "").trim().toLowerCase() === "save") {
      const note = await createMemory({
        content: String(body.question || "").trim(),
        sourceType: chatAttachment.fileMimeType.startsWith("image/") ? "image" : "file",
        sourceUrl: "",
        imageDataUrl: chatAttachment.imageDataUrl,
        fileDataUrl: chatAttachment.fileDataUrl,
        fileName: chatAttachment.fileName,
        fileMimeType: chatAttachment.fileMimeType,
        project: String(body.project || ""),
        metadata: { createdFrom: "chat-agent-fallback", actorUserId: actor.userId },
        actor,
      });
      sendJson(res, 200, {
        answer: `Saved "${note.fileName || note.summary || "attachment"}".`,
        citations: [{ rank: 1, score: 1, note }],
        mode: "direct-save",
      });
      return true;
    }

    const result = await askMemories({
      question: body.question,
      project: body.project,
      limit: Number(body.limit || 6),
      contextNoteId: body.contextNoteId || "",
      actor,
      scope,
      workingSetIds,
    });
    sendJson(res, 200, result);
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/context") {
    const body = await readJsonBody(req);
    const scope = String(body.scope || "all");
    const workingSetIds = parseWorkingSetIds(body.workingSetIds);
    const result = await buildProjectContext({
      task: body.task,
      project: body.project,
      limit: Number(body.limit || 8),
      actor,
      scope,
      workingSetIds,
      contextNoteId: body.contextNoteId || "",
    });
    sendJson(res, 200, result);
    return true;
  }

  return false;
}
