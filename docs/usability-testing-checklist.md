# Stash Usability Testing Checklist

Use this checklist for manual end-to-end testing of the web app as a collaborative human + agent workspace.

## Test Setup

- [ ] `.env` is configured with `DB_PROVIDER=postgres`, valid Neon `DATABASE_URL`, and `AUTH_PROVIDER=neon`.
- [ ] `NEON_AUTH_BASE_URL` is set.
- [ ] Migrations and schema checks pass:
  - [ ] `npm run db:migrate:pg`
  - [ ] `npm run db:verify:pg`
- [ ] App starts locally: `PORT=8787 npm run dev`
- [ ] Baseline automated tests pass: `npm test`

## 1) Auth and Session

- [ ] Sign up with a new email from the website.
- [ ] Sign out and sign back in.
- [ ] Invalid password shows a clear error and does not sign in.
- [ ] Session persists on page refresh.
- [ ] Password reset request returns success behavior.

## 2) Capture and Folder Behavior

- [ ] Create a folder from UI.
- [ ] Save a text note inside that folder.
- [ ] Save a link inside that folder.
- [ ] Save an image/file inside that folder.
- [ ] After enrichment completes, each item remains in the selected folder.
- [ ] Refresh page and confirm folder assignment is unchanged.
- [ ] While an item is `enriching`, move it to another folder and confirm final folder remains your latest choice.

## 3) Agent Actions (Website Chat)

- [ ] Ask agent to create a new folder.
- [ ] Ask agent to add items to a specific folder by name.
- [ ] Ask agent to update an item's content.
- [ ] Ask agent to replace/update an item's attachment.
- [ ] Ask agent to move an item to another folder.
- [ ] Ask agent to move an item during enrichment and confirm it is not moved back after enrichment finishes.
- [ ] Ask agent to create a file in a folder and confirm the app opens that item view automatically.
- [ ] Confirm actions appear in UI and persist after refresh.

## 3.1) Context-Aware Agent Targeting

- [ ] From an item page, ask: `retitle this note to <new title>` and confirm the current item title updates (no manual ID needed).
- [ ] From an item page, ask: `add a section called Next Steps` and confirm the current item content updates.
- [ ] From a folder page, ask: `create a note in this folder called <name>` and confirm the note is created in the current folder.
- [ ] From a folder page, ask: `search notes about <topic> in this folder` and confirm results are folder-scoped.
- [ ] Ask an action using a citation label (for example `update [N1]`) and confirm the action applies to the cited item, not a literal `N1` id.
- [ ] Confirm assistant responses reference item/folder names and avoid exposing raw internal IDs in normal flows.

## 3.2) Live File Editing

- [ ] Open a file item and confirm content is directly editable without entering edit mode.
- [ ] Type continuously for 10+ seconds and verify autosave status transitions (`Unsaved` -> `Saving` -> `All changes saved`).
- [ ] Refresh and confirm latest file text persists.
- [ ] Keep a file open, ask chat agent to edit the same file, and verify remote update is applied (or deferred until local draft save).

## 4) Search, Context, and Chat Grounding

- [ ] Search returns recently saved items by keyword.
- [ ] Folder-scoped search does not leak unrelated folder content.
- [ ] Ask a question in chat and verify cited items are relevant.
- [ ] Open citations and verify they match the answer claims.

## 5) Collaboration

- [ ] Use two accounts (normal + incognito).
- [ ] Invite account B to workspace and accept invite.
- [ ] Share one folder with B as `viewer` and verify read-only behavior.
- [ ] Change B to `editor` and verify write access works.
- [ ] Remove B and verify access is revoked.

## 6) Activity and Live Updates

- [ ] Open folder activity panel.
- [ ] Create/edit/delete notes and verify activity entries appear.
- [ ] Share/unshare folder and verify activity entries appear.
- [ ] Keep two tabs open and verify live updates appear without reload.

## 7) Versioning and Recovery

- [ ] Edit a note multiple times.
- [ ] Open version history and restore an older version.
- [ ] Verify restored content is correct.
- [ ] Retry enrichment on a note and confirm no data loss.

## 8) Edge Cases

- [ ] Upload unsupported/binary file and confirm graceful handling.
- [ ] Very large text input still saves without UI breakage.
- [ ] API/network interruption shows recoverable UI errors.
- [ ] Deleting a folder with items behaves as expected (confirm prompt + result).

## 9) Multi-User Data Isolation

- [ ] Account A cannot see private items from account B unless shared.
- [ ] Stats/export for account A do not include account B private data.

## Exit Criteria

- [ ] No folder drift after enrichment for explicitly assigned items.
- [ ] Agent-created/edited items are visible and stable in UI.
- [ ] Collaboration roles enforce expected read/write boundaries.
- [ ] Chat answers remain grounded with correct citations.
