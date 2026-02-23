export async function handleChatRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    readJsonBody,
    parseWorkingSetIds,
    normalizeRecentChatMessages,
    isLikelyExternalInfoRequest,
    extractDomainsFromText,
    extractDomainFromUrl,
    searchMemories,
    noteRepo,
    buildChatWebSearchTool,
    CHAT_TOOLS,
    createCitationNoteAliasMap,
    createCitationNoteNameAliasMap,
    createStreamingResponse,
    extractOutputUrlCitations,
    buildCitationBlock,
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
      const recentConversationText = recentMessages
        .map((entry) => `${entry.role}: ${entry.text}`)
        .join("\n");
      const likelyExternalIntent = isLikelyExternalInfoRequest(`${question}\n${recentConversationText}`);
      const contextNoteId = String(body.contextNoteId || "").trim();
      let contextNoteSourceUrl = "";

      // Pre-search for context
      let citations = await searchMemories({
        query: question,
        project: body.project || "",
        limit: Number(body.limit || 6),
        actor,
        scope,
        workingSetIds,
        contextNoteId,
      });

      if (contextNoteId) {
        try {
          const contextNote = await noteRepo.getNoteById(contextNoteId, actor.workspaceId);
          if (contextNote) {
            contextNoteSourceUrl = String(contextNote.sourceUrl || "").trim();
            citations = citations.filter((c) => String(c.note?.id || "") !== contextNoteId);
            citations.unshift({ rank: 0, score: 1.0, note: contextNote });
          }
        } catch {
          // best-effort
        }
      }
      const questionDomains = extractDomainsFromText(question, 8);
      const contextDomain = extractDomainFromUrl(contextNoteSourceUrl);
      // Only hard-restrict web search when the user targets a specific URL/item.
      // Folder/project citations should not silently narrow global web search.
      const webSearchDomains = [...new Set([contextDomain, ...questionDomains].filter(Boolean))].slice(0, 100);
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

      res.write(`event: citations\ndata: ${JSON.stringify({ citations })}\n\n`);

      try {
        const context = citations.length ? buildCitationBlock(citations) : "";
        let systemPrompt = CHAT_SYSTEM_PROMPT;
        const scopeHints = [];
        if (scope !== "all") {
          scopeHints.push(`Active memory scope is "${scope}".`);
        }
        if (body.project) {
          scopeHints.push(`Project context is "${body.project}".`);
          systemPrompt = `The user is working in folder "${body.project}". Consider this context.\n\n${systemPrompt}`;
        }
        if (workingSetIds.length > 0) {
          scopeHints.push("Prioritize the current working-set items when searching and reasoning.");
        }
        if (scopeHints.length > 0) {
          systemPrompt = `${scopeHints.join(" ")}\n\n${systemPrompt}`;
        }
        if (likelyExternalIntent) {
          systemPrompt = `The user is working on an external real-world request. Continue the active thread from recent conversation context. Prefer web search and do not switch to summarizing saved notes unless the user explicitly asks for their saved notes.\n\n${systemPrompt}`;
        }
        systemPrompt = `Citation labels like [N1], [N2], etc are snippet references only and not note IDs. Never pass N1/N2 as tool ids. Do not include citation labels in user-facing prose; refer to items by title/folder name. ${
          contextNoteId ? `If the user says "this note", use id "${contextNoteId}". ` : ""
        }\n\n${systemPrompt}`;
        if (hasAttachment) {
          systemPrompt = `A file/image attachment is included with this request. When the user asks to save a new item, call create_note. When the user asks to replace an existing note's attachment, call update_note_attachment. Attachment payload is supplied server-side and should not be reconstructed.\n\n${systemPrompt}`;
        }
        if (contextNoteSourceUrl) {
          systemPrompt = `When discussing this item, ground factual claims to the source URL when possible: ${contextNoteSourceUrl}\n\n${systemPrompt}`;
        }

        const groundingLine = contextNoteSourceUrl
          ? `Primary source URL for this item: ${contextNoteSourceUrl}\n`
          : "";
        const includeMemoryContext = !likelyExternalIntent && Boolean(context);
        const questionText = includeMemoryContext
          ? `${question}\n\n${groundingLine}Context from saved notes:\n${context}`.trim()
          : `${question}\n${groundingLine}`.trim();

        const historyInput = recentMessages.map((entry) => ({
          role: entry.role === "assistant" ? "assistant" : "user",
          content: [{ type: "input_text", text: String(entry.text || "") }],
        }));

        // Keep full session chat history in structured role form, then append this turn.
        let currentInput = [
          ...historyInput,
          { role: "user", content: [{ type: "input_text", text: questionText }] },
        ];
        let currentInstructions = systemPrompt;
        let currentPreviousId = undefined;
        let toolRounds = 0;
        const MAX_TOOL_ROUNDS = 3;
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

        while (toolRounds <= MAX_TOOL_ROUNDS) {
          let roundWebSources = [];
          const streamResponse = await createStreamingResponse({
            instructions: currentInstructions,
            input: currentInput,
            tools: responseTools,
            include: responseInclude,
            previousResponseId: currentPreviousId,
            temperature: 0.2,
          });

          // Parse OpenAI Responses API streaming events
          const reader = streamResponse.body;
          let buffer = "";
          let responseId = "";
          const pendingToolCalls = [];
          let currentToolCall = null;

          for await (const chunk of reader) {
            buffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "response.created") {
                  responseId = parsed.response?.id || "";
                } else if (parsed.type === "response.output_text.delta" && parsed.delta) {
                  res.write(`event: token\ndata: ${JSON.stringify({ token: parsed.delta })}\n\n`);
                } else if (parsed.type === "response.completed" && parsed.response) {
                  const webSources = extractOutputUrlCitations(parsed.response, 16);
                  if (webSources.length > 0) {
                    roundWebSources = webSources;
                  }
                } else if (parsed.type === "response.output_item.added" && parsed.item?.type === "function_call") {
                  currentToolCall = { callId: parsed.item.call_id, name: parsed.item.name, args: "" };
                } else if (parsed.type === "response.function_call_arguments.delta") {
                  if (currentToolCall) currentToolCall.args += parsed.delta || "";
                } else if (parsed.type === "response.output_item.done" && parsed.item?.type === "function_call") {
                  if (currentToolCall) {
                    currentToolCall.args = parsed.item.arguments || currentToolCall.args;
                    pendingToolCalls.push(currentToolCall);
                    currentToolCall = null;
                  }
                }
              } catch {
                // skip non-JSON lines
              }
            }
          }

          if (roundWebSources.length > 0) {
            res.write(`event: web_sources\ndata: ${JSON.stringify({ webSources: roundWebSources })}\n\n`);
          }

          // No tool calls — we're done
          if (pendingToolCalls.length === 0) break;

          // Execute tool calls and collect outputs for continuation
          const toolOutputs = [];
          for (const tc of pendingToolCalls) {
            let toolNoteId = "";
            try {
              const parsedArgs = JSON.parse(String(tc.args || "{}"));
              toolNoteId = String(parsedArgs?.id || "").trim();
            } catch {
              toolNoteId = "";
            }
            res.write(`event: tool_call\ndata: ${JSON.stringify({
              name: tc.name,
              status: "executing",
              ...(toolNoteId ? { noteId: toolNoteId } : {}),
            })}\n\n`);
            const execution = await harness.runToolCall({
              name: tc.name,
              rawArgs: tc.args,
              callId: tc.callId,
              round: toolRounds,
            });
            res.write(`event: tool_result\ndata: ${JSON.stringify({
              name: tc.name,
              ...(toolNoteId ? { noteId: toolNoteId } : {}),
              ...(execution.ok
                ? { result: execution.result }
                : { error: execution.error || "Tool call failed" }),
              traceId: execution.trace?.traceId || "",
              cacheHit: Boolean(execution.trace?.cacheHit),
              durationMs: Number(execution.trace?.durationMs || 0),
            })}\n\n`);
            res.write(`event: tool_trace\ndata: ${JSON.stringify(execution.trace || null)}\n\n`);

            toolOutputs.push({
              type: "function_call_output",
              call_id: tc.callId,
              output: JSON.stringify(execution.ok ? execution.result : { error: execution.error || "Tool call failed" }),
            });
          }

          // Continue conversation with tool outputs
          currentPreviousId = responseId;
          currentInput = toolOutputs;
          currentInstructions = undefined;
          toolRounds++;
        }

        res.write(`event: tool_trace\ndata: ${JSON.stringify({
          requestId: harness.requestId,
          traces: harness.traces,
        })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (error) {
        logger.error("chat_stream_failed", {
          error: error instanceof Error ? error.message : String(error),
          likelyExternalIntent,
          scope,
          hasAttachment,
        });
        // Fallback: avoid off-topic memory summaries for external/live requests.
        let fallbackText = "";
        if (likelyExternalIntent) {
          fallbackText = "I hit a temporary issue while fetching live results. Please try again in a moment.";
        } else {
          const answer = citations
            .slice(0, 4)
            .map((entry) => `- ${buildAgentNoteTitle(entry.note, "Saved item")}`)
            .join("\n");
          fallbackText = answer
            ? `Based on your saved notes:\n${answer}`
            : "Something went wrong. Please try again.";
        }
        res.write(`event: token\ndata: ${JSON.stringify({ token: fallbackText })}\n\n`);
        res.write(`event: done\ndata: ${JSON.stringify({ done: true })}\n\n`);
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
