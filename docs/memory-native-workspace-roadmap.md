# Memory-Native Workspace Roadmap

Last updated: 2026-02-17

## Product direction

Stash is a second-brain + agent workspace where memory artifacts are the source of truth.
Chat is one control surface, not the memory system.

## Core principles

- Layered memory: item, folder/project, user, workspace.
- Agent operations are explicit and inspectable.
- Human and agent collaborate on shared artifacts, not message history.
- All agent surfaces (web, MCP, OpenClaw) use the same memory and tool contracts.

## Active milestones

### M1 - Layered memory retrieval (in progress)

- [x] Add `scope` support to retrieval paths (`all|workspace|user|project|item`).
- [x] Add `workingSetIds` support for focused retrieval.
- [x] Wire scope + working set through `/api/notes`, `/api/chat`, `/api/context`.
- [x] Add integration tests for scoped retrieval APIs.
- [ ] Add scope switcher + working set tray in UI.
- [ ] Add telemetry for scope usage and result quality.

### M2 - Shared artifact workspace

- [ ] First-class artifact types: List, Plan, Decision, Deliverable.
- [ ] Relationship model: supports/supersedes/related-to.
- [ ] Artifact-centric views (board/timeline/graph), not only note cards.
- [ ] Inline agent actions on artifacts (expand list, propose edit, summarize state).

### M3 - Human-agent collaboration loop

- [ ] Propose/apply edit flow with clear diffs and approve/reject.
- [ ] Per-action provenance: tool calls, citations, source layer.
- [ ] Multi-step run UI that shows intent -> steps -> outputs.
- [ ] Save reusable workflows ("playbooks") bound to working sets.

### M4 - Tool connectivity and policy

- [ ] Unified tool contract registry for web chat, MCP, OpenClaw.
- [ ] Per-tool and per-scope permission policy.
- [ ] Connection/test/manage UI for external tool providers.
- [ ] Contract tests to keep all surfaces behavior-aligned.

## Iteration backlog

- [ ] Add list intelligence for non-coding use cases (for example restaurants, vendors, ideas).
- [ ] Add "what is missing" suggestions grounded in saved memory only.
- [ ] Add user preference memory profile and keep it in retrieval context.
- [ ] Add team/workspace abstraction for home vs work separation.
- [ ] Add quality eval set for grounded answers and citations.

## Current implementation notes

- Durable enrichment queue is live with retry/dead-letter behavior.
- Queue diagnostics endpoint is available for managers.
- Agent harness now emits structured traces + idempotent tool call caching.
- Chat now auto-sends scoped context from route state (item -> `scope=item`, folder -> `scope=project`).
- Streaming tool calls now inherit request scope/working set defaults to avoid context drift.
- Next engineering step: UI surface for explicit scope switching and working-set management controls.
