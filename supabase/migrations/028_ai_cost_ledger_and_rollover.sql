-- Real $ cost metering: spent_usd, rollover credit, per-call ledger, plan budget.
-- Tokens remain visible to users; $ is used for hard caps + profit tracking.

ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS spent_usd NUMERIC(14, 6) NOT NULL DEFAULT 0;

ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS rollover_usd NUMERIC(14, 6) NOT NULL DEFAULT 0;

ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS plan_budget_usd NUMERIC(14, 6) NOT NULL DEFAULT 16.77;

ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS plan_tier TEXT NOT NULL DEFAULT 'spark';

-- Append-only ledger of every AI call (source of truth for reconciliation).
CREATE TABLE IF NOT EXISTS public.ai_usage_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  pool_role TEXT NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  quota_period_start DATE NOT NULL DEFAULT DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_ledger_user_period
  ON public.ai_usage_ledger (user_id, quota_period_start, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_ledger_created
  ON public.ai_usage_ledger (created_at DESC);

ALTER TABLE public.ai_usage_ledger ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_usage_ledger'
      AND policyname = 'Users can read own ai usage ledger'
  ) THEN
    CREATE POLICY "Users can read own ai usage ledger"
      ON public.ai_usage_ledger FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT ON TABLE public.ai_usage_ledger TO service_role;
GRANT SELECT ON TABLE public.ai_usage_ledger TO authenticated;

