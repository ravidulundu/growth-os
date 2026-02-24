CREATE TABLE IF NOT EXISTS billing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe')),
  provider_customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_billing_customers_workspace_provider UNIQUE (workspace_id, provider),
  CONSTRAINT uq_billing_customers_provider_customer UNIQUE (provider, provider_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_workspace_updated
  ON billing_customers(workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe')),
  provider_customer_id TEXT NOT NULL,
  provider_subscription_id TEXT,
  provider_price_id TEXT,
  status TEXT NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_billing_subscriptions_workspace_provider UNIQUE (workspace_id, provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_subscriptions_provider_subscription
  ON billing_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_workspace_status
  ON billing_subscriptions(workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer
  ON billing_subscriptions(provider_customer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('stripe')),
  provider_invoice_id TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  provider_subscription_id TEXT,
  status TEXT NOT NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  currency TEXT,
  hosted_invoice_url TEXT,
  invoice_pdf_url TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_billing_invoices_provider_invoice UNIQUE (provider, provider_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_workspace_updated
  ON billing_invoices(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_customer_updated
  ON billing_invoices(provider_customer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('stripe')),
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_billing_webhook_provider_event UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_provider_created
  ON billing_webhook_events(provider, created_at DESC);
