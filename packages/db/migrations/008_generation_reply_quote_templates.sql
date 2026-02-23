ALTER TABLE contents
DROP CONSTRAINT IF EXISTS contents_type_check;

ALTER TABLE contents
ADD CONSTRAINT contents_type_check
CHECK (type IN ('tweet', 'thread', 'reply', 'quote'));

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('tweet', 'thread', 'reply', 'quote')),
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  prompt_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_prompt_templates_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_workspace_active
  ON prompt_templates(workspace_id, is_active, updated_at DESC);
