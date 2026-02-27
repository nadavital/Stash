# Stash

AI-powered personal memory with:

- Web UI for capture/search/chat
- Postgres runtime backend
- OpenAI enrichment + embeddings (with heuristic fallback)

## Why this architecture

- Managed Postgres runtime for scalable multi-user storage
- One shared service layer feeds web + API + chat workflows

## Project structure

- `src/server.js`: web server + API + static UI hosting
- `src/memoryService.js`: save/search/context/chat/file extraction logic
- `src/openai.js`: Responses + Embeddings API wrappers

## Quick start

1. Create `.env` from `.env.example`.
2. Configure Postgres:
   - `DB_PROVIDER=postgres`
   - `DATABASE_URL=postgres://...` (or `NEON_DATABASE_URL=postgres://...`)
3. Set `OPENAI_API_KEY` (optional).
4. Choose auth mode:
   - Local auth (default): `AUTH_PROVIDER=local`
   - Firebase auth: `AUTH_PROVIDER=firebase` plus Firebase env vars (below)
   - Neon auth: `AUTH_PROVIDER=neon` plus Neon auth env vars (below)
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

## Neon setup (recommended)

1. Create a Neon project and copy the Postgres connection string.
2. Set env vars:

```bash
export DB_PROVIDER=postgres
export NEON_DATABASE_URL='postgres://user:pass@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require'
```

3. Run setup (migrate + verify):

```bash
npm run db:setup:neon
```

For cloud Postgres (Neon/Supabase/RDS/Render, etc), set `DATABASE_URL` from your provider and enable SSL:

```bash
export DB_PROVIDER=postgres
export DATABASE_URL='postgres://user:pass@host:5432/dbname'
export PG_SSL_MODE=require
# Optional: pin CA bundle for strict verification
# export PG_SSL_CA_PATH='/absolute/path/to/ca.pem'
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

### Neon mode

Set these in `.env`:

```bash
AUTH_PROVIDER=neon
AUTH_REQUIRE_EMAIL_VERIFICATION=true
NEON_AUTH_BASE_URL=https://your-neon-auth-domain
# optional, defaults to NEON_AUTH_BASE_URL
# NEON_AUTH_ISSUER=https://your-neon-auth-domain
# NEON_AUTH_AUDIENCE=https://your-neon-auth-domain
```

In Neon mode, this backend verifies bearer JWTs via JWKS at
`$NEON_AUTH_BASE_URL/.well-known/jwks.json`.
Email/password routes (`/api/auth/login`, `/api/auth/signup`, `/api/auth/password-reset`) proxy to Neon Auth.
`/api/auth/refresh` remains Firebase-only.

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

## API endpoints

- `GET /api/health`
- `POST /api/auth/signup` (body: `email`, optional `name`, `password`)
- `POST /api/auth/login` (body: `email`, `password`)
- `POST /api/auth/password-reset` (body: `email`, Firebase or Neon mode)
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

- `npm test`: unit + API/auth/storage integration tests (requires `DATABASE_URL`)
- `npm run import:keep -- /path/to/Takeout`: import Google Keep JSON exports
- `npm run db:migrate:pg`: apply Postgres migrations
- `npm run db:verify:pg`: verify required Postgres tables/indexes

## Suggested walkthrough

1. Save a mix of note + link + screenshot/file.
2. Show auto summary/tags/project assignment.
3. Ask a grounded question and show citations.
4. Exercise the core API flows for notes, tasks, chat, and context.
