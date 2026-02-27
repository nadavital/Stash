function normalizeText(value) {
  return String(value || "").trim();
}

const CONTEXT_NOTE_ALIASES = new Set([
  "this",
  "this note",
  "this item",
  "current",
  "current note",
  "current item",
  "active note",
  "active item",
  "selected note",
  "selected item",
  "open note",
  "open item",
]);

const CONTEXT_FOLDER_ALIASES = new Set([
  "this folder",
  "current folder",
  "open folder",
  "active folder",
  "this project",
  "current project",
  "open project",
  "active project",
  "this collection",
  "current collection",
  "here",
]);

const NOTE_ID_ARG_TOOLS = new Set([
  "get_note_raw_content",
  "update_note",
  "update_note_attachment",
  "update_note_markdown",
  "add_note_comment",
  "list_note_versions",
  "restore_note_version",
  "retry_note_enrichment",
]);

const FOLDER_ID_ARG_TOOLS = new Set([
  "list_folder_collaborators",
  "set_folder_collaborator",
  "remove_folder_collaborator",
  "list_activity",
]);

const PROJECT_ARG_TOOLS = new Set([
  "create_note",
  "create_notes_bulk",
  "search_notes",
  "update_note",
]);

function normalizeLookupKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ");
}

function stripDecoratedPrefix(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const stripped = normalized
    .replace(/^(?:the\s+)?(?:note|item|file|doc|document)\s+(?:called|named|titled)\s+/i, "")
    .replace(/^(?:the\s+)?(?:note|item|file|doc|document)\s+/i, "")
    .replace(/[.!?]+$/g, "");
  return normalizeText(stripped);
}

function buildNameLookupCandidates(rawValue) {
  const normalized = normalizeText(rawValue);
  if (!normalized) return [];
  const candidates = new Set();
  const add = (value) => {
    const key = normalizeLookupKey(value);
    if (key) candidates.add(key);
  };

  add(normalized);
  add(stripDecoratedPrefix(normalized));
  const quotedMatch = normalized.match(/^[`"'“”‘’](.+)[`"'“”‘’]$/);
  if (quotedMatch) {
    add(quotedMatch[1]);
  }

  return Array.from(candidates);
}

function extractCitationAlias(rawValue) {
  const normalized = normalizeText(rawValue);
  if (!normalized) return "";

  const directMatch = normalized.match(/^\[?\s*N\s*(\d+)\s*\]?$/i);
  if (directMatch) return `N${Number(directMatch[1])}`;

  const notePrefixMatch = normalized.match(/^note\s+\[?\s*N\s*(\d+)\s*\]?$/i);
  if (notePrefixMatch) return `N${Number(notePrefixMatch[1])}`;

  return "";
}

export function createCitationNoteAliasMap(citations = []) {
  const map = new Map();
  const entries = Array.isArray(citations) ? citations : [];
  for (let index = 0; index < entries.length; index += 1) {
    const noteId = normalizeText(entries[index]?.note?.id);
    if (!noteId) continue;
    const label = `N${index + 1}`;
    map.set(label, noteId);
  }
  return map;
}

function addLookupKey(map, key, noteId) {
  const normalizedKey = normalizeLookupKey(key);
  const normalizedId = normalizeText(noteId);
  if (!normalizedKey || !normalizedId) return;
  if (!map.has(normalizedKey)) {
    map.set(normalizedKey, normalizedId);
    return;
  }
  const existing = normalizeText(map.get(normalizedKey));
  if (existing && existing !== normalizedId) {
    map.set(normalizedKey, "");
  }
}

export function createCitationNoteNameAliasMap(citations = []) {
  const map = new Map();
  const entries = Array.isArray(citations) ? citations : [];
  for (const entry of entries) {
    const note = entry?.note;
    const noteId = normalizeText(note?.id);
    if (!noteId) continue;
    addLookupKey(map, note?.title, noteId);
    addLookupKey(map, note?.metadata?.title, noteId);
    addLookupKey(map, note?.fileName, noteId);
  }
  return map;
}

export function resolveAgentNoteId(
  rawValue,
  {
    contextNoteId = "",
    citationAliasMap = null,
    noteNameAliasMap = null,
  } = {}
) {
  const normalized = normalizeText(rawValue);
  const normalizedContextId = normalizeText(contextNoteId);
  if (!normalized) return normalizedContextId || "";

  const aliasMap = citationAliasMap instanceof Map ? citationAliasMap : null;
  const nameMap = noteNameAliasMap instanceof Map ? noteNameAliasMap : null;
  const citationAlias = extractCitationAlias(normalized);
  if (citationAlias && aliasMap?.has(citationAlias)) {
    return aliasMap.get(citationAlias) || normalized;
  }

  const lower = normalized.toLowerCase();
  if (normalizedContextId && CONTEXT_NOTE_ALIASES.has(lower)) {
    return normalizedContextId;
  }

  // If the model only provides N1 without citations in scope, fall back to the active note.
  if (normalizedContextId && /^n1$/i.test(normalized)) {
    return normalizedContextId;
  }

  if (nameMap) {
    const candidates = buildNameLookupCandidates(normalized);
    for (const candidate of candidates) {
      if (!nameMap.has(candidate)) continue;
      const mappedId = normalizeText(nameMap.get(candidate));
      if (mappedId) return mappedId;
    }
  }

  return normalized;
}

export function resolveAgentFolderId(rawValue, { contextProject = "" } = {}) {
  const normalized = normalizeText(rawValue);
  const normalizedContextProject = normalizeText(contextProject);
  if (!normalized) return normalizedContextProject || "";
  if (normalizedContextProject && CONTEXT_FOLDER_ALIASES.has(normalized.toLowerCase())) {
    return normalizedContextProject;
  }
  return normalized;
}

export function resolveAgentToolArgs(
  name,
  args,
  {
    contextNoteId = "",
    contextProject = "",
    citationAliasMap = null,
    noteNameAliasMap = null,
  } = {}
) {
  const toolName = normalizeText(name);
  const source = args && typeof args === "object" ? args : {};
  const nextArgs = { ...source };

  if (NOTE_ID_ARG_TOOLS.has(toolName)) {
    const resolvedId = resolveAgentNoteId(nextArgs.id, {
      contextNoteId,
      citationAliasMap,
      noteNameAliasMap,
    });
    if (resolvedId) {
      nextArgs.id = resolvedId;
    }
  }

  if (FOLDER_ID_ARG_TOOLS.has(toolName)) {
    const resolvedFolderId = resolveAgentFolderId(nextArgs.folderId, { contextProject });
    if (resolvedFolderId) {
      nextArgs.folderId = resolvedFolderId;
    }
  }

  if (toolName === "list_activity") {
    const resolvedNoteId = resolveAgentNoteId(nextArgs.noteId, {
      contextNoteId,
      citationAliasMap,
      noteNameAliasMap,
    });
    if (resolvedNoteId) {
      nextArgs.noteId = resolvedNoteId;
    }
  }

  if (PROJECT_ARG_TOOLS.has(toolName)) {
    const resolvedProject = resolveAgentFolderId(nextArgs.project, { contextProject });
    if (resolvedProject) {
      nextArgs.project = resolvedProject;
    }
  }

  if (toolName === "create_notes_bulk" && Array.isArray(nextArgs.items) && nextArgs.items.length > 0) {
    nextArgs.items = nextArgs.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const resolvedProject = resolveAgentFolderId(item.project, { contextProject });
      if (!resolvedProject) return item;
      return {
        ...item,
        project: resolvedProject,
      };
    });
  }

  return nextArgs;
}
