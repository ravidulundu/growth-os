CREATE TABLE IF NOT EXISTS content_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES x_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('hourly', 'daily', 'weekly', 'biweekly', 'monthly')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  enqueue_next_on_publish BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_content_series_workspace_account_name UNIQUE (workspace_id, account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_content_series_workspace_account_active
  ON content_series(workspace_id, account_id, is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS content_series_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id UUID NOT NULL REFERENCES content_series(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  position INT NOT NULL CHECK (position > 0),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'queued', 'published', 'archived')),
  last_enqueued_at TIMESTAMPTZ,
  last_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_content_series_items_series_position UNIQUE (series_id, position),
  CONSTRAINT uq_content_series_items_series_content UNIQUE (series_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_series_items_series_state_position
  ON content_series_items(series_id, state, position);

CREATE TABLE IF NOT EXISTS repurpose_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('tweet', 'thread', 'reply', 'quote')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repurpose_runs_workspace_created
  ON repurpose_runs(workspace_id, created_at DESC);
