import {
  buildStreamingPromptAndInput,
  resolveStreamingChatSearchContext,
} from "../chat/context/streamingChatContext.js";
import { runStreamingChatOrchestrator } from "../chat/orchestrator/streamingChatOrchestrator.js";
import { writeSseEvent } from "../chat/orchestrator/sseEvents.js";
import {
  buildTaskProposalSignature,
  extractAcceptedTaskProposalContext,
} from "../chat/taskSetupPolicy.js";

function isLikelyAutomationSetupTurn(question = "", recentMessages = []) {
  const conversation = [
    String(question || ""),
    ...(Array.isArray(recentMessages) ? recentMessages.map((entry) => String(entry?.text || "")) : []),
  ]
    .join(" ")
    .toLowerCase();
  if (!conversation.trim()) return false;

  const hasTaskNoun = /\b(task|automation)s?\b/.test(conversation);
  const hasScheduleCue =
    /\b(schedule|scheduled|run every|daily|weekly|hourly|every day|every morning|every afternoon|every evening|local time)\b/.test(
      conversation
    );
  const hasTaskSetupPhrase =
    /\b(create|set up|setup|make|start|add|save|update|change|revise|edit|confirm|approve|cancel)\s+(?:a|an|the|this|that|my)?\s*(task|automation)s?\b/.test(
      conversation
    ) ||
    /\b(task|automation)s?\s+(?:setup|set up|creation|create|update|change|revision|revise|edit|confirmation|approve|cancel)\b/.test(
      conversation
    );
  const hasAutomationVerb = /\bautomate\b/.test(conversation);
  const hasTaskProposalContext = /\b(task proposal|create it|revise details)\b/.test(conversation);

  return hasTaskProposalContext || hasTaskSetupPhrase || hasAutomationVerb || (hasTaskNoun && hasScheduleCue);
}

const BLOCKED_NON_TASK_MUTATIONS_DURING_SETUP = new Set([
  "create_note",
  "create_notes_bulk",
  "create_folder",
  "update_folder",
  "delete_folder",
  "update_note",
  "update_note_attachment",
  "update_note_markdown",
  "add_note_comment",
  "restore_note_version",
  "retry_note_enrichment",
  "set_folder_collaborator",
  "remove_folder_collaborator",
]);

const TASK_SETUP_LIFECYCLE_TOOLS = new Set([
  "propose_task",
  "create_task",
  "update_task",
  "list_tasks",
  "complete_task",
  "delete_task",
]);

function buildTaskCreationConfirmationText(result = {}, fallback = {}) {
  const task = result?.task && typeof result.task === "object" ? result.task : {};
  const title = String(task.title || task.name || fallback.title || fallback.name || "Automation").trim();
  const destination = String(task.scopeFolder || task.project || fallback.scopeFolder || fallback.project || "").trim();
  const nextRunAt = String(task.nextRunAt || fallback.nextRunAt || "").trim();
  const timezone = String(task.timezone || fallback.timezone || "").trim();
  const intervalMinutes = Number(task.intervalMinutes ?? fallback.intervalMinutes ?? 0);
  const state = String(task.state || task.status || "").trim().toLowerCase();
  const approvalRequired = result?.approvalRequired === true || state === "pending_approval";

  const lines = [`Created automation "${title}".`];
  if (destination) lines.push(`Destination: ${destination}.`);
  if (intervalMinutes === 1440 && nextRunAt) {
    lines.push(`Next run: ${nextRunAt}${timezone ? ` (${timezone})` : ""}.`);
  }
  if (approvalRequired) {
    lines.push("It now needs approval before automatic runs.");
  } else if (state === "active") {
    lines.push("It is active.");
  } else {
    lines.push("It is saved.");
  }
  return lines.join(" ");
}

