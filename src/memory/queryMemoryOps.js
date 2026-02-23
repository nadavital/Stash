export function createMemoryQueryOps({
  resolveActor,
  listVisibleNotesForActor,
  clampInt,
  noteRepo,
  assertCanReadNote,
  listSearchCandidatesForActor,
  tokenize,
  buildBm25Index,
  bm25ScoreFromIndex,
  lexicalScore,
  normalizeScores,
  makeExcerpt,
  getConsolidatedMemoryFilePath,
  makeConsolidatedTemplate,
  fs,
  isWorkspaceManager,
  collaborationRepo,
  folderRepo,
  normalizeFolderMemberRole,
  roleAtLeast,
  materializeCitation,
  normalizeMemoryScope,
  normalizeWorkingSetIds,
  createEmbedding,
  embeddingCache,
  pseudoEmbedding,
  cosineSimilarity,
}) {
  function serializeNotesAsMarkdown(notes = []) {
    return (Array.isArray(notes) ? notes : [])
      .map((note) => {
        const title = note.summary || note.content?.slice(0, 80) || "(untitled)";
        const tags = (note.tags || []).map((tag) => `\`${tag}\``).join(" ");
        const body = note.markdownContent || note.rawContent || note.content || "";
        return `## ${title}\n\n${tags ? `Tags: ${tags}\n\n` : ""}${body}\n\n---\n`;
      })
      .join("\n");
  }

  async function listRecentMemories(limit = 20, offset = 0, actor = null, options = {}) {
    const actorContext = resolveActor(actor);
    return listVisibleNotesForActor({
      actorContext,
      limit: clampInt(limit, 1, 200, 20),
      offset: clampInt(offset, 0, 100000, 0),
      scope: options.scope || "all",
      workingSetIds: options.workingSetIds || [],
      contextNoteId: options.contextNoteId || "",
      project: options.project || "",
    });
  }

  async function getMemoryRawContent({
    id,
    includeMarkdown = true,
    maxChars = 12000,
    actor = null,
  } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      throw new Error("Missing id");
    }

    const note = await noteRepo.getNoteById(normalizedId, actorContext.workspaceId);
    if (!note) {
      throw new Error(`Memory not found: ${normalizedId}`);
    }
    await assertCanReadNote(note, actorContext);

    const boundedMax = clampInt(maxChars, 200, 200000, 12000);
    const normalizedSourceType = String(note.sourceType || "").trim().toLowerCase();
    const topLevelContent = String(note.content || "");
    const extractedRawContent = String(note.rawContent || "");
    const extractedMarkdownContent = String(note.markdownContent || "");
    const allowContentFallbackForExtracted = !["file", "image"].includes(normalizedSourceType);
    const fallbackExtractedContent = allowContentFallbackForExtracted ? topLevelContent : "";
    const resolvedRawContent = extractedRawContent || fallbackExtractedContent;
    const resolvedMarkdownContent =
      extractedMarkdownContent || extractedRawContent || fallbackExtractedContent;

    return {
      id: note.id,
      revision: Number(note.revision || 0) || 0,
      sourceType: note.sourceType,
      fileName: note.fileName,
      fileMime: note.fileMime,
      project: note.project,
      createdAt: note.createdAt,
      title: String(note?.metadata?.title || "").trim(),
      summary: String(note.summary || ""),
      content: topLevelContent.slice(0, boundedMax),
      rawContent: resolvedRawContent.slice(0, boundedMax),
      markdownContent: includeMarkdown
        ? resolvedMarkdownContent.slice(0, boundedMax)
        : undefined,
    };
  }

  async function searchRawMemories({
    query = "",
    project = "",
    limit = 8,
    includeMarkdown = true,
    actor = null,
    scope = "all",
    workingSetIds = [],
    contextNoteId = "",
  } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      throw new Error("Missing query");
    }

    const boundedLimit = clampInt(limit, 1, 100, 8);
    const normalizedProject = String(project || "").trim();
    const candidates = await listSearchCandidatesForActor({
      actorContext,
      project: normalizedProject,
      maxCandidates: 500,
      scope,
      workingSetIds,
      contextNoteId,
    });
    const tokenizedQuery = tokenize(normalizedQuery);
    const bm25Index = buildBm25Index(
      candidates,
      (note) => `${note.rawContent || ""}\n${note.markdownContent || ""}\n${note.content || ""}`
    );
    const scored = candidates
      .map((note, docIndex) => {
        const searchableText = `${note.rawContent || ""}\n${note.markdownContent || ""}\n${note.content || ""}`;
        const bm25 = bm25ScoreFromIndex(bm25Index, docIndex, tokenizedQuery);
        const lexical = lexicalScore(
          {
            ...note,
            content: searchableText,
            rawContent: note.rawContent || "",
            markdownContent: note.markdownContent || "",
          },
          tokenizedQuery
        );
        const phraseBoost = searchableText
          .toLowerCase()
          .includes(normalizedQuery.toLowerCase())
          ? 0.15
          : 0;
        const score = bm25 * 0.85 + lexical * 0.15 + phraseBoost;
        return { note, score, bm25, lexical };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, boundedLimit * 3);

    const normalized = normalizeScores(scored, (entry) => entry.score);
    return scored
      .map((entry) => ({ ...entry, score: normalized.get(entry) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, boundedLimit)
      .map((entry, index) => ({
        rank: index + 1,
        score: entry.score,
        note: {
          id: entry.note.id,
          project: entry.note.project,
          sourceType: entry.note.sourceType,
          fileName: entry.note.fileName,
          fileMime: entry.note.fileMime,
          createdAt: entry.note.createdAt,
          summary: entry.note.summary,
          excerpt: makeExcerpt(
            entry.note.rawContent || entry.note.markdownContent || entry.note.content || "",
            normalizedQuery
          ),
          rawContent: String(entry.note.rawContent || ""),
          markdownContent: includeMarkdown
            ? String(entry.note.markdownContent || "")
            : undefined,
        },
      }));
  }

  async function readExtractedMarkdownMemory({
    filePath = "",
    maxChars = 30000,
    actor = null,
  } = {}) {
    const actorContext = resolveActor(actor);
    if (!isWorkspaceManager(actorContext)) {
      const error = new Error("Forbidden: this operation requires workspace owner/admin privileges");
      error.status = 403;
      throw error;
    }
    const boundedMax = clampInt(maxChars, 200, 500000, 30000);
    const requestedPath = String(filePath || "").trim();
    const resolvedFilePath = requestedPath || getConsolidatedMemoryFilePath(actorContext.workspaceId);
    let content;
    try {
      content = await fs.readFile(resolvedFilePath, "utf8");
    } catch (error) {
      const isMissing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
      if (isMissing && !requestedPath) {
        content = makeConsolidatedTemplate();
        await fs.writeFile(resolvedFilePath, content, "utf8");
      } else if (isMissing) {
        throw new Error(`Consolidated markdown memory file not found: ${resolvedFilePath}`);
      } else {
        throw error;
      }
    }

    return {
      filePath: resolvedFilePath,
      bytes: Buffer.byteLength(content, "utf8"),
      content: content.slice(0, boundedMax),
      truncated: content.length > boundedMax,
    };
  }

  async function listProjects(actor = null) {
    const actorContext = resolveActor(actor);
    if (isWorkspaceManager(actorContext)) {
      return noteRepo.listProjects(actorContext.workspaceId);
    }
    const [ownedProjects, membershipRows, allFolders] = await Promise.all([
      noteRepo.listProjectsForUser(actorContext.workspaceId, actorContext.userId),
      collaborationRepo.listFolderMembershipsForUser({
        workspaceId: actorContext.workspaceId,
        userId: actorContext.userId,
      }),
      folderRepo.listAllFolders(actorContext.workspaceId),
    ]);
    const folderRoleById = new Map(
      membershipRows.map((entry) => [
        String(entry.folderId || "").trim(),
        normalizeFolderMemberRole(entry.role || "viewer"),
      ])
    );
    const sharedProjects = allFolders
      .filter((folder) =>
        roleAtLeast(folderRoleById.get(String(folder.id || "").trim()) || "", "viewer")
      )
      .map((folder) => String(folder.name || "").trim())
      .filter(Boolean);
    return [...new Set([...(ownedProjects || []), ...sharedProjects])].sort((a, b) =>
      a.localeCompare(b)
    );
  }

  async function searchNotesBm25({
    query = "",
    project = "",
    limit = 8,
    includeMarkdown = false,
    actor = null,
    scope = "all",
    workingSetIds = [],
    contextNoteId = "",
  } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedQuery = String(query || "").trim();
    if (!normalizedQuery) {
      throw new Error("Missing query");
    }

    const boundedLimit = clampInt(limit, 1, 100, 8);
    const normalizedProject = String(project || "").trim();
    const notes = await listSearchCandidatesForActor({
      actorContext,
      project: normalizedProject,
      maxCandidates: 500,
      scope,
      workingSetIds,
      contextNoteId,
    });
    if (notes.length === 0) return [];

    const queryTokens = tokenize(normalizedQuery);
    const bm25Index = buildBm25Index(
      notes,
      (note) =>
        `${note.content || ""}\n${note.rawContent || ""}\n${note.markdownContent || ""}\n${note.summary || ""}\n${(note.tags || []).join(" ")}\n${note.project || ""}\n${note.fileName || ""}`
    );

    const scored = notes
      .map((note, docIndex) => ({
        note,
        bm25: bm25ScoreFromIndex(bm25Index, docIndex, queryTokens),
      }))
      .filter((entry) => entry.bm25 > 0)
      .sort((a, b) => b.bm25 - a.bm25)
      .slice(0, boundedLimit);

    const normalizedScores = normalizeScores(scored, (entry) => entry.bm25);
    return scored.map((entry, index) => ({
      rank: index + 1,
      score: normalizedScores.get(entry) || 0,
      note: {
        id: entry.note.id,
        content: entry.note.content,
        sourceType: entry.note.sourceType,
        sourceUrl: entry.note.sourceUrl,
        fileName: entry.note.fileName,
        fileMime: entry.note.fileMime,
        summary: entry.note.summary,
        tags: entry.note.tags || [],
        project: entry.note.project,
        createdAt: entry.note.createdAt,
        excerpt: makeExcerpt(
          entry.note.rawContent || entry.note.markdownContent || entry.note.content || "",
          normalizedQuery
        ),
        rawContent: String(entry.note.rawContent || ""),
        markdownContent: includeMarkdown
          ? String(entry.note.markdownContent || "")
          : undefined,
      },
    }));
  }

  async function searchMemories({
    query = "",
    project = "",
    limit = 15,
    offset = 0,
    actor = null,
    scope = "all",
    workingSetIds = [],
    contextNoteId = "",
  } = {}) {
    const actorContext = resolveActor(actor);
    const boundedLimit = clampInt(limit, 1, 100, 15);
    const normalizedQuery = String(query || "").trim();
    const normalizedProject = String(project || "").trim();
    const normalizedScope = normalizeMemoryScope(scope);
    const normalizedWorkingSetIds = normalizeWorkingSetIds(workingSetIds, 100);
    const workingSetIdSet = new Set(normalizedWorkingSetIds);

    if (!normalizedQuery) {
      const notes = await listVisibleNotesForActor({
        actorContext,
        project: normalizedProject,
        limit: boundedLimit,
        offset: clampInt(offset, 0, 100000, 0),
        scope: normalizedScope,
        workingSetIds: normalizedWorkingSetIds,
        contextNoteId,
      });
      return notes.map((note, index) => materializeCitation(note, 1 - index * 0.001, index + 1));
    }

    const notes = await listSearchCandidatesForActor({
      actorContext,
      project: normalizedProject,
      maxCandidates: 500,
      scope: normalizedScope,
      workingSetIds: normalizedWorkingSetIds,
      contextNoteId,
    });
    if (notes.length === 0) return [];

    const queryTokens = tokenize(normalizedQuery);
    const bm25Index = buildBm25Index(
      notes,
      (note) =>
        `${note.content || ""}\n${note.rawContent || ""}\n${note.markdownContent || ""}\n${note.summary || ""}\n${(note.tags || []).join(" ")}\n${note.project || ""}\n${note.fileName || ""}`
    );
    let queryEmbedding = embeddingCache.get(normalizedQuery);
    if (!queryEmbedding) {
      try {
        queryEmbedding = await createEmbedding(normalizedQuery);
      } catch {
        queryEmbedding = pseudoEmbedding(normalizedQuery);
      }
      embeddingCache.set(normalizedQuery, queryEmbedding);
    }

    const ranked = notes.map((note, docIndex) => {
      const noteEmbedding = Array.isArray(note.embedding)
        ? note.embedding
        : pseudoEmbedding(`${note.content}\n${note.summary}`);
      const semantic = cosineSimilarity(queryEmbedding, noteEmbedding);
      const lexical = lexicalScore(note, queryTokens);
      const bm25 = bm25ScoreFromIndex(bm25Index, docIndex, queryTokens);
      const phraseBoost = `${note.content || ""}\n${note.rawContent || ""}\n${note.markdownContent || ""}`
        .toLowerCase()
        .includes(normalizedQuery.toLowerCase())
        ? 0.05
        : 0;
      const freshnessBoost = Math.max(
        0,
        1 - (Date.now() - new Date(note.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
      ) * 0.05;
      const workingSetBoost = workingSetIdSet.has(String(note.id || "").trim()) ? 0.08 : 0;
      return { note, semantic, lexical, bm25, phraseBoost, freshnessBoost, workingSetBoost };
    });

    const semanticNormalized = normalizeScores(ranked, (item) => item.semantic);
    const bm25Normalized = normalizeScores(ranked, (item) => item.bm25);

    const combined = ranked.map((item) => ({
      ...item,
      score:
        (semanticNormalized.get(item) || 0) * 0.3 +
        (bm25Normalized.get(item) || 0) * 0.5 +
        item.lexical * 0.15 +
        item.phraseBoost +
        item.freshnessBoost * 0.4 +
        item.workingSetBoost,
    }));

    combined.sort((a, b) => b.score - a.score);
    return combined
      .slice(0, boundedLimit)
      .map((item, index) => materializeCitation(item.note, item.score, index + 1));
  }

  async function listTags(actor = null) {
    const actorContext = resolveActor(actor);
    if (isWorkspaceManager(actorContext)) {
      return noteRepo.listTags(actorContext.workspaceId);
    }
    return noteRepo.listTagsForUser(actorContext.workspaceId, actorContext.userId);
  }

  async function getMemoryStats(actor = null) {
    const actorContext = resolveActor(actor);
    if (isWorkspaceManager(actorContext)) {
      return noteRepo.getStats(actorContext.workspaceId);
    }
    return noteRepo.getStatsForUser(actorContext.workspaceId, actorContext.userId);
  }

  async function exportMemories({ project = null, format = "json", actor = null } = {}) {
    const actorContext = resolveActor(actor);
    const normalizedProject = String(project || "").trim();

    const notes = await listVisibleNotesForActor({
      actorContext,
      project: normalizedProject,
      limit: 10000,
      offset: 0,
    });

    if (String(format || "").toLowerCase() === "markdown") {
      return serializeNotesAsMarkdown(notes);
    }

    return JSON.stringify(notes, null, 2);
  }

  return {
    listRecentMemories,
    getMemoryRawContent,
    searchRawMemories,
    readExtractedMarkdownMemory,
    listProjects,
    searchNotesBm25,
    searchMemories,
    listTags,
    getMemoryStats,
    exportMemories,
  };
}
