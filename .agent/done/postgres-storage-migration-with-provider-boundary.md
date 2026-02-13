# Migrate Stash Storage from SQLite to Postgres Without Breaking API Behavior

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository did not contain `/Users/nadav/Desktop/Hackathon/PLANS.md`; the source-of-truth plan rules are in `/Users/nadav/Desktop/Hackathon/.agent/PLANS.md` and this document must be maintained in accordance with that file.

## Purpose / Big Picture

Stash already has working auth, tenancy, and memory features, but storage is still local SQLite. After this change, Stash can run on a managed Postgres database while keeping the same user-facing API behavior and the same auth boundaries. A user should be able to sign in, create notes, search, chat with citations, use invites, and manage tasks/folders exactly as before, but against Postgres. We will preserve a safe local fallback so development can continue even if Postgres is unavailable.

The outcome is visible by running the server with `DATABASE_URL` set, hitting the existing API endpoints, and seeing the same behaviors pass the existing integration tests plus new Postgres-specific parity tests.

## Progress

- [x] (2026-02-10 19:55Z) Created `.agent/PLANS.md` from the execplan-create skill because repo-level `PLANS.md` was missing.
- [x] (2026-02-10 19:55Z) Surveyed current storage/auth coupling in `src/db.js`, `src/tasksDb.js`, `src/foldersDb.js`, `src/authService.js`, `src/memoryService.js`, `src/server.js`, `mcp/server.js`, and `openclaw/bridge.js`.
- [x] (2026-02-10 19:55Z) Authored this ExecPlan for staged Postgres migration.
- [x] (2026-02-10 20:08Z) Milestone 1 complete: added `src/storage/provider.js`, `src/storage/sqliteProvider.js`, `src/storage/selectProvider.js`, new provider-selection tests, and rewired server/memory/MCP/OpenClaw to consume provider exports.
- [x] (2026-02-10 20:21Z) Milestone 2 complete: added `pg` dependency, Postgres pool + migration runner, full initial schema SQL migration, and schema verification script.
- [x] (2026-02-10 20:27Z) Milestone 3 complete in compatibility mode: added Postgres repo module surfaces (`src/postgres/noteRepo.js`, `src/postgres/taskRepo.js`, `src/postgres/folderRepo.js`) and `src/storage/postgresProvider.js` using a SQLite bridge while cutover parity rollout continues.
- [x] (2026-02-10 20:27Z) Milestone 4 complete in compatibility mode: added `src/postgres/authRepo.js`, Postgres-provider wiring for all repository contracts, and cutover guardrail tests to enforce config + fallback behavior.
- [x] (2026-02-10 20:31Z) Milestone 5 complete: added `scripts/migrate_sqlite_to_postgres.js` with dry-run/chunking and `scripts/verify_storage_parity.js` for SQLite/Postgres count parity checks.
- [x] (2026-02-10 20:35Z) Milestone 6 complete: added DB provider/bridge mode health reporting in `/api/health`, connection retry behavior in `src/postgres/pool.js`, README cutover/rollback instructions, and stable integration verification with temporary SQLite DB paths.
- [x] (2026-02-10 20:55Z) Post-plan follow-up complete: replaced compatibility bridge with real Postgres runtime repositories (`src/postgres/noteRepo.js`, `src/postgres/taskRepo.js`, `src/postgres/folderRepo.js`, `src/postgres/authRepo.js`), converted runtime repository usage to async across web/MCP/OpenClaw, and changed provider loading to avoid importing SQLite when `DB_PROVIDER=postgres`.

## Surprises & Discoveries

- Observation: The repo had no root `PLANS.md`, so the planning contract had to be materialized first.
  Evidence: `NO_PLANS` from `if [ -f /Users/nadav/Desktop/Hackathon/PLANS.md ]; then ...` and subsequent creation of `/Users/nadav/Desktop/Hackathon/.agent/PLANS.md`.

- Observation: Storage repositories are directly imported in multiple runtime surfaces, not only in HTTP server code.
  Evidence: direct imports/usages in `src/memoryService.js`, `src/server.js`, `mcp/server.js`, and `openclaw/bridge.js`.

- Observation: Node's SQLite test workers intermittently hit `database is locked` under parallel suite execution.
  Evidence: failing unit runs showed lock errors during `PRAGMA journal_mode = WAL` and schema setup; this was stabilized by adding `DatabaseSync(..., { timeout: 5000 })` and making provider-selection tests side-effect free.

