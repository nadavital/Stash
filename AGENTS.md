# Stash - Agent Guide

## Project Goal

Build an AI-powered memory product that scales:

- Users can save anything quickly (text, link, image, multi-attachment).
- The system auto-enriches each item (summary, tags, project label, embeddings).
- Users can ask grounded questions and get answers with citations.
- The same memory is exposed to agents through MCP and OpenClaw tools.

This should feel like an "AI-native Google Keep for working context."

## Product Success Criteria

In active development, we should continuously improve:

1. Reliable capture across mixed inputs and attachments.
2. Accurate automatic enrichment with retry-safe pipelines.
3. Grounded chat answers with citation cards and source traceability.
4. Stable Codex/ChatGPT access through MCP tools.
5. Stable OpenClaw access through the tool bridge.
6. Production-readiness fundamentals: auth, tenancy, and observability.

## Current Product Scope

- Multi-user foundation with auth and tenant-aware data access.
- Storage and indexing that can evolve beyond local-only constraints.
- OpenAI as the AI provider for enrichment + embeddings.
- Shared service layer used by:
  - Web app/API
  - MCP server
  - OpenClaw bridge
- Deterministic fallback behavior when `OPENAI_API_KEY` is missing.

## Near-Term Non-Goals

- Full enterprise security/compliance programs before core product fit.
- Premature microservice fragmentation without clear scaling pressure.
- Broad feature expansion that weakens capture -> enrich -> retrieve -> cite.

## Product Principles

- One memory backend, multiple agent surfaces.
- Ground answers in saved artifacts and show sources.
- Optimize for fast capture, high reliability, and scale readiness.
- Keep architecture simple and composable.
- Accelerate execution with small, validated iterations.

## Agent Working Rules

When making changes:

1. Reuse the shared memory service (`src/memoryService.js`) instead of duplicating logic.
2. Keep MCP and OpenClaw tool contracts aligned with web behavior.
3. Preserve tenant-safe behavior and auth-aware access patterns.
4. Prioritize product reliability and operational clarity over speculative features.
5. If scope tradeoffs are needed, keep:
   - capture -> enrich -> retrieve -> cite
   - MCP + OpenClaw integration path
6. Favor changes that improve delivery speed without compromising correctness.

## Definition of Done (Product Milestone)

A milestone is "done enough" when:

- A new note can be saved and appears in recent memory.
- Search returns relevant results.
- Chat and context generation include citations.
- MCP tools can read/write memory.
- OpenClaw bridge can read/write memory.
- Auth and tenancy boundaries are enforced in read/write flows.
- Core operational checks (logging, error handling, retry behavior) are in place.
- README instructions are accurate and runnable.

## Frontend Coordination Rules

For frontend work in parallel worktrees:

1. Use the design skill at `skills/stash-openai-ui/SKILL.md`.
2. Follow `docs/frontend-worktrees-instructions.md`.
3. Ask the user the workstream-specific question set before coding.
4. Do not modify `src/` from frontend workstreams.
5. Do not commit runtime DB artifacts (`data/*.db-*`).

## Design System & Frontend Architecture

When modifying or adding frontend components:

1. **Read `docs/design.md`** before making UI changes - it documents all components, tokens, and patterns.
2. **Never inline component HTML/logic in pages.** Extract to `public/app/components/{name}/{name}.js`.
3. **Component contract**: export `render{Name}HTML()` (returns string), `query{Name}Els(root)` (returns refs), `init{Name}(els, callbacks)` (returns disposer).
4. **One CSS file per component** in `public/styles/components/`. Use `.{component}-*` class prefix.
5. **Use design tokens** from `tokens.css` - never hardcode colors, fonts, or shadows.
6. **Page files** (`pages/*.js`) should compose components, not contain component internals.
7. **Shared utilities** live in `public/app/services/` - check there before creating new helpers.
8. **State management**: use `store.getState()` / `store.setState()` - no other state systems.
9. **Accessibility**: all interactive elements need `aria-*` attributes and keyboard support.
10. **After changes**: update `docs/design.md` component catalog if you added/changed components.
