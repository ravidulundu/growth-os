ALTER TABLE x_oauth_states
ADD COLUMN IF NOT EXISTS code_verifier_encrypted TEXT;
