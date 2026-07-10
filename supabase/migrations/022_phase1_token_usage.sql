-- Xroga AI Phase 1 — Monthly token usage per user
-- Tracks input/output tokens separately with emergency bonus support

CREATE TABLE IF NOT EXISTS user_token_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  emergency_bonus BIGINT NOT NULL DEFAULT 0,
  emergency_claimed_at TIMESTAMPTZ,
  quota_period_start DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW())::DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_token_usage_period ON user_token_usage (quota_period_start);

ALTER TABLE user_token_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own token usage"
  ON user_token_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS for backend writes
GRANT SELECT, INSERT, UPDATE ON user_token_usage TO service_role;
GRANT SELECT ON user_token_usage TO authenticated;

COMMENT ON TABLE user_token_usage IS 'Phase 1 monthly AI token quota tracking (7M tokens/user/month)';
