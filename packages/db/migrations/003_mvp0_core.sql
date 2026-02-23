CREATE TABLE IF NOT EXISTS x_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  state_hash TEXT NOT NULL,
  code_verifier_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_x_oauth_states_workspace_expires
  ON x_oauth_states(workspace_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS x_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  x_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_x_account_per_workspace UNIQUE (workspace_id, x_user_id)
);

CREATE INDEX IF NOT EXISTS idx_x_accounts_workspace_active
  ON x_accounts(workspace_id, is_active);

CREATE TABLE IF NOT EXISTS x_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_x_tokens_account_revoked
  ON x_tokens(account_id, revoked_at);

CREATE TABLE IF NOT EXISTS x_timeline_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  x_post_id TEXT NOT NULL,
  text_body TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_x_timeline_post_account UNIQUE (account_id, x_post_id)
);

CREATE INDEX IF NOT EXISTS idx_x_timeline_posts_account_posted
  ON x_timeline_posts(account_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  source_post_count INT NOT NULL DEFAULT 0,
  style_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_style_profiles_workspace_account UNIQUE (workspace_id, account_id)
);

CREATE TABLE IF NOT EXISTS contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES x_accounts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('tweet', 'thread', 'reply', 'quote')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  topic TEXT,
  prompt_input TEXT,
  current_text TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contents_workspace_status_created
  ON contents(workspace_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  text_body TEXT NOT NULL,
  prompt_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_content_version UNIQUE (content_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_content_versions_content_created
  ON content_versions(content_id, created_at DESC);

CREATE TABLE IF NOT EXISTS publish_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'queued', 'in_progress', 'retry_wait', 'completed', 'failed_permanent', 'cancelled'
  )),
  run_at TIMESTAMPTZ NOT NULL,
  next_run_at TIMESTAMPTZ NOT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_publish_jobs_workspace_account_dedupe UNIQUE (workspace_id, account_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_publish_jobs_due
  ON publish_jobs(next_run_at ASC)
  WHERE state IN ('queued', 'retry_wait');

CREATE TABLE IF NOT EXISTS published_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE RESTRICT,
  publish_job_id UUID NOT NULL UNIQUE REFERENCES publish_jobs(id) ON DELETE RESTRICT,
  external_post_id TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_published_posts_account_external UNIQUE (account_id, external_post_id)
);

CREATE INDEX IF NOT EXISTS idx_published_posts_workspace_published
  ON published_posts(workspace_id, published_at DESC);

CREATE TABLE IF NOT EXISTS post_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  published_post_id UUID NOT NULL REFERENCES published_posts(id) ON DELETE CASCADE,
  x_post_id TEXT NOT NULL,
  window_key TEXT NOT NULL CHECK (window_key IN ('t15', 't60', 't24', 'manual')),
  impressions INT NOT NULL DEFAULT 0,
  likes INT NOT NULL DEFAULT 0,
  replies INT NOT NULL DEFAULT 0,
  reposts INT NOT NULL DEFAULT 0,
  quotes INT NOT NULL DEFAULT 0,
  metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_post_metric_snapshot_window UNIQUE (published_post_id, window_key)
);

CREATE INDEX IF NOT EXISTS idx_post_metric_snapshots_post_captured
  ON post_metric_snapshots(published_post_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_metric_snapshots_xpost_captured
  ON post_metric_snapshots(x_post_id, captured_at DESC);
