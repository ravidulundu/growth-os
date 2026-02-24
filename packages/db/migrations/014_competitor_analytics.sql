CREATE TABLE IF NOT EXISTS competitor_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('x')),
  handle TEXT NOT NULL,
  x_user_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_competitor_accounts_workspace_platform_handle
    UNIQUE (workspace_id, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_competitor_accounts_workspace_active
  ON competitor_accounts(workspace_id, is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS competitor_post_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_account_id UUID NOT NULL REFERENCES competitor_accounts(id) ON DELETE CASCADE,
  x_post_id TEXT NOT NULL,
  text_body TEXT NOT NULL,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  posted_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_competitor_post_snapshots_account_post
    UNIQUE (competitor_account_id, x_post_id)
);

CREATE INDEX IF NOT EXISTS idx_competitor_post_snapshots_account_captured
  ON competitor_post_snapshots(competitor_account_id, captured_at DESC);
