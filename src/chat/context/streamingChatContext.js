export async function resolveStreamingChatSearchContext({
  body,
  actor,
  question,
  scope,
  workingSetIds,
  noteRepo,
  extractDomainsFromText,
  extractDomainFromUrl,
}) {
  const contextNoteId = String(body.contextNoteId || "").trim();
  let contextNote = null;
  let contextNoteSourceUrl = "";
  const citations = [];
  const seededIds = new Set();

  if (contextNoteId) {
    try {
      contextNote = await noteRepo.getNoteById(contextNoteId, actor.workspaceId);
      if (contextNote) {
        contextNoteSourceUrl = String(contextNote.sourceUrl || "").trim();
        citations.unshift({ rank: 0, score: 1.0, note: contextNote });
        seededIds.add(contextNoteId);
      }
    } catch {
      // best-effort
    }
  }

  const workingSetSeedIds = (Array.isArray(workingSetIds) ? workingSetIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => id && !seededIds.has(id))
    .slice(0, 3);
  for (const noteId of workingSetSeedIds) {
    try {
      const seeded = await noteRepo.getNoteById(noteId, actor.workspaceId);
      if (!seeded) continue;
      citations.push({
        rank: citations.length + 1,
        score: Math.max(0.1, 0.95 - citations.length * 0.1),
        note: seeded,
      });
      seededIds.add(noteId);
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
    contextNote,
    contextNoteSourceUrl,
    citations,
    webSearchDomains,
  };
}

function compactText(value = "", max = 160) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(20, max));
}

function noteDisplayTitle(note = null, fallback = "Untitled item") {
  if (!note || typeof note !== "object") return fallback;
  const fromMetadata = compactText(note?.metadata?.title || "", 120);
  if (fromMetadata) return fromMetadata;
  const fromTitle = compactText(note?.title || "", 120);
  if (fromTitle) return fromTitle;
  const fromSummary = compactText(note?.summary || "", 120);
  if (fromSummary) return fromSummary;
  const fromFileName = compactText(note?.fileName || "", 120);
  if (fromFileName) return fromFileName;
  const fromContent = compactText(note?.content || "", 120);
  if (fromContent) return fromContent;
  return fallback;
}

function buildWorkspaceContextCapsule({
  scope,
  project,
  workingSetIds,
  contextNoteId,
  contextNote,
  contextNoteSourceUrl,
  citations,
}) {
  const lines = [
    "Workspace context capsule (reference only; fetch additional data with tools before acting on assumptions):",
    `- active_scope: ${scope || "all"}`,
  ];
  if (project) {
    lines.push(`- active_folder: ${project}`);
  }
  if (workingSetIds.length > 0) {
    lines.push(`- active_working_set_ids: ${workingSetIds.slice(0, 20).join(", ")}`);
  }
  if (contextNoteId) {
    lines.push(`- active_item_id: ${contextNoteId}`);
    lines.push(`- active_item_title: ${noteDisplayTitle(contextNote)}`);
    const activeItemSummary = compactText(contextNote?.summary || "", 220);
    if (activeItemSummary) {
      lines.push(`- active_item_summary: ${activeItemSummary}`);
    }
  }
  if (contextNoteSourceUrl) {
    lines.push(`- active_item_source_url: ${contextNoteSourceUrl}`);
  }
  const quickSummaries = (Array.isArray(citations) ? citations : [])
    .slice(0, 3)
    .map((entry, index) => {
      const note = entry?.note || {};
      return `  - ${index + 1}. ${noteDisplayTitle(note)}${note?.project ? ` (folder: ${note.project})` : ""}`;
    });
  if (quickSummaries.length > 0) {
    lines.push("- nearby_saved_items:");
    lines.push(...quickSummaries);
  }
  return lines.join("\n");
}

export function buildStreamingPromptAndInput({
  question,
  recentMessages,
  citations,
  scope,
  workingSetIds,
  project,
  contextNoteId,
  contextNote,
  contextNoteSourceUrl,
  hasAttachment,
  CHAT_SYSTEM_PROMPT,
}) {
  const workspaceContextCapsule = buildWorkspaceContextCapsule({
    scope,
    project,
    workingSetIds,
    contextNoteId,
    contextNote,
    contextNoteSourceUrl,
    citations,
  });
  let systemPrompt = CHAT_SYSTEM_PROMPT;
  systemPrompt = `${workspaceContextCapsule}\n\n${systemPrompt}`;
  systemPrompt = `Citation labels like [N1], [N2], etc are snippet references only and not note IDs. Never pass N1/N2 as tool ids. Do not include citation labels in user-facing prose; refer to items by title/folder name. ${
    contextNoteId ? `If the user says "this note", use id "${contextNoteId}". ` : ""
  }\n\n${systemPrompt}`;
  if (contextNoteId) {
    systemPrompt = `The user is currently viewing one specific workspace item (id: ${contextNoteId}). If the user asks deictic questions like "what do you see here", "summarize this", "edit this", or "update this note/file", interpret that as the active item first and inspect it with get_note_raw_content before answering or editing. For explicit edit requests (e.g., "populate this template", "update this note", "rewrite this file", "add this to the current note"), apply the change to this item in the same turn with update_note or update_note_markdown unless the user explicitly asks for draft-only text. Do not default to attachment-only interpretation unless an attachment is actually present.\n\n${systemPrompt}`;
  }
  if (hasAttachment) {
    systemPrompt = `A file/image attachment is included with this request. When the user asks to save a new item, call create_note. When the user asks to replace an existing note's attachment, call update_note_attachment. Attachment payload is supplied server-side and should not be reconstructed.\n\n${systemPrompt}`;
  }
  if (contextNoteSourceUrl) {
    systemPrompt = `When discussing this item, ground factual claims to the source URL when possible: ${contextNoteSourceUrl}\n\n${systemPrompt}`;
  }

  const historyInput = recentMessages.map((entry) => ({
    role: entry.role === "assistant" ? "assistant" : "user",
    content: [
      {
        type: entry.role === "assistant" ? "output_text" : "input_text",
        text: String(entry.text || ""),
      },
    ],
  }));

  // Keep full session chat history in structured role form, then append this turn.
  const initialInput = [
    ...historyInput,
    { role: "user", content: [{ type: "input_text", text: question }] },
  ];

  return {
    systemPrompt,
    initialInput,
  };
}
