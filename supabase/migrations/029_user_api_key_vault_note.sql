-- User API key vault uses existing public.user_integrations rows with
-- provider = 'apikey_<name>' and AES-256-GCM ciphertext in access_token.
-- metadata: { type: 'user_api_key', provider, env_var, masked, connected_at }
--
-- No new table required. This migration documents the contract and ensures
-- metadata JSONB is available (already present on user_integrations).

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON TABLE public.user_integrations IS
  'OAuth tokens (github/vercel) and encrypted BYOK API keys (apikey_*). Secrets sync to user Vercel env on deploy; never written to GitHub.';
