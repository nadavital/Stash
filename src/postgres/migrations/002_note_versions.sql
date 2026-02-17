CREATE TABLE IF NOT EXISTS note_versions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content TEXT,
  summary TEXT,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  project TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id TEXT,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note
  ON note_versions(note_id, workspace_id, version_number DESC);
