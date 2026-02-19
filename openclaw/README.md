# OpenClaw Integration Prep

This project includes an OpenClaw-ready command bridge that calls the same service layer used by the web app and MCP server.

## Bridge command

```bash
node openclaw/bridge.js <tool_name> '<json_args>'
```

All bridge tool calls require auth:

```bash
export STASH_SESSION_TOKEN='<session_token>'
# optional workspace override
export STASH_WORKSPACE_ID='<workspace_id>'
```

Example:

```bash
node openclaw/bridge.js search_notes '{"query":"launch risks"}'
```

## Included tool names

- `create_note`
- `get_note_raw_content`
- `update_note`
- `update_note_markdown`
- `add_note_comment`
- `list_note_versions`
- `restore_note_version`
- `search_notes`
- `get_tasks`
- `obtain_consolidated_memory_file`
- `complete_task`
- `delete_note`
- `delete_project`
- `retry_note_enrichment`
- `get_enrichment_queue`

## Manifest

`openclaw/tools.manifest.json` documents tool names and JSON schemas so you can map them into your OpenClaw plugin/config quickly.
