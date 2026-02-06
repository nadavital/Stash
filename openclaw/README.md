# OpenClaw Integration Prep

This project includes an OpenClaw-ready command bridge that calls the same service layer used by the web app and MCP server.

## Bridge command

```bash
node openclaw/bridge.js <tool_name> '<json_args>'
```

Example:

```bash
node openclaw/bridge.js search_notes '{"query":"launch risks"}'
```

## Included tool names

- `search_notes`
- `get_tasks`
- `obtain_consolidated_memory_file`
- `complete_task`
- `delete_note`
- `delete_project`

## Manifest

`openclaw/tools.manifest.json` documents tool names and JSON schemas so you can map them into your OpenClaw plugin/config quickly.
