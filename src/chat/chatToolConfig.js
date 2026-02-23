export const CHAT_TOOLS = [
  {
    type: "function",
    name: "create_note",
    description:
      "Save a new note, link, image, or file-backed item. Use when the user wants to save content or an attachment.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The note content or URL to save (optional when attachment is present)" },
        title: { type: "string", description: "Preferred item title (optional, plain language)." },
        project: { type: "string", description: "Folder to save into (optional)" },
        sourceType: { type: "string", enum: ["url", "link", "text", "manual", "file", "image"], description: "Type of content" },
        sourceUrl: { type: "string", description: "Optional source URL" },
        imageDataUrl: { type: "string", description: "Optional image data URL" },
        fileDataUrl: { type: "string", description: "Optional file data URL" },
        fileName: { type: "string", description: "Optional file name for attachment uploads" },
        fileMimeType: { type: "string", description: "Optional mime type for attachment uploads" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "create_folder",
    description: "Create a new folder/collection. Use when the user wants to organize items into a new group.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Folder name" },
        description: { type: "string", description: "Optional description" },
        color: { type: "string", description: "Color: green, blue, purple, orange, pink, red, yellow" },
      },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "list_workspace_members",
    description: "List workspace members so you can pick collaborators by id/email.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional filter against name/email/id" },
        limit: { type: "number", description: "Optional max members to return (default 50)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "list_folder_collaborators",
    description: "List collaborators for a folder, including their roles.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Folder id or folder name" },
      },
      required: ["folderId"],
    },
  },
  {
    type: "function",
    name: "set_folder_collaborator",
    description: "Share a folder by setting a collaborator role (viewer/editor/manager).",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Folder id or folder name" },
        userId: { type: "string", description: "Workspace user id (preferred)" },
        email: { type: "string", description: "Workspace member email (fallback)" },
        role: { type: "string", enum: ["viewer", "editor", "manager"], description: "Collaborator role" },
      },
      required: ["folderId"],
    },
  },
  {
    type: "function",
    name: "remove_folder_collaborator",
    description: "Unshare a folder by removing a collaborator.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Folder id or folder name" },
        userId: { type: "string", description: "Workspace user id (preferred)" },
        email: { type: "string", description: "Workspace member email (fallback)" },
      },
      required: ["folderId"],
    },
  },
  {
    type: "function",
    name: "list_activity",
    description: "List recent workspace activity, optionally filtered to a folder or note.",
    parameters: {
      type: "object",
      properties: {
        folderId: { type: "string", description: "Optional folder id or name filter" },
        noteId: { type: "string", description: "Optional note id filter" },
        limit: { type: "number", description: "Optional max events to return (default 30)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "ask_user_question",
    description: "Ask the user a focused follow-up question to clarify intent, preferences, or constraints before continuing.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Exactly one short follow-up question for this step (single sentence, no lists/sections, ideally under 140 chars).",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional short answer choices (2-4) that represent literal user answers, not instructions/actions.",
        },
        answerMode: {
          type: "string",
          enum: ["freeform_only", "choices_only", "choices_plus_freeform"],
          description: "How the user should answer: freeform text only, choices only, or choices plus freeform text.",
        },
        context: { type: "string", description: "Optional one-line context (keep concise)." },
      },
      required: ["question", "answerMode"],
    },
  },
  {
    type: "function",
    name: "search_notes",
    description: "Search through saved notes. Use when the user asks about their saved content.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        project: { type: "string", description: "Filter to specific folder (optional)" },
        scope: { type: "string", enum: ["all", "workspace", "user", "project", "item"], description: "Memory scope" },
        workingSetIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional note ids for focused search context",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_note_raw_content",
    description:
      "Read note content for grounding (top-level content plus extracted raw/markdown when available).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        includeMarkdown: { type: "boolean", description: "Include markdownContent in response" },
        maxChars: { type: "number", description: "Maximum characters to return" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "update_note",
    description: "Update note title/content/summary/tags/folder.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        title: { type: "string", description: "User-facing title for the note" },
        content: { type: "string", description: "Updated note content" },
        summary: { type: "string", description: "Updated summary" },
        tags: { type: "array", items: { type: "string" }, description: "Updated tags" },
        project: { type: "string", description: "Updated folder name" },
        baseRevision: { type: "number", description: "Optional optimistic concurrency revision guard" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "update_note_attachment",
    description: "Replace a note attachment (file/image) and re-run enrichment.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        fileDataUrl: { type: "string", description: "Optional file data URL" },
        imageDataUrl: { type: "string", description: "Optional image data URL" },
        fileName: { type: "string", description: "Optional file name for attachment" },
        fileMimeType: { type: "string", description: "Optional mime type for attachment" },
        content: { type: "string", description: "Optional note content override" },
        requeueEnrichment: { type: "boolean", description: "Requeue enrichment after attachment update" },
        baseRevision: { type: "number", description: "Optional optimistic concurrency revision guard" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "update_note_markdown",
    description: "Update extracted raw/markdown content on a note, with optional re-enrichment.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        content: { type: "string", description: "Optional top-level content override" },
        rawContent: { type: "string", description: "Updated extracted raw text" },
        markdownContent: { type: "string", description: "Updated extracted markdown text" },
        requeueEnrichment: { type: "boolean", description: "Requeue enrichment after edit" },
        baseRevision: { type: "number", description: "Optional optimistic concurrency revision guard" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "add_note_comment",
    description: "Add a contextual comment to a note.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        text: { type: "string", description: "Comment text" },
      },
      required: ["id", "text"],
    },
  },
  {
    type: "function",
    name: "list_note_versions",
    description: "List version history for a note.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "restore_note_version",
    description: "Restore a note to a previous version number.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id" },
        versionNumber: { type: "number", description: "Version number to restore" },
      },
      required: ["id", "versionNumber"],
    },
  },
  {
    type: "function",
    name: "retry_note_enrichment",
    description: "Retry enrichment for a failed or stuck note by id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Note id to retry enrichment for" },
      },
      required: ["id"],
    },
  },
];

