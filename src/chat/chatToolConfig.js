const TASK_SPEC_SCHEMA = {
  type: "object",
  description: "Structured automation behavior settings (versioned task model).",
  properties: {
    version: { type: "string", description: "Spec version (currently \"1\")" },
    intent: { type: "string", description: "Task intent category (e.g. news_digest, sync, cleanup, generic)." },
    source: {
      type: "object",
      description: "Where task inputs come from.",
      properties: {
        mode: { type: "string", enum: ["workspace", "web", "mixed"], description: "Primary source mode" },
        query: { type: "string", description: "Optional external search query for web/mixed modes" },
        domains: { type: "array", items: { type: "string" }, description: "Optional allowlist of source domains" },
        lookbackHours: { type: "number", description: "Optional freshness window in hours (e.g. 24)" },
      },
      required: [],
    },
    output: {
      type: "object",
      description: "How generated output should be written.",
      properties: {
        mode: {
          type: "string",
          enum: ["single_note", "per_item_notes"],
          description: "Single digest note or one note per source item",
        },
        maxItems: { type: "number", description: "Maximum items to include per run" },
        includeDigestIndex: { type: "boolean", description: "When per-item mode, also create/update an index digest note" },
        summarySentences: { type: "number", description: "Target summary sentence count per item" },
      },
      required: [],
    },
    destination: {
      type: "object",
      description: "Where outputs should be saved.",
      properties: {
        folder: { type: "string", description: "Destination folder" },
        namingPattern: { type: "string", description: "Optional note title pattern, e.g. \"The Verge Digest — {{date}}\"" },
      },
      required: [],
    },
    dedupe: {
      type: "object",
      description: "Duplicate handling policy.",
      properties: {
        enabled: { type: "boolean", description: "Enable duplicate detection before creating notes" },
        strategy: { type: "string", enum: ["by_url", "by_title_date", "none"], description: "Dedupe strategy" },
        scope: { type: "string", enum: ["folder", "workspace"], description: "Dedupe scope" },
      },
      required: [],
    },
  },
  required: [],
};

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
    name: "create_notes_bulk",
    description:
      "Save multiple notes/links/files in one call. Use when the user wants to capture many items at once.",
    parameters: {
      type: "object",
      properties: {
        project: { type: "string", description: "Default folder for items that do not provide a project" },
        stopOnError: { type: "boolean", description: "If true, stop at the first failed item" },
        items: {
          type: "array",
          description: "Items to create (max 25 in one call).",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "The note content or URL to save (optional when attachment is present)" },
              title: { type: "string", description: "Preferred item title (optional, plain language)." },
              project: { type: "string", description: "Folder override for this item (optional)" },
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
      },
      required: ["items"],
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
    name: "list_tasks",
    description: "List automations in the workspace.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending_approval", "active", "paused", "all"],
          description: "Optional automation status filter",
        },
        limit: { type: "number", description: "Optional max tasks to return (default 30, max 200)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "create_task",
    description: "Create a new automation task only after the user explicitly confirms the latest proposal.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Automation title" },
        prompt: { type: "string", description: "Automation instruction prompt" },
        project: { type: "string", description: "Folder scope for automation output" },
        scopeFolder: { type: "string", description: "Folder scope override for automation output" },
        scheduleType: { type: "string", enum: ["manual", "interval"], description: "Automation schedule type" },
        intervalMinutes: { type: "number", description: "For interval schedule: run every N minutes (min 5)" },
        timezone: { type: "string", description: "IANA timezone (optional)" },
        nextRunAt: {
          type: "string",
          description: "Optional ISO datetime for the next run. Use with interval=1440 + timezone for daily at a specific local time.",
        },
        maxActionsPerRun: { type: "number", description: "Max mutating actions per run (1-25)" },
        maxConsecutiveFailures: { type: "number", description: "Auto-pause after this many failed runs (1-20)" },
        dryRun: { type: "boolean", description: "If true, automation is marked dry-run" },
        spec: TASK_SPEC_SCHEMA,
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "propose_task",
    description: "Prepare a task proposal card for user confirmation. Does not create or mutate data.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Automation title" },
        prompt: { type: "string", description: "Automation instruction prompt" },
        project: { type: "string", description: "Folder scope for automation output" },
        scopeFolder: { type: "string", description: "Folder scope override for automation output" },
        scheduleType: { type: "string", enum: ["manual", "interval"], description: "Automation schedule type" },
        intervalMinutes: { type: "number", description: "For interval schedule: run every N minutes (min 5)" },
        timezone: { type: "string", description: "IANA timezone (optional)" },
        nextRunAt: {
          type: "string",
          description: "Optional ISO datetime for the next run. Use with interval=1440 + timezone for daily at a specific local time.",
        },
        maxActionsPerRun: { type: "number", description: "Max mutating actions per run (1-25)" },
        maxConsecutiveFailures: { type: "number", description: "Auto-pause after this many failed runs (1-20)" },
        dryRun: { type: "boolean", description: "If true, automation is marked dry-run" },
        spec: TASK_SPEC_SCHEMA,
      },
      required: ["title"],
    },
  },
  {
    type: "function",
    name: "update_task",
    description: "Update an automation task configuration.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id" },
        title: { type: "string", description: "Updated task title" },
        prompt: { type: "string", description: "Updated automation prompt" },
        project: { type: "string", description: "Updated folder scope" },
        scopeFolder: { type: "string", description: "Updated folder scope" },
        scopeType: { type: "string", enum: ["workspace", "folder"], description: "Scope mode" },
        scheduleType: { type: "string", enum: ["manual", "interval"], description: "Updated schedule type" },
        intervalMinutes: { type: "number", description: "Updated interval minutes" },
        timezone: { type: "string", description: "Updated timezone" },
        nextRunAt: { type: "string", description: "Updated next run ISO datetime anchor for interval schedules" },
        maxActionsPerRun: { type: "number", description: "Updated max actions per run" },
        maxConsecutiveFailures: { type: "number", description: "Updated auto-pause threshold (1-20)" },
        dryRun: { type: "boolean", description: "Updated dry-run flag" },
        status: { type: "string", enum: ["active", "paused"], description: "Activation state" },
        spec: TASK_SPEC_SCHEMA,
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "complete_task",
    description: "Pause an automation task.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "delete_task",
    description: "Delete a task by id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task id" },
      },
      required: ["id"],
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
    name: "fetch_rss",
    description: "Fetch and parse an RSS/Atom feed URL for external source retrieval.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "RSS or Atom feed URL (http/https)" },
        limit: { type: "number", description: "Max feed items to return (1-50, default 12)" },
      },
      required: ["url"],
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
- For external feeds/newsletters/blogs with a known feed URL, prefer fetch_rss before broader web search.
- When the user explicitly asks to edit/populate/update/rewrite the current item, perform the write in the same turn (use update_note or update_note_markdown) instead of only proposing draft text.
- In item context, treat "this note/file/template" as an instruction to apply changes to the active item unless the user asks for draft-only output.
- After reading an item with get_note_raw_content, prefer the returned revision as baseRevision when writing.
- For external/current facts, use web search when needed; do not claim web-search restrictions unless the user explicitly scoped the request to a specific source/item.
- When creating notes and the user implies a name, pass that name using create_note.title.
- For create_task, always use a two-step flow: call propose_task first, then wait for explicit user confirmation before creating.
- For task proposals, call propose_task with complete task config, but keep user-facing proposal copy concise.
- Proposal card actions are Create it and Cancel; users revise by typing changes in the composer.
- Always make destination explicit in proposals (named folder or workspace root). If the user asked for a folder but did not name one, ask once or clearly default to workspace root.
- If the user asks to change a proposed task, revise the configuration and call propose_task again before any create_task call.
- During task setup/proposal, do not create folders, notes, comments, or collaborator changes. Only propose/save task configuration; runtime execution handles workspace mutations.
- For automations requested at a specific clock time (for example "every day at 9:00 AM local"), set scheduleType=interval with intervalMinutes=1440, set timezone, and set nextRunAt to the next matching ISO datetime.
- If the user says "local time" without naming a timezone, infer timezone from available locale context and proceed without adding a post-create timezone clarification step.
- If the user uses broad time phrases like "morning", "afternoon", or "evening", do not ask a precision follow-up by default. Choose a reasonable local-time default and mention that it can be edited.
- Do not claim scheduler limitations for daily clock-time schedules when interval+nextRunAt can satisfy the request.

Follow-up question policy:
- Use ask_user_question only when missing detail would materially change the result and no safe default exists.
- Ask one concise concrete question at a time; avoid multi-part follow-ups.
- Ask only what is necessary and ask no more than 4 follow-up questions for a single user request.
- For scheduling follow-ups, maximize information gain in one question by requesting both time and timezone together unless timezone is already known.
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
- For task creation/update confirmations, do not include task IDs by default.
- For task creation confirmations, avoid internal state terms like "pending approval", "interval backend", or implementation details unless the user explicitly asks.
- Never refer to items as N1/N2/citation labels in user-visible text.
- Prefer plain text source attributions without inline markdown URLs; only include direct URLs when the user explicitly asks for links.`;
