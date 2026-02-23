export async function resolveStreamingChatSearchContext({
  body,
  actor,
  question,
  scope,
  workingSetIds,
  recentMessages,
  searchMemories,
  noteRepo,
  isLikelyExternalInfoRequest,
  extractDomainsFromText,
  extractDomainFromUrl,
}) {
  const contextNoteId = String(body.contextNoteId || "").trim();
  const recentConversationText = recentMessages
    .map((entry) => `${entry.role}: ${entry.text}`)
    .join("\n");
  const likelyExternalIntent = isLikelyExternalInfoRequest(`${question}\n${recentConversationText}`);

  let contextNoteSourceUrl = "";
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
        citations = citations.filter((entry) => String(entry.note?.id || "") !== contextNoteId);
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

  return {
    contextNoteId,
    contextNoteSourceUrl,
    likelyExternalIntent,
    citations,
    webSearchDomains,
  };
}

export function buildStreamingPromptAndInput({
  question,
  recentMessages,
  citations,
  scope,
  workingSetIds,
  project,
  likelyExternalIntent,
  contextNoteId,
  contextNoteSourceUrl,
  hasAttachment,
  buildCitationBlock,
  CHAT_SYSTEM_PROMPT,
}) {
  const context = citations.length ? buildCitationBlock(citations) : "";
  let systemPrompt = CHAT_SYSTEM_PROMPT;
  const scopeHints = [];
  if (scope !== "all") {
    scopeHints.push(`Active memory scope is "${scope}".`);
  }
  if (project) {
    scopeHints.push(`Project context is "${project}".`);
    systemPrompt = `The user is working in folder "${project}". Consider this context.\n\n${systemPrompt}`;
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
  const initialInput = [
    ...historyInput,
    { role: "user", content: [{ type: "input_text", text: questionText }] },
  ];

  return {
    systemPrompt,
    initialInput,
  };
}
