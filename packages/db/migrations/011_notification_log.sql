CREATE TABLE IF NOT EXISTS workspace_notification_settings (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  first_hour_alert_webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'webhook')),
  level TEXT NOT NULL CHECK (level IN ('watch', 'critical')),
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_notification_reference_channel
    UNIQUE (reference_id, channel, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_notification_log_workspace_type
  ON notification_log(workspace_id, notification_type, delivered_at DESC);
