-- Xroga AI Phase 1 — Monthly token usage per user
-- Tracks input/output tokens separately with emergency bonus support

CREATE TABLE IF NOT EXISTS public.user_token_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  emergency_bonus BIGINT NOT NULL DEFAULT 0,
  emergency_claimed_at TIMESTAMPTZ,
  quota_period_start DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW())::DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_token_usage_period ON public.user_token_usage (quota_period_start);

ALTER TABLE public.user_token_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_token_usage'
      AND policyname = 'Users can read own token usage'
  ) THEN
    CREATE POLICY "Users can read own token usage"
      ON public.user_token_usage FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_token_usage TO service_role;
GRANT SELECT ON TABLE public.user_token_usage TO authenticated;

COMMENT ON TABLE public.user_token_usage IS 'Phase 1 monthly AI token quota tracking (7M tokens/user/month)';
