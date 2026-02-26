ALTER TABLE automations
ADD COLUMN IF NOT EXISTS task_spec_json JSONB;