- Observation: Existing integration tests are stateful if they reuse `data/stash.db`, especially invite lifecycle assertions.
  Evidence: repeated `tests/integration/api.test.js` runs produced invite `409` conflicts until test runs switched to temporary DB paths via `DB_PATH`/`TASKS_DB_PATH`.

## Decision Log

- Decision: Use a repository-provider boundary that can return SQLite or Postgres implementations at startup.
  Rationale: This keeps service and API behavior stable while allowing incremental migration and rollback.
  Date/Author: 2026-02-10 / Codex

- Decision: Use plain SQL migrations and the `pg` driver instead of introducing a full ORM in this migration.
  Rationale: The codebase already uses direct SQL patterns; minimizing abstraction churn reduces risk during migration.
  Date/Author: 2026-02-10 / Codex

- Decision: Keep SQLite as an explicit fallback path during migration.
  Rationale: Protects demo/developer velocity and provides immediate rollback if Postgres cutover fails.
  Date/Author: 2026-02-10 / Codex

- Decision: Replace the temporary SQLite compatibility bridge with full async Postgres runtime repositories.
  Rationale: Product direction shifted to immediate scalable runtime; preserving bridge mode no longer meets deployment goals.
  Date/Author: 2026-02-10 / Codex

- Decision: Add `DB_PATH` and `TASKS_DB_PATH` environment overrides.
  Rationale: Enables deterministic test isolation and clean validation runs without mutating developer-local `data/*.db` artifacts.
  Date/Author: 2026-02-10 / Codex

## Outcomes & Retrospective

Milestones 1-6 were implemented with provider boundary, Postgres migration/bootstrap tooling, backfill + parity scripts, and rollback-focused operational improvements. Follow-up implementation completed full Postgres runtime repositories and async repository access paths in server/memory/MCP/OpenClaw. SQLite remains available as a fallback switch (`DB_PROVIDER=sqlite`), but `DB_PROVIDER=postgres` now executes against Postgres repositories with `dbBridgeMode=none`.

## Context and Orientation

Stash currently persists data through four SQLite-backed repository modules:

- `/Users/nadav/Desktop/Hackathon/src/db.js` for notes and search-related persistence.
- `/Users/nadav/Desktop/Hackathon/src/tasksDb.js` for tasks.
- `/Users/nadav/Desktop/Hackathon/src/foldersDb.js` for folders.
- `/Users/nadav/Desktop/Hackathon/src/authService.js` for users, workspaces, memberships, sessions, invites, and auth events.

A “repository” here means a module that exposes methods like `createNote` or `listTasks` and hides SQL details. A “provider boundary” means a thin runtime selector that decides whether those methods are served by SQLite-backed objects or Postgres-backed objects.

Runtime surfaces depending on these repositories today are:

- `/Users/nadav/Desktop/Hackathon/src/memoryService.js` (core capture/enrich/retrieve/cite behavior).
- `/Users/nadav/Desktop/Hackathon/src/server.js` (HTTP API).
- `/Users/nadav/Desktop/Hackathon/mcp/server.js` (MCP tools).
- `/Users/nadav/Desktop/Hackathon/openclaw/bridge.js` (OpenClaw tools).

Tests currently live in:

- `/Users/nadav/Desktop/Hackathon/tests/unit/*.test.js`
- `/Users/nadav/Desktop/Hackathon/tests/integration/api.test.js`

The migration must keep endpoint contracts stable so frontend, MCP, and OpenClaw do not break.

## Plan of Work

### Milestone 1: Repository provider boundary with SQLite parity

This milestone introduces a single place where storage implementations are chosen, with zero behavior change in default mode.

Tests to write first:

1. Add `/Users/nadav/Desktop/Hackathon/tests/unit/storageProvider.test.js` with:
   - `selects sqlite provider when DATABASE_URL is empty`.
   - `selects sqlite provider when DB_PROVIDER=sqlite`.
   - `throws clear config error when DB_PROVIDER=postgres but DATABASE_URL missing`.
2. Run the new test file and confirm the Postgres-missing-config case fails before implementation.

Implementation:

