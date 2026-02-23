function toBoundedLimit(value, min = 1, max = 20, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function createMemoryChatOps({
  searchMemories,
  resolveActor,
  noteRepo,
  buildFolderAccessContext,
  canReadNote,
  materializeCitation,
  listSearchCandidatesForActor,
  pseudoEmbedding,
  cosineSimilarity,
  extractDomainFromUrl,
  extractDomainsFromText,
  hasOpenAI,
  config,
  buildWebSearchTool,
  createResponse,
  extractOutputUrlCitations,
  heuristicSummary,
  noteDisplayTitle,
}) {
  function buildCitationBlock(citations) {
    return citations
      .map((entry, idx) => {
        const label = `N${idx + 1}`;
        const note = entry.note;
        return [
          `[${label}] title: ${noteDisplayTitle(note, 140)}`,
          `summary: ${note.summary || ""}`,
          `project: ${note.project || ""}`,
          `source_url: ${note.sourceUrl || ""}`,
          `content: ${note.content || ""}`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
  }

  async function findRelatedMemories({
    id,
    limit = 5,
    actor = null,
    scope = "all",
    workingSetIds = [],
  } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) throw new Error("Missing id");

    const boundedLimit = toBoundedLimit(limit, 1, 20, 5);
    const sourceNote = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!sourceNote) throw new Error(`Memory not found: ${normalizedId}`);

    const accessContext = await buildFolderAccessContext(actorContext);
    if (!canReadNote(sourceNote, actorContext, accessContext)) {
      throw new Error("Forbidden: you do not have permission to access this item");
    }

    const candidates = await listSearchCandidatesForActor({
      actorContext,
      project: "",
      maxCandidates: 500,
      scope,
      workingSetIds,
      contextNoteId: normalizedId,
    });
    if (candidates.length <= 1) return [];

    const sourceEmbedding = Array.isArray(sourceNote.embedding)
      ? sourceNote.embedding
      : pseudoEmbedding(`${sourceNote.content}\n${sourceNote.summary}`);

    const scored = candidates
      .filter((note) => note.id !== normalizedId)
      .map((note) => {
        const noteEmbedding = Array.isArray(note.embedding)
          ? note.embedding
          : pseudoEmbedding(`${note.content}\n${note.summary}`);
        const score = cosineSimilarity(sourceEmbedding, noteEmbedding);
        return { note, score };
      })
      .filter((entry) => entry.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, boundedLimit);

    return scored.map((entry, index) => materializeCitation(entry.note, entry.score, index + 1));
  }

  async function askMemories({
    question,
    project = "",
    limit = 6,
    contextNoteId = "",
    actor = null,
    scope = "all",
    workingSetIds = [],
  }) {
    const normalizedQuestion = String(question || "").trim();
    if (!normalizedQuestion) {
      throw new Error("Missing question");
    }

    const questionDomains = extractDomainsFromText(normalizedQuestion, 8);
    let contextNoteSourceUrl = "";

    let citations = await searchMemories({
      query: normalizedQuestion,
      project,
      limit,
      actor,
      scope,
      workingSetIds,
      contextNoteId,
    });

    const normalizedContextId = String(contextNoteId || "").trim();
    if (normalizedContextId) {
      const actorContext = resolveActor(actor);
      try {
        const contextNote = await noteRepo.getNoteById(normalizedContextId, actorContext.workspaceId);
        const accessContext = await buildFolderAccessContext(actorContext);
        if (contextNote && canReadNote(contextNote, actorContext, accessContext)) {
          contextNoteSourceUrl = String(contextNote.sourceUrl || "").trim();
          const contextCitation = materializeCitation(contextNote, 1.0, 0);
          citations = citations.filter((c) => c.note?.id !== normalizedContextId);
          citations = [contextCitation, ...citations].slice(0, limit);
          citations = citations.map((c, i) => ({ ...c, rank: i + 1 }));
        }
      } catch {
        // Context note fetch failed, proceed with normal citations.
      }
    }

    const domainHints = [...new Set([extractDomainFromUrl(contextNoteSourceUrl), ...questionDomains].filter(Boolean))]
      .slice(0, 100);
    const webSearchEnabled = hasOpenAI() && config.openaiWebSearchEnabled;
    const webSearchTool = webSearchEnabled
      ? buildWebSearchTool({
          allowedDomains: domainHints,
          type: config.openaiWebSearchToolType,
          searchContextSize: config.openaiWebSearchContextSize,
          externalWebAccess: config.openaiWebSearchExternalAccess,
          userLocation: {
            country: config.openaiWebSearchUserCountry,
            city: config.openaiWebSearchUserCity,
            region: config.openaiWebSearchUserRegion,
            timezone: config.openaiWebSearchUserTimezone,
          },
        })
      : null;

    if (citations.length === 0 && !webSearchTool) {
      return {
        answer: "No relevant memory found yet. Save a few notes first.",
        citations: [],
        mode: "empty",
      };
    }

    if (!hasOpenAI()) {
      const answer = [
        "Based on your saved notes:",
        ...citations.slice(0, 4).map((entry) => `- ${entry.note.summary || heuristicSummary(entry.note.content, 120)}`),
      ].join("\n");
      return {
        answer,
        citations,
        mode: "heuristic",
      };
    }

    try {
      const context = buildCitationBlock(citations);
      let askInstructions = citations.length > 0
        ? "Answer using the provided memory snippets as the primary source of truth. If needed for up-to-date details, use web search and include source links. Be concise."
        : "No saved memory snippets are available for this query. Use web search to answer accurately and include source links. Be concise.";
      askInstructions += " Do not use citation codes like [N1] in the final answer; refer to items naturally by title or folder.";
      if (project) {
        askInstructions = `The user is working in project "${project}". Consider this context when answering.\n\n${askInstructions}`;
      }
      const inputText = citations.length > 0
        ? `Question: ${normalizedQuestion}\n\nMemory snippets:\n${context}`
        : `Question: ${normalizedQuestion}`;
      const { text, raw } = await createResponse({
        instructions: askInstructions,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: inputText,
              },
            ],
          },
        ],
        tools: webSearchTool ? [webSearchTool] : undefined,
        include: webSearchTool ? ["web_search_call.action.sources"] : undefined,
        temperature: 0.2,
      });
      const webSources = extractOutputUrlCitations(raw, 16);

      return {
        answer: text || "I could not generate an answer.",
        citations,
        webSources,
        mode: "openai",
      };
    } catch {
      const answer = citations.length > 0
        ? [
            "I could not call the model, but these notes look relevant:",
            ...citations.slice(0, 4).map((entry) => `- ${entry.note.summary || heuristicSummary(entry.note.content, 120)}`),
          ].join("\n")
        : "I could not call the model. Try again in a moment.";
      return {
        answer,
        citations,
        mode: "fallback",
      };
    }
  }

  async function buildProjectContext({
    task,
    project = "",
    limit = 8,
    actor = null,
    scope = "all",
    workingSetIds = [],
    contextNoteId = "",
  }) {
    const normalizedTask = String(task || "").trim();
    const citations = await searchMemories({
      query: normalizedTask || project || "recent",
      project,
      limit,
      actor,
      scope,
      workingSetIds,
      contextNoteId,
    });
    if (citations.length === 0) {
      return {
        context: "No project context found yet.",
        citations: [],
        mode: "empty",
      };
    }

    if (!hasOpenAI()) {
      return {
        context: citations
          .map((entry, idx) => `[N${idx + 1}] ${entry.note.summary || heuristicSummary(entry.note.content, 120)}`)
          .join("\n"),
        citations,
        mode: "heuristic",
      };
    }

    try {
      const contextBlock = buildCitationBlock(citations);
      const { text } = await createResponse({
        instructions:
          "Build a short project context brief (decisions, open questions, next actions) from the notes. Cite snippets as [N1], [N2], etc.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Task: ${normalizedTask || "Build project context"}\n\nSnippets:\n${contextBlock}`,
              },
            ],
          },
        ],
        temperature: 0.2,
      });

      return {
        context: text || "No context generated.",
        citations,
        mode: "openai",
      };
    } catch {
      return {
        context: citations
          .map((entry, idx) => `[N${idx + 1}] ${entry.note.summary || heuristicSummary(entry.note.content, 120)}`)
          .join("\n"),
        citations,
        mode: "fallback",
      };
    }
  }

  return {
    buildCitationBlock,
    findRelatedMemories,
    askMemories,
    buildProjectContext,
  };
}
