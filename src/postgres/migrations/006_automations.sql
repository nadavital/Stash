CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  approved_by_user_id TEXT,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'workspace',
  scope_folder TEXT,
  schedule_type TEXT NOT NULL DEFAULT 'manual',
  interval_minutes INTEGER,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  approval_status TEXT NOT NULL DEFAULT 'pending_approval',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'paused',
  max_actions_per_run INTEGER NOT NULL DEFAULT 4,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_error TEXT,
  last_run_summary TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automations_workspace
ON automations(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automations_due
ON automations(workspace_id, approval_status, status, enabled, next_run_at);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  summary TEXT,
  error TEXT,
  trace_json JSONB,
  output_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
ON automation_runs(automation_id, started_at DESC);