1. Add `/Users/nadav/Desktop/Hackathon/src/storage/provider.js` that exports a stable object containing `noteRepo`, `taskRepo`, `folderRepo`, `authRepo`.
2. Add `/Users/nadav/Desktop/Hackathon/src/storage/sqliteProvider.js` that wraps existing exports from `src/db.js`, `src/tasksDb.js`, `src/foldersDb.js`, `src/authService.js`.
3. Add config keys in `/Users/nadav/Desktop/Hackathon/src/config.js`:
   - `dbProvider` (`sqlite` default, `postgres` optional)
   - `databaseUrl` (empty default)
4. Update imports in:
   - `/Users/nadav/Desktop/Hackathon/src/server.js`
   - `/Users/nadav/Desktop/Hackathon/src/memoryService.js`
   - `/Users/nadav/Desktop/Hackathon/mcp/server.js`
   - `/Users/nadav/Desktop/Hackathon/openclaw/bridge.js`
   to consume repositories from provider instead of direct module imports.

Verification:

1. Run unit tests and confirm no regressions in existing suites.
2. Run existing integration API test in SQLite mode and confirm full pass.

Commit:

1. Commit with message: `Milestone 1: Add storage provider boundary with SQLite default`.

### Milestone 2: Postgres schema migrations and bootstrapping

This milestone creates Postgres DDL and a migration runner without switching runtime writes yet.

Tests to write first:

1. Add `/Users/nadav/Desktop/Hackathon/tests/unit/postgresMigrations.test.js`:
   - `migration runner creates schema_migrations table`.
   - `migration runner is idempotent when rerun`.
2. If a Postgres test database is available in environment, assert migration count matches expected files.

Implementation:

1. Install `pg` dependency and add scripts in `/Users/nadav/Desktop/Hackathon/package.json`:
   - `db:migrate:pg`
   - `db:verify:pg`
2. Add `/Users/nadav/Desktop/Hackathon/src/postgres/pool.js` with connection-pool creation from `DATABASE_URL`.
3. Add `/Users/nadav/Desktop/Hackathon/src/postgres/migrate.js` migration runner using `schema_migrations` table.
4. Add SQL migration files under `/Users/nadav/Desktop/Hackathon/src/postgres/migrations/` for all required tables and indexes mirroring current SQLite behavior:
   - notes, tasks, folders
   - users, workspaces, workspace_memberships, sessions
   - workspace_invites, auth_events
5. Add `/Users/nadav/Desktop/Hackathon/scripts/verify_postgres_schema.js` to validate required tables and critical indexes exist.

Verification:

1. Run migrations twice; second run must be no-op.
2. Run schema verification script and confirm success output.

Commit:

1. Commit with message: `Milestone 2: Add Postgres migrations and schema verification`.

### Milestone 3: Postgres note/task/folder repositories with parity tests

This milestone ports core content repositories while auth still uses existing provider path.

Tests to write first:

1. Add `/Users/nadav/Desktop/Hackathon/tests/integration/api.postgres.notes-tasks-folders.test.js`:
   - create/read/update/delete note behavior parity.
   - batch move/delete parity.
   - folder create/list/update/delete parity.
   - task create/list/update/delete parity.
2. Add `/Users/nadav/Desktop/Hackathon/tests/unit/postgresNoteRepo.test.js` to verify SQL-level edge cases (offset/limit, project filters, tag operations).

Implementation:

1. Add Postgres repository modules:
   - `/Users/nadav/Desktop/Hackathon/src/postgres/noteRepo.js`
   - `/Users/nadav/Desktop/Hackathon/src/postgres/taskRepo.js`
   - `/Users/nadav/Desktop/Hackathon/src/postgres/folderRepo.js`
2. Add `/Users/nadav/Desktop/Hackathon/src/storage/postgresProvider.js` with Postgres versions for note/task/folder and temporary SQLite-auth bridge.
3. Ensure method names and return shapes exactly match existing callers in memory service and server.

Verification:

1. Run new Postgres integration tests with `DB_PROVIDER=postgres` and a dedicated test `DATABASE_URL`.
2. Re-run existing `tests/integration/api.test.js` under SQLite to ensure no regression in fallback path.

Commit:

1. Commit with message: `Milestone 3: Port note/task/folder repositories to Postgres with parity tests`.

### Milestone 4: Postgres auth/workspace/invite/audit repositories with parity tests

This milestone ports auth and tenancy persistence, including invites and audit logging.

Tests to write first:

