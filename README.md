# Stash

AI-powered personal memory with:

- Web UI for capture/search/chat
- Postgres runtime backend
- OpenAI enrichment + embeddings (with heuristic fallback)
- MCP stdio server for Codex/ChatGPT tool access
- OpenClaw command-tool bridge

## Why this architecture

- Managed Postgres runtime for scalable multi-user storage
- One shared service layer feeds web + MCP + OpenClaw

## Project structure

- `src/server.js`: web server + API + static UI hosting
- `src/memoryService.js`: save/search/context/chat/file extraction logic
- `src/openai.js`: Responses + Embeddings API wrappers
- `mcp/server.js`: MCP stdio server exposing memory tools
- `openclaw/bridge.js`: command bridge for OpenClaw tools
- `openclaw/tools.manifest.json`: OpenClaw tool schema reference

## Quick start

1. Create `.env` from `.env.example`.
2. Configure Postgres:
   - `DB_PROVIDER=postgres`
   - `DATABASE_URL=postgres://...`
3. Set `OPENAI_API_KEY` (optional).
4. Choose auth mode:
   - Local auth (default): `AUTH_PROVIDER=local`
   - Firebase auth: `AUTH_PROVIDER=firebase` plus Firebase env vars (below)
5. Apply schema migrations:

```bash
npm run db:migrate:pg
npm run db:verify:pg
```

6. Start web app:

```bash
npm run dev
```

7. Open `http://localhost:8787`.
8. Create an account or sign in from the web auth screen (email + password). A personal workspace is created/used automatically.

## Postgres setup

Stash now runs directly on Postgres:

```bash
export DB_PROVIDER=postgres
export DATABASE_URL='postgres://user:pass@localhost:5432/stash'
npm run db:migrate:pg
npm run db:verify:pg
```

## Auth configuration

### Local mode (default)

No extra setup required. The app handles email/password and stores auth/session data in Postgres.

### Firebase mode

Set these in `.env`:

```bash
AUTH_PROVIDER=firebase
AUTH_REQUIRE_EMAIL_VERIFICATION=true
FIREBASE_WEB_API_KEY=your_web_api_key
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/path/to/service-account.json
```

`FIREBASE_SERVICE_ACCOUNT_JSON` can be used instead of `FIREBASE_SERVICE_ACCOUNT_PATH`.
With `AUTH_REQUIRE_EMAIL_VERIFICATION=true`, unverified users can sign in but cannot access app data until verified.

## Auth (API)

Most `/api/*` routes require a session token.

1. Sign up (first time):

```bash
curl -s -X POST http://localhost:8787/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","name":"Your Name","password":"supersecure123"}'
```

2. Sign in (returning user):

```bash
curl -s -X POST http://localhost:8787/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"supersecure123"}'
```

3. Use the returned `session.token` in requests:

```bash
curl -s http://localhost:8787/api/notes \
  -H 'Authorization: Bearer <session_token>'
```

4. Password reset request:

```bash
curl -s -X POST http://localhost:8787/api/auth/password-reset \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

5. Resend verification email (Firebase mode, requires auth token):

```bash
curl -s -X POST http://localhost:8787/api/auth/email-verification/send \
  -H 'Authorization: Bearer <session_token>'
```

## MCP server (Codex/ChatGPT)

MCP tool calls require auth. Configure a valid session token from `POST /api/auth/login` or `POST /api/auth/signup`.

Run:

```bash
export STASH_SESSION_TOKEN='<session_token>'
# optional: pin to a specific workspace membership
export STASH_WORKSPACE_ID='<workspace_id>'
npm run start:mcp
```

Canonical tools:

- `search_notes` (BM25 ranking)
- `get_tasks`
- `obtain_consolidated_memory_file`
- `complete_task`
- `delete_note`
- `delete_project`

Example Codex MCP config snippet:

```json
{
  "mcpServers": {
    "stash": {
      "command": "node",
      "args": ["/absolute/path/to/Hackathon/mcp/server.js"],
      "env": {
        "STASH_SESSION_TOKEN": "sess_...",
        "STASH_WORKSPACE_ID": "ws_..."
      }
    }
  }
}
```

## OpenClaw integration prep

Run a tool directly:

```bash
export STASH_SESSION_TOKEN='<session_token>'
# optional
export STASH_WORKSPACE_ID='<workspace_id>'
node openclaw/bridge.js search_notes '{"query":"onboarding plan"}'
```

Manifest is at `openclaw/tools.manifest.json`.

## API endpoints

- `GET /api/health`
- `POST /api/auth/signup` (body: `email`, optional `name`, `password`)
- `POST /api/auth/login` (body: `email`, `password`)
- `POST /api/auth/password-reset` (body: `email`)
- `POST /api/auth/email-verification/send` (Firebase mode, requires auth)
- `POST /api/auth/password-change` (body: `currentPassword`, `newPassword`; `currentPassword` required for local mode)
- `POST /api/auth/signout-all`
- `DELETE /api/auth/account` (body: `password` required for local mode)
- `POST /api/auth/refresh` (body: `refreshToken`, Firebase mode)
- `GET /api/auth/session` (requires auth)
- `GET /api/auth/audit?limit=` (workspace owner/admin)
- `GET /api/workspaces` (workspace memberships)
- `GET /api/workspaces/invites?status=&limit=` (workspace owner/admin)
- `POST /api/workspaces/invites` (body: `email`, optional `role`, `expiresInHours`; workspace owner/admin)
- `DELETE /api/workspaces/invites/:inviteId` (workspace owner/admin)
- `GET /api/workspaces/invites/incoming?limit=`
- `POST /api/workspaces/invites/:token/accept`
- `GET /api/notes?query=&project=&limit=`
- `POST /api/notes` (body: `content`, `sourceType`, `sourceUrl`, `imageDataUrl`, `fileDataUrl`, `fileName`, `fileMimeType`, `project`)
- `DELETE /api/notes/:id`
- `POST /api/chat` (body: `question`, `project`, `limit`)
- `POST /api/context` (body: `task`, `project`, `limit`)
- `GET /api/projects`
- `DELETE /api/projects/:project`
- `GET /api/recent?limit=`
- `GET /api/tasks?status=open`
- `POST /api/tasks` (body: `title`, `status`)

Use `X-Workspace-Id: <workspace_id>` to scope API calls to a specific workspace membership.

## Notes on input types

- UI supports text/link/image/file capture.
- File/image uploads are sent as Data URLs and stored in note metadata.
- With `OPENAI_API_KEY`, uploads are parsed into `raw_content` + `markdown_content`.
- Without `OPENAI_API_KEY`, uploads still save, and text-like files use a local text extraction fallback.
- Binary uploads are saved with metadata and can still be cited/search-ranked via note content/summary/project/tags.
- Image binaries are stored under `data/uploads/`.

## Helpful scripts

- `npm run test:mcp-client`: MCP smoke test client
  - requires `STASH_SESSION_TOKEN` (and optional `STASH_WORKSPACE_ID`)
- `npm run import:keep -- /path/to/Takeout`: import Google Keep JSON exports
- `npm run db:migrate:pg`: apply Postgres migrations
- `npm run db:verify:pg`: verify required Postgres tables/indexes

## Suggested walkthrough

1. Save a mix of note + link + screenshot/file.
2. Show auto summary/tags/project assignment.
3. Ask a grounded question and show citations.
4. Call the same memory tools via MCP and OpenClaw.