export const CHAT_SYSTEM_PROMPT = `You are Stash, a collaborative workspace assistant.

Role and conversation behavior:
- Continue the active thread naturally and keep prior user decisions active unless the user changes them.
- Be a general assistant: answer normal questions directly, and use workspace tools when the request involves saved items, folders, files, or workspace actions.
- Do not force workspace summaries when the user is asking an unrelated general question.

Context usage policy:
- Treat provided workspace context as hints, not complete truth.
- If additional detail is needed, call tools to fetch it (for example search notes or read item content) before taking action.
- Prefer acting on explicit conversation history over inferred assumptions.

Tool policy:
- Use tools directly for create/edit/organize/share actions.
- When the user explicitly asks to edit/populate/update/rewrite the current item, perform the write in the same turn (use update_note or update_note_markdown) instead of only proposing draft text.
- In item context, treat "this note/file/template" as an instruction to apply changes to the active item unless the user asks for draft-only output.
- After reading an item with get_note_raw_content, prefer the returned revision as baseRevision when writing.
- For external/current facts, use web search when needed; do not claim web-search restrictions unless the user explicitly scoped the request to a specific source/item.
- When creating notes and the user implies a name, pass that name using create_note.title.

Follow-up question policy:
- Use ask_user_question only when missing detail would materially change the result and no safe default exists.
- Ask one concise concrete question at a time; avoid multi-part follow-ups.
- Ask only what is necessary and ask no more than 4 follow-up questions for a single user request.
- ask_user_question must set answerMode:
  - freeform_only: open text answer only (omit options)
  - choices_only: 2-4 literal options only
  - choices_plus_freeform: 2-4 literal options plus free-text input
- Options must be literal answer values the user can click as-is, not instruction-like phrases.
- For choices_plus_freeform, never include "Other"/"Something else" options.
- When using ask_user_question, do not repeat the same question/options in assistant prose; rely on the structured tool output for the follow-up card.

Output and references:
- Keep responses concise and actionable.
- In user-facing replies, reference items by title/folder name and avoid raw IDs unless the user explicitly asks for IDs.
- Never refer to items as N1/N2/citation labels in user-visible text.
- Prefer plain text source attributions without inline markdown URLs; only include direct URLs when the user explicitly asks for links.`;