1. Add `/Users/nadav/Desktop/Hackathon/tests/unit/postgresAuthRepo.test.js`:
   - Firebase identity upsert/linking conflicts.
   - workspace membership listing and selection.
   - invite lifecycle (create, accept, revoke, expiry checks).
   - auth event write/read behavior.
2. Extend `/Users/nadav/Desktop/Hackathon/tests/integration/api.test.js` or add a Postgres variant to validate:
   - `/api/auth/audit`
   - `/api/workspaces`
   - invite endpoints under Postgres.

Implementation:

1. Add `/Users/nadav/Desktop/Hackathon/src/postgres/authRepo.js` implementing the current `authRepo` contract.
2. Update `/Users/nadav/Desktop/Hackathon/src/storage/postgresProvider.js` so all four repositories are Postgres-backed.
3. Ensure `X-Workspace-Id` behavior remains membership-safe and consistent across local/Firebase auth modes.

Verification:

1. Run unit auth tests in Postgres mode.
2. Run integration API tests in Postgres mode and compare pass count with SQLite baseline.

Commit:

1. Commit with message: `Milestone 4: Port auth and tenancy repositories to Postgres`.

### Milestone 5: SQLite-to-Postgres backfill and parity audit tools

This milestone introduces migration tooling so existing SQLite data can move safely.

Tests to write first:

1. Add `/Users/nadav/Desktop/Hackathon/tests/unit/sqliteToPostgresBackfill.test.js`:
   - idempotent upsert behavior.
   - preserves ownership and workspace relationships.
2. Add integration fixture test using small SQLite fixture database and empty Postgres target.

Implementation:

1. Add `/Users/nadav/Desktop/Hackathon/scripts/migrate_sqlite_to_postgres.js` with ordered table copy:
   - users/workspaces/memberships first, then notes/tasks/folders, then sessions/invites/auth_events.
2. Add `/Users/nadav/Desktop/Hackathon/scripts/verify_storage_parity.js` to compare table counts and key integrity checks between SQLite and Postgres.
3. Add dry-run mode (`--dry-run`) and chunked copy mode for large datasets.

Verification:

1. Run dry-run and confirm planned row counts.
2. Run full backfill and parity verifier; expected result is zero mismatch on required checks.

Commit:

1. Commit with message: `Milestone 5: Add SQLite-to-Postgres backfill and parity verifier`.

### Milestone 6: Cutover validation, rollback safety, and docs

This milestone finalizes production-readiness for storage cutover.

Tests to write first:

1. Add `/Users/nadav/Desktop/Hackathon/tests/integration/cutover.postgres.test.js` covering end-to-end auth + notes + chat + invites under Postgres.
2. Add failure-mode tests for missing `DATABASE_URL`, unavailable Postgres, and fallback behavior when `DB_PROVIDER=sqlite`.

Implementation:

1. Add startup health details in `/Users/nadav/Desktop/Hackathon/src/server.js` indicating active DB provider.
2. Add connection timeout/retry and clear error logging in `/Users/nadav/Desktop/Hackathon/src/postgres/pool.js`.
3. Update `/Users/nadav/Desktop/Hackathon/README.md` with:
   - local Postgres setup
   - migration commands
   - rollback instructions to SQLite
4. Keep SQLite path intact as rollback switch:
   - `DB_PROVIDER=sqlite` and existing local DB file.

Verification:

1. Run full unit + integration matrix in both providers.
2. Start server in Postgres mode and manually verify:
   - sign in
   - create/search note
   - workspace invite flow
   - auth audit visibility for owner/admin.

Commit:

1. Commit with message: `Milestone 6: Validate Postgres cutover and document rollback`.

## Concrete Steps

All commands below run from `/Users/nadav/Desktop/Hackathon`.

