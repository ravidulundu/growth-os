-- Faz 2 - DB Schema v0
-- Target: PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core identity and tenancy
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  email_hash TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  plan_key TEXT NOT NULL DEFAULT 'mvp0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- X integration
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
  refresh_token_encrypted TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_x_tokens_account_revoked
  ON x_tokens(account_id, revoked_at);

-- Style extraction
CREATE TABLE IF NOT EXISTS style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  source_post_count INT NOT NULL DEFAULT 0,
  style_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_style_profiles_workspace_account UNIQUE (workspace_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_style_profiles_account_updated
  ON style_profiles(account_id, updated_at DESC);

-- Content generation and library
CREATE TABLE IF NOT EXISTS contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES x_accounts(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('tweet', 'thread', 'reply')),
  status TEXT NOT NULL CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),
  topic TEXT,
  prompt_input TEXT,
  current_text TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contents_workspace_status_created
  ON contents(workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contents_workspace_account_created
  ON contents(workspace_id, account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  text_body TEXT NOT NULL,
  prompt_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_content_version UNIQUE (content_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_content_versions_content_created
  ON content_versions(content_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('tweet', 'thread', 'reply')),
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

-- Publishing pipeline
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

CREATE INDEX IF NOT EXISTS idx_publish_jobs_workspace_state
  ON publish_jobs(workspace_id, state, created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_published_posts_account_created
  ON published_posts(account_id, created_at DESC);

-- First-hour analytics snapshots
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

CREATE INDEX IF NOT EXISTS idx_post_metric_snapshots_workspace_captured
  ON post_metric_snapshots(workspace_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_metric_snapshots_xpost_captured
  ON post_metric_snapshots(x_post_id, captured_at DESC);

-- Usage, budget and auditing
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID REFERENCES x_accounts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  endpoint_key TEXT,
  units INT NOT NULL DEFAULT 1,
  estimated_cost_cents INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_workspace_time
  ON usage_events(workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_events_endpoint_time
  ON usage_events(endpoint_key, occurred_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  ip_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created
  ON audit_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON audit_logs(actor_user_id, created_at DESC);