export async function handleChatRoutes(req, res, url, context) {
  const {
    actor,
    sendJson,
    readJsonBody,
    parseWorkingSetIds,
    normalizeRecentChatMessages,
    extractDomainsFromText,
    extractDomainFromUrl,
    normalizeIanaTimezone,
    inferUserTimezoneFromMessages,
    inferTaskNextRunAtFromMessages,
    isExplicitTaskCreationConfirmation,
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
    config,
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
    const configuredTimezone = String(config?.openaiWebSearchUserTimezone || "").trim();
    const requestTimezone = typeof normalizeIanaTimezone === "function"
      ? normalizeIanaTimezone(body.userTimezone)
      : "";
    const inferredTimezoneFromConversation = typeof inferUserTimezoneFromMessages === "function"
      ? String(
        inferUserTimezoneFromMessages({
          question: body.question,
          recentMessages,
          configuredTimezone: "",
        }) || ""
      ).trim()
      : "";
    const userTimezoneHint = requestTimezone || inferredTimezoneFromConversation || configuredTimezone;
    const taskTimezoneHint = requestTimezone || inferredTimezoneFromConversation;
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
          userTimezoneHint,
          taskContext: body.taskContext && typeof body.taskContext === "object" ? body.taskContext : null,
        });
        const userConfirmedTaskCreate = typeof isExplicitTaskCreationConfirmation === "function"
          ? isExplicitTaskCreationConfirmation(question)
          : false;
        const acceptedTaskProposal = extractAcceptedTaskProposalContext(body);
        if (userConfirmedTaskCreate && acceptedTaskProposal?.proposal) {
          const acceptedCreateArgs = {
            ...acceptedTaskProposal.proposal,
            confirmed: true,
          };
          const scheduleType = String(acceptedCreateArgs.scheduleType || "").trim().toLowerCase();
          const intervalMinutes = Number(acceptedCreateArgs.intervalMinutes || 0);
          if (!String(acceptedCreateArgs.timezone || "").trim() && taskTimezoneHint) {
            if (scheduleType === "interval" || intervalMinutes > 0) {
              acceptedCreateArgs.timezone = taskTimezoneHint;
            }
          }
          if (
            typeof inferTaskNextRunAtFromMessages === "function"
            && !String(acceptedCreateArgs.nextRunAt || "").trim()
          ) {
            const inferredNextRunAt = inferTaskNextRunAtFromMessages({
              question,
              recentMessages,
              timezone: String(acceptedCreateArgs.timezone || taskTimezoneHint || "").trim(),
              intervalMinutes,
              scheduleType,
            });
            if (inferredNextRunAt) {
              acceptedCreateArgs.nextRunAt = inferredNextRunAt;
            }
          }

          try {
            writeSseEvent(res, "tool_call", { name: "create_task", status: "running", noteId: "" });
            const createResult = await executeChatToolCall("create_task", acceptedCreateArgs, actor, {
              chatAttachment: null,
            });
            writeSseEvent(res, "tool_result", {
              name: "create_task",
              result: createResult,
              error: null,
              noteId: "",
            });
            writeSseEvent(res, "token", {
              token: buildTaskCreationConfirmationText(createResult, acceptedCreateArgs),
            });
            writeSseEvent(res, "done", { done: true });
            res.end();
            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error("chat_confirmed_task_create_failed", {
              error: message,
              scope,
            });
            writeSseEvent(res, "tool_result", {
              name: "create_task",
              result: null,
              error: message,
              noteId: "",
            });
            writeSseEvent(res, "debug_error", {
              code: "chat_confirmed_task_create_failed",
              message,
              scope,
              at: new Date().toISOString(),
            });
            writeSseEvent(res, "token", {
              token: "I couldn't create that automation from the approved draft. Please revise and confirm again.",
            });
            writeSseEvent(res, "done", { done: true });
            res.end();
            return true;
          }
        }
        const taskSetupState = {
          active:
            Boolean(acceptedTaskProposal)
            || isLikelyAutomationSetupTurn(question, recentMessages),
          sawTaskToolInTurn: false,
          sawTaskProposalInTurn: false,
          acceptedProposal: acceptedTaskProposal?.proposal || null,
          acceptedProposalSignature: String(acceptedTaskProposal?.proposalSignature || "").trim(),
        };
        const harness = createAgentToolHarness({
          actor,
          requestId: String(req.headers["x-request-id"] || "").trim(),
          resolveArgs: (name, args) => {
            const resolvedArgs = resolveAgentToolArgs(name, args, {
              contextNoteId,
              contextProject: String(body.project || "").trim(),
              citationAliasMap,
              noteNameAliasMap,
            });
            const toolName = String(name || "").trim().toLowerCase();
            if (TASK_SETUP_LIFECYCLE_TOOLS.has(toolName)) {
              taskSetupState.active = true;
              taskSetupState.sawTaskToolInTurn = true;
            }
            if (toolName === "create_task" || toolName === "propose_task") {
              const scheduleType = String(resolvedArgs?.scheduleType || "").trim().toLowerCase();
              const intervalMinutes = Number(resolvedArgs?.intervalMinutes || 0);
              if (!String(resolvedArgs?.timezone || "").trim() && taskTimezoneHint) {
                if (scheduleType === "interval" || intervalMinutes > 0) {
                  resolvedArgs.timezone = taskTimezoneHint;
                }
              }
              if (
                typeof inferTaskNextRunAtFromMessages === "function"
                && !String(resolvedArgs?.nextRunAt || "").trim()
              ) {
                const inferredNextRunAt = inferTaskNextRunAtFromMessages({
                  question,
                  recentMessages,
                  timezone: String(resolvedArgs?.timezone || taskTimezoneHint || "").trim(),
                  intervalMinutes,
                  scheduleType,
                });
                if (inferredNextRunAt) {
                  resolvedArgs.nextRunAt = inferredNextRunAt;
                }
              }
              if (toolName === "create_task") {
                resolvedArgs.confirmed = userConfirmedTaskCreate === true;
              }
            } else if (toolName === "update_task") {
              const scheduleType = String(resolvedArgs?.scheduleType || "").trim().toLowerCase();
              const intervalMinutes = Number(resolvedArgs?.intervalMinutes || 0);
              if (!String(resolvedArgs?.timezone || "").trim() && taskTimezoneHint) {
                if (scheduleType === "interval" || intervalMinutes > 0) {
                  resolvedArgs.timezone = taskTimezoneHint;
                }
              }
            }
            return resolvedArgs;
          },
          executeTool: (name, args, toolActor) => {
            const normalizedName = String(name || "").trim().toLowerCase();
            if (TASK_SETUP_LIFECYCLE_TOOLS.has(normalizedName)) {
              taskSetupState.active = true;
              taskSetupState.sawTaskToolInTurn = true;
            }
            if (normalizedName === "propose_task") {
              taskSetupState.sawTaskProposalInTurn = true;
            }
            if (normalizedName === "create_task") {
              if (args?.confirmed !== true) {
                throw new Error(
                  "Task creation requires explicit user confirmation first. Call propose_task with the full plan, wait for user response, and only call create_task after an explicit 'Create it' style confirmation."
                );
              }
              if (!taskSetupState.acceptedProposal || !taskSetupState.acceptedProposalSignature) {
                throw new Error(
                  "Task creation requires accepting a proposal first. Propose the task, wait for explicit user approval, then create it."
                );
              }
              const currentDraftSignature = buildTaskProposalSignature(args);
              if (!currentDraftSignature || currentDraftSignature !== taskSetupState.acceptedProposalSignature) {
                throw new Error(
                  "Task details changed after approval. Re-propose the updated task and get explicit confirmation before creating."
                );
              }
            }
            if (
              BLOCKED_NON_TASK_MUTATIONS_DURING_SETUP.has(normalizedName)
              && (
                taskSetupState.active
                || taskSetupState.sawTaskToolInTurn
                || taskSetupState.sawTaskProposalInTurn
              )
            ) {
              throw new Error(
                "Task setup can only save task configuration. Do not perform workspace mutations before the task runs."
              );
            }
            const sanitizedArgs = { ...(args || {}) };
            if (normalizedName !== "create_task") {
              delete sanitizedArgs.confirmed;
            }
            if (normalizedName !== "search_notes") {
              return executeChatToolCall(name, sanitizedArgs, toolActor, { chatAttachment: hasAttachment ? chatAttachment : null });
            }
            const scopedArgs = {
              ...sanitizedArgs,
              scope: String(sanitizedArgs?.scope || scope || "all"),
              project: String(sanitizedArgs?.project || body.project || ""),
              workingSetIds:
                Array.isArray(sanitizedArgs?.workingSetIds) && sanitizedArgs.workingSetIds.length > 0
                  ? sanitizedArgs.workingSetIds
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
