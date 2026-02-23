ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS better_auth_sessions (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_better_auth_sessions_user_created
  ON better_auth_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_better_auth_sessions_expires
  ON better_auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS better_auth_accounts (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  password TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_better_auth_accounts_provider_account
  ON better_auth_accounts(provider_id, account_id);

CREATE INDEX IF NOT EXISTS idx_better_auth_accounts_user
  ON better_auth_accounts(user_id);

CREATE TABLE IF NOT EXISTS better_auth_verifications (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  identifier TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_better_auth_verifications_identifier_value
  ON better_auth_verifications(identifier, value);

CREATE INDEX IF NOT EXISTS idx_better_auth_verifications_expires
  ON better_auth_verifications(expires_at);
