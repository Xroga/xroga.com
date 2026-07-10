-- XRG balance and task completions for dashboard & token earning system

CREATE TABLE IF NOT EXISTS public.user_xrg_balance (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xrg BIGINT NOT NULL DEFAULT 0,
  available_xrg BIGINT NOT NULL DEFAULT 0,
  vested_xrg BIGINT NOT NULL DEFAULT 0,
  token_boost_total BIGINT NOT NULL DEFAULT 0,
  consistency_streak_months INT NOT NULL DEFAULT 0,
  consistency_bonus_percent INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  xrg_awarded BIGINT NOT NULL DEFAULT 0,
  token_boost BIGINT NOT NULL DEFAULT 0,
  proof_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, task_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_user_task_completions_user ON public.user_task_completions (user_id, created_at DESC);

ALTER TABLE public.user_xrg_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_completions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_xrg_balance'
      AND policyname = 'Users can read own XRG balance'
  ) THEN
    CREATE POLICY "Users can read own XRG balance"
      ON public.user_xrg_balance FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_task_completions'
      AND policyname = 'Users can read own task completions'
  ) THEN
    CREATE POLICY "Users can read own task completions"
      ON public.user_task_completions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_xrg_balance TO service_role;
GRANT SELECT ON TABLE public.user_xrg_balance TO authenticated;
GRANT SELECT, INSERT ON TABLE public.user_task_completions TO service_role;
GRANT SELECT ON TABLE public.user_task_completions TO authenticated;
