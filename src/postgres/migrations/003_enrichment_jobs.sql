CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  visibility_user_id TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enrichment_jobs_status_check
    CHECK (status IN ('queued', 'running', 'retry', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status_available
  ON enrichment_jobs(status, available_at, created_at);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_workspace_status
  ON enrichment_jobs(workspace_id, status, created_at);
