CREATE TABLE IF NOT EXISTS folder_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, folder_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_memberships_workspace_user
ON folder_memberships(workspace_id, user_id, folder_id);

CREATE INDEX IF NOT EXISTS idx_folder_memberships_workspace_folder
ON folder_memberships(workspace_id, folder_id, user_id);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  visibility_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_events_workspace_created
ON activity_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_workspace_folder_created
ON activity_events(workspace_id, folder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_workspace_note_created
ON activity_events(workspace_id, note_id, created_at DESC);
