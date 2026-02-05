# Frontend Worktrees Playbook (v2)

Use this playbook to run parallel frontend workstreams with consistent design quality and safe merges.

## Required skill

All frontend worktrees must use:
`[$project-memory-openai-ui](/Users/nadav/Desktop/Hackathon/skills/project-memory-openai-ui/SKILL.md)`

## What changed after retro

These are now mandatory because they caused issues in the last run:

1. Never start work on local `main`; work only in a named worktree branch.
2. Run preflight (`pwd`, branch, status) before any edit.
3. Keep file scope strict by workstream.
4. Never commit runtime DB artifacts (`data/*.db-*`).
5. Do not edit `src/` from frontend workstreams.
6. Use a consistent branch naming scheme.

## Branch naming standard

Use this exact format:
- `codex/wt-<workstream>`

Examples:
- `codex/wt-foundation`
- `codex/wt-adapter`
- `codex/wt-capture`
- `codex/wt-stream`
- `codex/wt-ask`
- `codex/wt-polish`

## One-time setup

Run from repo root:

```bash
git worktree add ../Hackathon-wt-foundation -b codex/wt-foundation
git worktree add ../Hackathon-wt-adapter -b codex/wt-adapter
git worktree add ../Hackathon-wt-capture -b codex/wt-capture
git worktree add ../Hackathon-wt-stream -b codex/wt-stream
git worktree add ../Hackathon-wt-ask -b codex/wt-ask
git worktree add ../Hackathon-wt-polish -b codex/wt-polish
```

## Preflight (mandatory)

Run this before asking questions or editing:

```bash
pwd
git branch --show-current
git status --short
```

If output is not the intended worktree branch, stop and fix setup first.

## Shared rules for every worktree

- Keep the app bright and calm; do not add a persistent sidebar by default.
- Keep the story obvious: `capture -> enrich feedback -> retrieve -> cite`.
- Do not block on backend completion; handle endpoint variation in frontend adapter logic.
- Preserve heuristic fallback behavior.
- Ask the workstream question pack before coding.
- Add visible loading, empty, success, and error states for owned surfaces.
- Run a quick manual pass on desktop and mobile widths.

## Scope guardrails

Frontend workstreams may change only:
- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `docs/worktree-<id>-answers.md`

Do not modify:
- `src/*`
- `data/*.db-*`
- `mcp/*`
- `openclaw/*`

## Workstream ownership

### A: Foundation (`codex/wt-foundation`)

- Primary: `public/index.html`, `public/styles.css`
- Optional: tiny `public/app.js` hooks only if required

### B: Adapter (`codex/wt-adapter`)

- Primary: `public/app.js`
- Optional: minimal status/fallback hooks in `public/index.html` and `public/styles.css`

### C: Capture (`codex/wt-capture`)

- Primary: capture section in `public/index.html`
- Primary: capture logic in `public/app.js`
- Primary: capture styles in `public/styles.css`

### D: Stream (`codex/wt-stream`)

- Primary: stream section in `public/index.html`
- Primary: stream/search/filter logic in `public/app.js`
- Primary: stream/card styles in `public/styles.css`

### E: Ask (`codex/wt-ask`)

- Primary: ask/citation section in `public/index.html`
- Primary: answer/citation logic in `public/app.js`
- Primary: ask/citation styles in `public/styles.css`

### F: Polish (`codex/wt-polish`)

- Cross-cutting refinement in `public/*`
- `README.md` only if demo instructions actually changed

## Mandatory question-first flow

Before coding, each worktree must:

1. Read skill + references.
2. Ask exact workstream question set.
3. Wait for answers.
4. Restate accepted direction in bullets.
5. Implement.

## Final checks before commit

Run:

```bash
git diff --name-only
```

Then confirm:

1. Only in-scope files changed.
2. No `data/*.db-*` files changed.
3. No `src/*` files changed.

If violations appear, clean them before commit.

## PR handoff template

Use this exact format:

```text
Skill used: $project-memory-openai-ui
User answers applied:
- ...

What changed:
- ...

Files changed:
- ...

State coverage:
- Loading:
- Empty:
- Success:
- Error:

Scope check:
- Out-of-scope files touched: yes/no

Open questions for user:
- ...
```

## Merge sequence for coordinator

1. Merge/finalize foundation first.
2. Merge adapter second.
3. Merge capture + stream + ask.
4. Merge polish last.
5. Use an integration branch and curate conflicts instead of direct branch-to-main merges.
