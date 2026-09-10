-- Universal capability economics: $25 product price, hard $20 attributable variable-cost ceiling.
-- The former $16.50 model allocation remains a planning target in application telemetry only.

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.xroga_billing_cycles'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%entitlement_micro_usd%16500000%'
  LOOP
    EXECUTE format('ALTER TABLE public.xroga_billing_cycles DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.xroga_billing_cycles
  ALTER COLUMN entitlement_micro_usd SET DEFAULT 20000000;
ALTER TABLE public.xroga_billing_cycles
  ADD CONSTRAINT xroga_billing_cycles_entitlement_ceiling
  CHECK (entitlement_micro_usd BETWEEN 0 AND 20000000);

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.xroga_billing_cycles'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%accelerated_unlock_micro_usd%14025000%'
  LOOP
    EXECUTE format('ALTER TABLE public.xroga_billing_cycles DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE public.xroga_billing_cycles
  ADD CONSTRAINT xroga_billing_cycles_accelerated_unlock_ceiling
  CHECK (accelerated_unlock_micro_usd BETWEEN 0 AND 17500000);

CREATE OR REPLACE FUNCTION public.xroga_apply_paid_cost_ceiling()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.cycle_kind = 'paid' THEN NEW.entitlement_micro_usd := 20000000; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS xroga_paid_cost_ceiling ON public.xroga_billing_cycles;
CREATE TRIGGER xroga_paid_cost_ceiling
BEFORE INSERT OR UPDATE OF cycle_kind, entitlement_micro_usd ON public.xroga_billing_cycles
FOR EACH ROW EXECUTE FUNCTION public.xroga_apply_paid_cost_ceiling();

UPDATE public.xroga_billing_cycles
SET entitlement_micro_usd = 20000000, updated_at = now()
WHERE cycle_kind = 'paid' AND entitlement_micro_usd < 20000000;

CREATE OR REPLACE FUNCTION public.xroga_unlocked_entitlement_micro_usd(
  p_cycle public.xroga_billing_cycles,
  p_purpose TEXT,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BIGINT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_day integer; v_daily bigint; v_complexity bigint; v_completion bigint := 0;
BEGIN
  IF p_now < p_cycle.starts_at THEN RETURN 0; END IF;
  v_day := LEAST(30, GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (p_now - p_cycle.starts_at)) / 86400)::integer + 1));
  IF p_cycle.pacing = 'full_access' THEN
    v_daily := 12000000; v_complexity := 5500000;
  ELSE
    v_daily := LEAST(12000000::bigint, v_day::bigint * 400000);
    v_complexity := CASE WHEN v_day >= 22 THEN 5500000 WHEN v_day >= 15 THEN 4125000 WHEN v_day >= 8 THEN 2750000 ELSE 1375000 END;
  END IF;
  IF p_purpose = 'completion' THEN v_completion := 2500000; END IF;
  RETURN LEAST(p_cycle.entitlement_micro_usd,
    GREATEST(v_daily + v_complexity, p_cycle.accelerated_unlock_micro_usd) + v_completion);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_xroga_usage_pacing(
  p_user_id UUID, p_pacing TEXT, p_confirm_full_access BOOLEAN DEFAULT FALSE
)
RETURNS public.xroga_billing_cycles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cycle public.xroga_billing_cycles;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_pacing NOT IN ('balanced_month', 'full_access') THEN RAISE EXCEPTION 'invalid_pacing'; END IF;
  IF p_pacing = 'full_access' AND NOT p_confirm_full_access THEN RAISE EXCEPTION 'full_access_confirmation_required'; END IF;
  UPDATE public.xroga_billing_cycles
  SET pacing = p_pacing,
      full_access_confirmed_at = CASE WHEN p_pacing = 'full_access' THEN COALESCE(full_access_confirmed_at, NOW()) ELSE full_access_confirmed_at END,
      accelerated_unlock_micro_usd = CASE WHEN p_pacing = 'full_access' THEN 17500000 ELSE accelerated_unlock_micro_usd END,
      updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active' RETURNING * INTO v_cycle;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_billing_cycle_required'; END IF;
  RETURN v_cycle;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_ai_plan_budget(
  p_user_id UUID, p_plan_tier TEXT, p_plan_budget_usd NUMERIC
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_tier text := COALESCE(NULLIF(TRIM(p_plan_tier), ''), 'spark');
DECLARE v_budget numeric;
BEGIN
  v_budget := CASE WHEN v_tier IN ('spark','pulse','nova','zenith','singularity') THEN 20 ELSE GREATEST(0, COALESCE(p_plan_budget_usd, 0)) END;
  INSERT INTO public.user_token_usage (user_id, plan_tier, plan_budget_usd, quota_period_start, updated_at)
  VALUES (p_user_id, v_tier, v_budget, DATE_TRUNC('month', TIMEZONE('utc', NOW()))::date, NOW())
  ON CONFLICT (user_id) DO UPDATE SET plan_tier = v_tier, plan_budget_usd = v_budget, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_ai_plan_budget(UUID, TEXT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_xroga_usage_pacing(UUID, TEXT, BOOLEAN) TO service_role;
NOTIFY pgrst, 'reload schema';
