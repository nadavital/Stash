# Acceptance Checklists

Use the relevant checklist before handoff.

## Global UX

- Core loop (`capture -> enrich -> retrieve -> cite`) remains obvious.
- Loading, empty, success, and error states are visibly distinct.
- Layout is stable on narrow screens.
- Heuristic mode remains understandable when OpenAI is unavailable.

## Shell and layout

- Primary action is obvious in first viewport.
- Secondary controls do not overpower main tasks.
- Spacing rhythm is consistent across sections.
- Header/status treatments remain readable at small widths.

## Capture

- Capture input behavior is predictable for text/link/image.
- Image preview behavior is reliable.
- Validation and recovery messages are actionable.
- Save action gives immediate feedback and resolves cleanly.

## Memory stream

- Search/filter controls are discoverable and responsive.
- Result cards maintain readability at high density.
- Empty search state gives a clear next action.
- Metadata hierarchy supports quick scanning.

## Ask and citations

- Answer area communicates generation state clearly.
- Citations are always present when claims are shown.
- Citation cards are readable and mapped to answer labels.
- No-answer paths are explicit and helpful.

## Polish

- Motion is subtle and purposeful.
- Focus states remain visible for keyboard users.
- Contrast remains strong for text, inputs, and buttons.
- UI feels cohesive with one visual language.

## Branch hygiene

- `git diff --name-only` contains only workstream-owned files.
- No `data/*.db-*` artifacts are staged.
- No `src/` files are changed in frontend-only workstreams.
