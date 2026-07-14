-- Durable token usage: model_usage column + atomic increment RPCs
-- Prevents multi-instance Fly race where absolute upserts wipe real usage back to 0%.

ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS bonus_tokens BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS model_usage JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Atomically add input/output tokens for the current quota month.
CREATE OR REPLACE FUNCTION public.increment_user_token_usage(
  p_user_id UUID,
  p_input BIGINT,
  p_output BIGINT,
  p_period DATE DEFAULT DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE
)
RETURNS TABLE (
  input_tokens BIGINT,
  output_tokens BIGINT,
  emergency_bonus BIGINT,
  bonus_tokens BIGINT,
  emergency_claimed_at TIMESTAMPTZ,
  quota_period_start DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := COALESCE(p_period, DATE_TRUNC('month', TIMEZONE('utc', NOW()))::DATE);
BEGIN
  INSERT INTO public.user_token_usage AS t (
    user_id,
    input_tokens,
    output_tokens,
    quota_period_start,
    updated_at
  )
  VALUES (
    p_user_id,
    GREATEST(0, COALESCE(p_input, 0)),
    GREATEST(0, COALESCE(p_output, 0)),
    v_period,
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
    quota_period_start = v_period,
    updated_at = NOW();

  RETURN QUERY
  SELECT
    u.input_tokens,
    u.output_tokens,
    u.emergency_bonus,
    u.bonus_tokens,
    u.emergency_claimed_at,
    u.quota_period_start
  FROM public.user_token_usage u
  WHERE u.user_id = p_user_id;
END;
$$;

-- Merge per-engine usage deltas into model_usage JSONB (additive, same month).
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
    v_prev := COALESCE(v_merged -> v_role, '{"input":0,"output":0}'::jsonb);
    v_in := COALESCE((v_prev ->> 'input')::BIGINT, 0) + COALESCE((v_add ->> 'input')::BIGINT, 0);
    v_out := COALESCE((v_prev ->> 'output')::BIGINT, 0) + COALESCE((v_add ->> 'output')::BIGINT, 0);
    v_merged := jsonb_set(
      v_merged,
      ARRAY[v_role],
      jsonb_build_object('input', GREATEST(0, v_in), 'output', GREATEST(0, v_out)),
      true
    );
  END LOOP;

  UPDATE public.user_token_usage
  SET
    model_usage = v_merged,
    quota_period_start = v_period,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN v_merged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_user_token_usage(UUID, BIGINT, BIGINT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_user_model_usage(UUID, JSONB, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';
