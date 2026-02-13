---
name: stash-openai-ui
description: Design and implement the Stash frontend in a calm OpenAI-inspired style with clear hierarchy, focused capture/search/chat interactions, and polished feedback states. Use when creating or refining layout, visual system, motion, interaction copy, and responsive behavior in public/index.html, public/styles.css, and public/app.js.
---

# Stash OpenAI UI

Use this skill when building or refining the web app UX in `public/`.

## Outcome

- Keep the core loop obvious: `capture -> enrich feedback -> retrieve -> cite`.
- Keep the visual language light, calm, and intentional.
- Keep trust high by making citations easy to scan and inspect.
- Keep the app backend-agnostic so frontend work can continue while APIs evolve.

## Non-negotiables

- Keep desktop and mobile both first-class.
- Avoid adding a persistent sidebar unless the user explicitly asks for it.
- Use bright surfaces, soft borders, generous spacing, and restrained shadows.
- Avoid purple-heavy themes and avoid dark-mode-first styling for this MVP.
- Keep motion subtle and useful (state transitions, not decoration).

## Required workflow

1. Read `AGENTS.md` and this skill.
2. Read `references/workstream-question-packs.md`.
3. Ask the user the exact workstream question set before coding.
4. Wait for answers, then restate accepted direction in 4-8 bullets.
5. Implement only within the assigned workstream file boundaries.
6. Run a quick manual UX pass for loading, empty, success, and error states.
7. Report what changed and what remains open.

## Branch safety workflow

1. Run preflight before editing:
   - `pwd`
   - `git branch --show-current`
   - `git status --short`
2. Confirm you are on the intended worktree branch.
3. If working tree is unexpectedly dirty, stop and ask the user.
4. Before commit, run scope check:
   - `git diff --name-only`
5. If out-of-scope files appear, remove those edits or ask user before proceeding.

## Scope guards

- Frontend workstreams may edit only files in `public/` unless explicitly approved.
- Do not modify `src/` from frontend workstreams.
- Never commit runtime data artifacts such as `data/*.db-*`.

## Design rules

- Hierarchy:
  - One primary action per surface.
  - Reduce competing emphasis.
  - Keep secondary actions quiet but discoverable.
- Composer-first interaction:
  - Give the main input area prominent placement and whitespace.
  - Delay advanced controls until needed.
- Citation trust:
  - Always show citations next to answers.
  - Keep citation labels stable (`N1`, `N2`, ...).
  - Make source metadata readable without clutter.
- Copy tone:
  - Use short, direct sentences.
  - Use concrete status text (`Saving...`, `Searching...`, `Generating answer...`).
- Accessibility:
  - Preserve keyboard navigation.
  - Preserve visible focus states.
  - Keep color contrast strong on text and controls.

## Implementation guardrails

- Keep backend response handling behind an adapter function in frontend code.
- Do not block UX improvements on backend endpoint completion.
- Prefer additive, modular CSS/JS changes over broad rewrites during rapid iteration.
- Preserve existing fallback behavior for heuristic mode.

## Done criteria

- The assigned surface feels cohesive with the design rules.
- Interaction states are explicit and readable.
- Responsive behavior is stable at narrow widths.
- No regressions in existing capture/search/chat flows.
