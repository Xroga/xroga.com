-- Prepared accounting primitive only. Provider callers are not wired to this
-- receipt API until their completed-result/error semantics are reviewed.
ALTER TABLE public.ai_usage_ledger ADD COLUMN IF NOT EXISTS accounting_receipt_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_ledger_accounting_receipt
  ON public.ai_usage_ledger(user_id,accounting_receipt_id) WHERE accounting_receipt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_ai_usage_atomic(
  p_user_id UUID, p_receipt_id UUID, p_model_id TEXT, p_pool_role TEXT,
  p_input BIGINT, p_output BIGINT, p_cost_usd NUMERIC
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  usage public.user_token_usage%ROWTYPE;
  receipt public.ai_usage_ledger%ROWTYPE;
  period DATE := date_trunc('month', timezone('utc',clock_timestamp()))::date;
  cost NUMERIC;
  ledger_id BIGINT;
  replay BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL OR p_receipt_id IS NULL OR p_model_id IS NULL OR p_pool_role IS NULL
    OR p_model_id !~ '^[a-z0-9_]{1,80}$' OR p_pool_role !~ '^[a-z0-9_]{1,80}$'
    OR p_input IS NULL OR p_output IS NULL OR p_input<0 OR p_output<0
    OR p_input::numeric+p_output::numeric>9007199254740991
    OR p_cost_usd IS NULL OR p_cost_usd::text IN ('NaN','Infinity','-Infinity')
    OR p_cost_usd<0 OR p_cost_usd>99999999.999999 THEN
    RAISE EXCEPTION 'Invalid accounting evidence' USING ERRCODE='22023';
  END IF;
  cost := round(p_cost_usd,6);
  SELECT * INTO usage FROM public.user_token_usage WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounting owner unavailable' USING ERRCODE='23514'; END IF;
  SELECT * INTO receipt FROM public.ai_usage_ledger WHERE user_id=p_user_id AND accounting_receipt_id=p_receipt_id;
  IF FOUND THEN
    IF receipt.model_id IS DISTINCT FROM p_model_id OR receipt.pool_role IS DISTINCT FROM p_pool_role
      OR receipt.input_tokens IS DISTINCT FROM p_input OR receipt.output_tokens IS DISTINCT FROM p_output
      OR receipt.cost_usd IS DISTINCT FROM cost THEN
      RAISE EXCEPTION 'Accounting receipt conflict' USING ERRCODE='23514';
    END IF;
    replay := true;
  ELSE
    IF usage.plan_tier IS NULL OR btrim(usage.plan_tier)='' OR usage.plan_budget_usd IS NULL
      OR usage.plan_budget_usd<0 OR usage.plan_budget_usd::text IN ('NaN','Infinity','-Infinity')
      OR usage.quota_period_start IS NULL OR usage.quota_period_start>period THEN
      RAISE EXCEPTION 'Accounting plan unavailable' USING ERRCODE='23514';
    END IF;
    -- Reuse the current locked plan, never an earlier caller-side entitlement.
    PERFORM * FROM public.increment_user_token_usage(p_user_id,p_input,p_output,period,cost,usage.plan_budget_usd,usage.plan_tier);
    PERFORM public.merge_user_model_usage(p_user_id,
      jsonb_build_object(p_pool_role,jsonb_build_object('input',p_input,'output',p_output,'cost_usd',cost)),period);
    -- The canonical helper returns the exact inserted BIGINT ID. Never choose a
    -- latest ledger row, which could belong to an unrelated concurrent call.
    ledger_id := public.insert_ai_usage_ledger(p_user_id,p_model_id,p_pool_role,p_input,p_output,cost,period);
    UPDATE public.ai_usage_ledger SET accounting_receipt_id=p_receipt_id
      WHERE id=ledger_id AND user_id=p_user_id AND accounting_receipt_id IS NULL RETURNING * INTO receipt;
    IF NOT FOUND THEN RAISE EXCEPTION 'Accounting receipt unavailable' USING ERRCODE='23514'; END IF;
    SELECT * INTO usage FROM public.user_token_usage WHERE user_id=p_user_id;
  END IF;
  RETURN jsonb_build_object('ledgerId',receipt.id::text,'receiptId',receipt.accounting_receipt_id,
    'userId',receipt.user_id,'modelId',receipt.model_id,'poolRole',receipt.pool_role,
    'inputTokens',receipt.input_tokens,'outputTokens',receipt.output_tokens,
    'costUsd',receipt.cost_usd,'period',receipt.quota_period_start,'replayed',replay,'usage',to_jsonb(usage));
END;
$$;
REVOKE ALL ON FUNCTION public.record_ai_usage_atomic(UUID,UUID,TEXT,TEXT,BIGINT,BIGINT,NUMERIC) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_usage_atomic(UUID,UUID,TEXT,TEXT,BIGINT,BIGINT,NUMERIC) TO service_role;
NOTIFY pgrst,'reload schema';
