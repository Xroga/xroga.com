-- Official DeepSeek Search paid-Pro retrieval admission.
-- The canonical provider reservations remain the only money ledger.
-- This narrow, service-only join records which reservations consume the distinct
-- web allowance. Under the billing-cycle FOR UPDATE lock, the ceiling and provider
-- reservation are checked atomically; parallel calls cannot exceed $1.25.
CREATE TABLE IF NOT EXISTS public.xroga_deepseek_web_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL,
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.xroga_provider_reservations(id) ON DELETE CASCADE,
  research_kind text NOT NULL CHECK (research_kind IN ('normal','automatic','deep')),
  research_run_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (cycle_id,user_id) REFERENCES public.xroga_billing_cycles(id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS xroga_deepseek_web_calls_cycle_idx
  ON public.xroga_deepseek_web_calls(cycle_id,user_id,research_kind,research_run_id);
ALTER TABLE public.xroga_deepseek_web_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xroga_deepseek_web_calls FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.xroga_deepseek_web_calls TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_xroga_deepseek_web(
  p_user_id uuid, p_idempotency_key uuid,
  p_research_kind text, p_research_run_id uuid,
  p_price_version text
) RETURNS public.xroga_provider_reservations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cycle public.xroga_billing_cycles;
  v_existing public.xroga_provider_reservations;
  v_link public.xroga_deepseek_web_calls;
  v_reserved public.xroga_provider_reservations;
  v_spent bigint;
  v_used bigint;
  v_runs bigint;
  v_in_run bigint;
  v_run_max integer;
  v_month_max integer;
BEGIN
  IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_research_kind NOT IN ('normal','automatic','deep')
    OR p_research_run_id IS NULL OR p_price_version IS NULL OR length(p_price_version)>120
    THEN RAISE EXCEPTION 'invalid_web_retrieval_contract'; END IF;
  SELECT * INTO v_cycle FROM public.xroga_billing_cycles
    WHERE user_id=p_user_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_billing_cycle_required'; END IF;
  IF v_cycle.cycle_kind<>'paid' OR now()<v_cycle.starts_at OR now()>=v_cycle.ends_at
    THEN RAISE EXCEPTION 'paid_web_retrieval_cycle_required'; END IF;
  SELECT * INTO v_existing FROM public.xroga_provider_reservations
    WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO v_link FROM public.xroga_deepseek_web_calls
      WHERE reservation_id=v_existing.id;
    IF NOT FOUND OR v_link.user_id<>p_user_id OR v_link.cycle_id<>v_cycle.id
       OR v_link.research_kind<>p_research_kind OR v_link.research_run_id<>p_research_run_id
       THEN RAISE EXCEPTION 'web_retrieval_replay_mismatch'; END IF;
    RETURN v_existing;
  END IF;

  SELECT coalesce(sum(CASE WHEN r.status='settled' THEN coalesce(r.settled_micro_usd,r.reserved_micro_usd)
                   ELSE r.reserved_micro_usd END),0)
    INTO v_spent
    FROM public.xroga_deepseek_web_calls c
    JOIN public.xroga_provider_reservations r ON r.id=c.reservation_id
    WHERE c.cycle_id=v_cycle.id AND c.user_id=p_user_id
      AND r.status IN ('reserved','pending_reconciliation','settled');
  IF v_spent+750>1250000 THEN RAISE EXCEPTION 'web_retrieval_budget_exceeded'; END IF;
  IF p_research_kind='normal' THEN
    SELECT count(*) INTO v_used FROM public.xroga_deepseek_web_calls c
      JOIN public.xroga_provider_reservations r ON r.id=c.reservation_id
      WHERE c.cycle_id=v_cycle.id AND c.user_id=p_user_id
        AND c.research_kind='normal' AND r.status IN ('reserved','pending_reconciliation','settled');
    IF v_used>=650 THEN RAISE EXCEPTION 'normal_web_retrieval_allowance_exceeded'; END IF;
  ELSE
    SELECT count(*) INTO v_in_run FROM public.xroga_deepseek_web_calls c
      JOIN public.xroga_provider_reservations r ON r.id=c.reservation_id
      WHERE c.cycle_id=v_cycle.id AND c.user_id=p_user_id
        AND c.research_kind=p_research_kind AND c.research_run_id=p_research_run_id
        AND r.status IN ('reserved','pending_reconciliation','settled');
    IF p_research_kind='automatic' THEN
      v_run_max:=2;
      v_month_max:=250;
    ELSE
      v_run_max:=5;
      v_month_max:=90;
    END IF;
    IF v_in_run>=v_run_max THEN
      RAISE EXCEPTION 'research_run_operation_limit_exceeded';
    END IF;
    SELECT count(DISTINCT c.research_run_id) INTO v_runs FROM public.xroga_deepseek_web_calls c
      JOIN public.xroga_provider_reservations r ON r.id=c.reservation_id
      WHERE c.cycle_id=v_cycle.id AND c.user_id=p_user_id
        AND c.research_kind=p_research_kind AND r.status IN ('reserved','pending_reconciliation','settled');
    IF v_in_run=0 AND v_runs>=v_month_max THEN
      RAISE EXCEPTION 'monthly_research_run_allowance_exceeded';
    END IF;
  END IF;
  -- This remains the canonical reservation: same transaction, same cycle lock,
  -- same model/sandbox budget authority. Failed statements roll back both records.
  v_reserved := public.reserve_xroga_provider_budget(
    p_user_id,p_idempotency_key,'daily_work','web.deepseek_search',
    p_price_version,0,0,750);
  INSERT INTO public.xroga_deepseek_web_calls(user_id,cycle_id,reservation_id,research_kind,research_run_id)
    VALUES (p_user_id,v_cycle.id,v_reserved.id,p_research_kind,p_research_run_id);
  RETURN v_reserved;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_xroga_deepseek_web(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_xroga_deepseek_web(uuid,uuid,text,uuid,text) TO service_role;