-- Atomic increment: tokens + spent_usd; on month flip, roll unused credit forward (max 1× plan budget).
CREATE OR REPLACE FUNCTION public.increment_user_token_usage(
  p_user_id UUID,
  p_input BIGINT,
  p_output BIGINT,
  p_period DATE DEFAULT DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE,
  p_cost_usd NUMERIC DEFAULT 0,
  p_plan_budget_usd NUMERIC DEFAULT NULL,
  p_plan_tier TEXT DEFAULT NULL
)
RETURNS TABLE (
  input_tokens BIGINT,
  output_tokens BIGINT,
  emergency_bonus BIGINT,
  bonus_tokens BIGINT,
  emergency_claimed_at TIMESTAMPTZ,
  quota_period_start DATE,
  spent_usd NUMERIC,
  rollover_usd NUMERIC,
  plan_budget_usd NUMERIC,
  plan_tier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := COALESCE(p_period, DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE);
  v_cost NUMERIC := GREATEST(0, COALESCE(p_cost_usd, 0));
BEGIN
  INSERT INTO public.user_token_usage AS t (
    user_id, input_tokens, output_tokens, spent_usd, quota_period_start,
    plan_budget_usd, plan_tier, updated_at
  )
  VALUES (
    p_user_id,
    GREATEST(0, COALESCE(p_input, 0)),
    GREATEST(0, COALESCE(p_output, 0)),
    v_cost,
    v_period,
    COALESCE(p_plan_budget_usd, 16.77),
    COALESCE(NULLIF(TRIM(p_plan_tier), ''), 'spark'),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    input_tokens = CASE
      WHEN t.quota_period_start IS DISTINCT FROM v_period THEN GREATEST(0, COALESCE(p_input, 0))
      ELSE t.input_tokens + GREATEST(0, COALESCE(p_input, 0))
    END,
    output_tokens = CASE
      WHEN t.quota_period_start IS DISTINCT FROM v_period THEN GREATEST(0, COALESCE(p_output, 0))
      ELSE t.output_tokens + GREATEST(0, COALESCE(p_output, 0))
    END,
    spent_usd = CASE
      WHEN t.quota_period_start IS DISTINCT FROM v_period THEN v_cost
      ELSE t.spent_usd + v_cost
    END,
    rollover_usd = CASE
      WHEN t.quota_period_start IS DISTINCT FROM v_period THEN
        LEAST(
          GREATEST(0, COALESCE(t.plan_budget_usd, 16.77) + COALESCE(t.rollover_usd, 0) - COALESCE(t.spent_usd, 0)),
          GREATEST(0, COALESCE(p_plan_budget_usd, t.plan_budget_usd, 16.77))
        )
      ELSE t.rollover_usd
    END,
    model_usage = CASE
      WHEN t.quota_period_start IS DISTINCT FROM v_period THEN '{}'::jsonb
      ELSE t.model_usage
    END,
    emergency_bonus = CASE
      WHEN t.quota_period_start IS DISTINCT FROM v_period THEN 0
      ELSE t.emergency_bonus
    END,
    emergency_claimed_at = CASE
      WHEN t.quota_period_start IS DISTINCT FROM v_period THEN NULL
      ELSE t.emergency_claimed_at
    END,
    bonus_tokens = CASE
      WHEN t.quota_period_start IS DISTINCT FROM v_period THEN 0
      ELSE t.bonus_tokens
    END,
    plan_budget_usd = COALESCE(p_plan_budget_usd, t.plan_budget_usd, 16.77),
    plan_tier = COALESCE(NULLIF(TRIM(p_plan_tier), ''), t.plan_tier, 'spark'),
    quota_period_start = v_period,
    updated_at = NOW();

  RETURN QUERY
  SELECT
    u.input_tokens, u.output_tokens, u.emergency_bonus, u.bonus_tokens,
    u.emergency_claimed_at, u.quota_period_start,
    u.spent_usd, u.rollover_usd, u.plan_budget_usd, u.plan_tier
  FROM public.user_token_usage u
  WHERE u.user_id = p_user_id;
END;
$$;

-- Merge per-engine usage deltas (tokens + cost_usd) into model_usage JSONB.
CREATE OR REPLACE FUNCTION public.merge_user_model_usage(
  p_user_id UUID,
  p_delta JSONB,
  p_period DATE DEFAULT DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := COALESCE(p_period, DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE);
  v_current JSONB;
  v_role TEXT;
  v_add JSONB;
  v_prev JSONB;
  v_in BIGINT;
  v_out BIGINT;
  v_cost NUMERIC;
  v_merged JSONB := '{}'::jsonb;
BEGIN
  INSERT INTO public.user_token_usage (user_id, quota_period_start, updated_at)
  VALUES (p_user_id, v_period, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT
    CASE
      WHEN u.quota_period_start IS DISTINCT FROM v_period THEN '{}'::jsonb
      ELSE COALESCE(u.model_usage, '{}'::jsonb)
    END
  INTO v_current
  FROM public.user_token_usage u
  WHERE u.user_id = p_user_id
  FOR UPDATE;

  v_merged := COALESCE(v_current, '{}'::jsonb);

  FOR v_role, v_add IN SELECT * FROM jsonb_each(COALESCE(p_delta, '{}'::jsonb))
  LOOP
    v_prev := COALESCE(v_merged -> v_role, '{"input":0,"output":0,"cost_usd":0}'::jsonb);
    v_in := COALESCE((v_prev ->> 'input')::BIGINT, 0) + COALESCE((v_add ->> 'input')::BIGINT, 0);
    v_out := COALESCE((v_prev ->> 'output')::BIGINT, 0) + COALESCE((v_add ->> 'output')::BIGINT, 0);
    v_cost := COALESCE((v_prev ->> 'cost_usd')::NUMERIC, 0) + COALESCE((v_add ->> 'cost_usd')::NUMERIC, 0);
    v_merged := jsonb_set(
      v_merged,
      ARRAY[v_role],
      jsonb_build_object(
        'input', GREATEST(0, v_in),
        'output', GREATEST(0, v_out),
        'cost_usd', GREATEST(0, v_cost)
      ),
      true
    );
  END LOOP;

  UPDATE public.user_token_usage
  SET model_usage = v_merged, quota_period_start = v_period, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN v_merged;
END;
$$;

-- Record one AI call in the ledger (idempotent-friendly insert).
CREATE OR REPLACE FUNCTION public.insert_ai_usage_ledger(
  p_user_id UUID,
  p_model_id TEXT,
  p_pool_role TEXT,
  p_input BIGINT,
  p_output BIGINT,
  p_cost_usd NUMERIC,
  p_period DATE DEFAULT DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO public.ai_usage_ledger (
    user_id, model_id, pool_role, input_tokens, output_tokens, cost_usd, quota_period_start
  )
  VALUES (
    p_user_id,
    COALESCE(p_model_id, 'unknown'),
    COALESCE(p_pool_role, 'unknown'),
    GREATEST(0, COALESCE(p_input, 0)),
    GREATEST(0, COALESCE(p_output, 0)),
    GREATEST(0, COALESCE(p_cost_usd, 0)),
    COALESCE(p_period, DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Sync plan budget when Paddle upgrades / changes tier (does not wipe spent).
CREATE OR REPLACE FUNCTION public.set_user_ai_plan_budget(
  p_user_id UUID,
  p_plan_tier TEXT,
  p_plan_budget_usd NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_token_usage (
    user_id, plan_tier, plan_budget_usd, quota_period_start, updated_at
  )
  VALUES (
    p_user_id,
    COALESCE(NULLIF(TRIM(p_plan_tier), ''), 'spark'),
    GREATEST(0, COALESCE(p_plan_budget_usd, 16.77)),
    DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    plan_tier = COALESCE(NULLIF(TRIM(p_plan_tier), ''), user_token_usage.plan_tier),
    plan_budget_usd = GREATEST(0, COALESCE(p_plan_budget_usd, user_token_usage.plan_budget_usd)),
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_user_token_usage(UUID, BIGINT, BIGINT, DATE, NUMERIC, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_user_model_usage(UUID, JSONB, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_ai_usage_ledger(UUID, TEXT, TEXT, BIGINT, BIGINT, NUMERIC, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_ai_plan_budget(UUID, TEXT, NUMERIC) TO service_role;

NOTIFY pgrst, 'reload schema';