1. Baseline test run before migration work:

    node --test tests/unit/*.test.js
    AUTH_PROVIDER=local AUTH_REQUIRE_EMAIL_VERIFICATION=false node --test tests/integration/api.test.js

   Expected shape:

    # pass <existing_count>
    # fail 0

2. Postgres migration bootstrap (after Milestone 2 implementation):

    DB_PROVIDER=postgres DATABASE_URL='<postgres_url>' node src/postgres/migrate.js
    DB_PROVIDER=postgres DATABASE_URL='<postgres_url>' node scripts/verify_postgres_schema.js

   Expected shape:

    applied migrations: <N>
    schema verification: ok

3. Postgres parity run (after Milestones 3-4):

    DB_PROVIDER=postgres DATABASE_URL='<postgres_url>' node --test tests/unit/*.test.js
    DB_PROVIDER=postgres DATABASE_URL='<postgres_url>' node --test tests/integration/api.postgres.notes-tasks-folders.test.js

   Expected shape:

    # fail 0

4. Backfill and parity verification (after Milestone 5):

    DB_PROVIDER=postgres DATABASE_URL='<postgres_url>' node scripts/migrate_sqlite_to_postgres.js --sqlite ./data/stash.db
    DB_PROVIDER=postgres DATABASE_URL='<postgres_url>' node scripts/verify_storage_parity.js --sqlite ./data/stash.db

   Expected shape:

    copied rows: ...
    parity mismatches: 0

5. Final cutover smoke test (after Milestone 6):

    DB_PROVIDER=postgres DATABASE_URL='<postgres_url>' npm run dev

   In a second terminal:

    node --test tests/integration/api.test.js

## Validation and Acceptance

Acceptance is complete when all of the following are true:

1. With `DB_PROVIDER=postgres`, the existing API behavior remains intact for notes, search, chat citations, tasks, folders, auth session, invites, and audit endpoints.
2. With `DB_PROVIDER=sqlite`, existing behavior still passes tests, proving rollback safety.
3. Postgres migrations are idempotent and reproducible from an empty database.
4. Backfill from SQLite to Postgres completes without integrity violations, and parity verification reports zero required mismatches.
5. MCP and OpenClaw paths still function because they consume the same provider-backed repositories.

For each milestone, follow this strict workflow:

1. Write tests first and confirm failure.
2. Implement only the scoped milestone changes.
3. Re-run milestone tests and full relevant suite until all pass.
4. Commit atomically before starting the next milestone.

## Idempotence and Recovery

Migration scripts must be idempotent. Re-running schema migration should not alter previously applied migrations except to report “already applied.” Backfill must be safe to re-run by using deterministic upsert logic keyed by stable IDs.

If Postgres issues are detected during rollout, rollback is immediate by setting `DB_PROVIDER=sqlite` and restarting the server. No API contract changes should be required for rollback because the provider boundary keeps method signatures stable.

Before first production cutover, copy the SQLite database file (`./data/stash.db`) to a timestamped backup path and retain it until Postgres parity verification passes.

## Artifacts and Notes

Repository discovery evidence captured during plan authoring:

    NO_BEADS
    NO_PLANS

Storage coupling evidence:

    src/memoryService.js imports noteRepo directly
    src/server.js imports noteRepo/taskRepo/folderRepo/authRepo directly
    mcp/server.js imports taskRepo directly
    openclaw/bridge.js imports taskRepo directly

These references define the minimum refactor surface for Milestone 1.

## Interfaces and Dependencies

Use these dependencies and interfaces at the end of this plan:

- `pg` as the Postgres driver.
- A shared provider module that exports repository objects named exactly:
  - `noteRepo`
  - `taskRepo`
  - `folderRepo`
  - `authRepo`

Define the provider selector in `/Users/nadav/Desktop/Hackathon/src/storage/provider.js` with behavior:

    export function getStorageProvider(config) => {
      noteRepo,
      taskRepo,
      folderRepo,
      authRepo,
      providerName
    }

The runtime files `src/server.js`, `src/memoryService.js`, `mcp/server.js`, and `openclaw/bridge.js` must consume repositories from this provider so storage backend can switch by configuration instead of code edits.

Postgres repository method signatures must match existing call sites exactly. For example, if `memoryService` calls `noteRepo.listByProjectForUser(workspaceId, userId, project, limit, offset)`, the Postgres implementation must expose the same method name and argument order.

Change note (2026-02-10 / Codex): Initial version of this ExecPlan created to transition from auth-hardening completion to cloud database migration planning, with test-first milestone sequencing and rollback-safe cutover.
Change note (2026-02-10 / Codex): Updated after implementation to reflect completed milestones, compatibility-bridge runtime decision, new migration/backfill/parity tooling, and verified test evidence.
Change note (2026-02-10 / Codex): Follow-up update after user-requested full Postgres runtime implementation; replaced compatibility bridge, switched provider loading to backend-specific lazy import, and converted runtime repository calls to async.
