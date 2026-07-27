-- Command 4/5: one 30-day paid-provider entitlement with atomic reservation and settlement.
-- All monetary values are integer micro-USD. Provider/model details remain server-only.

CREATE TABLE IF NOT EXISTS public.xroga_billing_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_kind TEXT NOT NULL CHECK (cycle_kind IN ('promotion', 'paid')),
  provider_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'past_due', 'paused', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  entitlement_micro_usd BIGINT NOT NULL DEFAULT 16500000 CHECK (entitlement_micro_usd BETWEEN 0 AND 16500000),
  pacing TEXT NOT NULL DEFAULT 'balanced_month' CHECK (pacing IN ('balanced_month', 'full_access')),
  full_access_confirmed_at TIMESTAMPTZ,
  accelerated_unlock_micro_usd BIGINT NOT NULL DEFAULT 0 CHECK (accelerated_unlock_micro_usd BETWEEN 0 AND 14025000),
  settled_micro_usd BIGINT NOT NULL DEFAULT 0 CHECK (settled_micro_usd >= 0),
  reserved_micro_usd BIGINT NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
  accounting_safety_hold_micro_usd BIGINT NOT NULL DEFAULT 0 CHECK (accounting_safety_hold_micro_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at),
  CHECK (settled_micro_usd + reserved_micro_usd + accounting_safety_hold_micro_usd <= entitlement_micro_usd)
);

CREATE UNIQUE INDEX IF NOT EXISTS xroga_billing_cycles_one_active_user_idx
  ON public.xroga_billing_cycles (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS xroga_billing_cycles_user_end_idx
  ON public.xroga_billing_cycles (user_id, ends_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS xroga_billing_cycles_provider_reference_idx
  ON public.xroga_billing_cycles (user_id, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.xroga_provider_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.xroga_billing_cycles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('daily_work', 'complexity', 'completion')),
  internal_route TEXT NOT NULL,
  price_version TEXT NOT NULL,
  estimated_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (estimated_input_tokens >= 0),
  maximum_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (maximum_output_tokens >= 0),
  reserved_micro_usd BIGINT NOT NULL CHECK (reserved_micro_usd > 0),
  settled_micro_usd BIGINT CHECK (settled_micro_usd IS NULL OR settled_micro_usd >= 0),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'pending_reconciliation', 'settled', 'released')),
  provider_request_id TEXT,
  actual_input_tokens BIGINT CHECK (actual_input_tokens IS NULL OR actual_input_tokens >= 0),
  cached_input_tokens BIGINT CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  output_tokens BIGINT CHECK (output_tokens IS NULL OR output_tokens >= 0),
  reasoning_tokens BIGINT CHECK (reasoning_tokens IS NULL OR reasoning_tokens >= 0),
  tool_calls INTEGER CHECK (tool_calls IS NULL OR tool_calls >= 0),
  search_calls INTEGER CHECK (search_calls IS NULL OR search_calls >= 0),
  error_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS xroga_provider_reservations_cycle_status_idx
  ON public.xroga_provider_reservations (cycle_id, status, created_at);

ALTER TABLE public.xroga_billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xroga_provider_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own billing cycles" ON public.xroga_billing_cycles;
CREATE POLICY "Users read own billing cycles"
  ON public.xroga_billing_cycles FOR SELECT
  USING (auth.uid() = user_id);

-- Reservation details contain internal routing/accounting metadata and are service-only.
REVOKE ALL ON public.xroga_provider_reservations FROM anon, authenticated;
GRANT SELECT ON public.xroga_billing_cycles TO authenticated;
GRANT ALL ON public.xroga_billing_cycles, public.xroga_provider_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.xroga_unlocked_entitlement_micro_usd(
  p_cycle public.xroga_billing_cycles,
  p_purpose TEXT,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BIGINT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_day INTEGER;
  v_daily BIGINT;
  v_complexity BIGINT;
  v_completion BIGINT := 0;
BEGIN
  IF p_now < p_cycle.starts_at THEN RETURN 0; END IF;
  v_day := LEAST(30, GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (p_now - p_cycle.starts_at)) / 86400)::INTEGER + 1));

  IF p_cycle.pacing = 'full_access' THEN
    v_daily := 9900000;
    v_complexity := 4125000;
  ELSE
    v_daily := LEAST(9900000::BIGINT, v_day::BIGINT * 330000);
    v_complexity := CASE
      WHEN v_day >= 22 THEN 4125000
      WHEN v_day >= 15 THEN 3093750
      WHEN v_day >= 8 THEN 2062500
      ELSE 1031250
    END;
  END IF;

  IF p_purpose = 'completion' THEN v_completion := 2475000; END IF;
  RETURN LEAST(
    p_cycle.entitlement_micro_usd,
    GREATEST(v_daily + v_complexity, p_cycle.accelerated_unlock_micro_usd) + v_completion
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_xroga_launch_promotion(p_user_id UUID)
RETURNS public.xroga_billing_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_existing public.xroga_billing_cycles;
  v_cycle public.xroga_billing_cycles;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;

  SELECT * INTO v_existing
  FROM public.xroga_billing_cycles
  WHERE user_id = p_user_id
  ORDER BY created_at ASC
  LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;

  IF v_now >= TIMESTAMPTZ '2026-08-31 00:00:00+00' THEN
    RAISE EXCEPTION 'promotion_activation_window_closed';
  END IF;

  INSERT INTO public.xroga_billing_cycles (
    user_id, cycle_kind, status, starts_at, ends_at, entitlement_micro_usd, pacing
  ) VALUES (
    p_user_id, 'promotion', 'active', v_now, v_now + INTERVAL '30 days', 16500000, 'balanced_month'
  ) RETURNING * INTO v_cycle;
  RETURN v_cycle;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_xroga_usage_pacing(
  p_user_id UUID,
  p_pacing TEXT,
  p_confirm_full_access BOOLEAN DEFAULT FALSE
)
RETURNS public.xroga_billing_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle public.xroga_billing_cycles;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_pacing NOT IN ('balanced_month', 'full_access') THEN RAISE EXCEPTION 'invalid_pacing'; END IF;
  IF p_pacing = 'full_access' AND NOT p_confirm_full_access THEN
    RAISE EXCEPTION 'full_access_confirmation_required';
  END IF;

  UPDATE public.xroga_billing_cycles
  SET pacing = p_pacing,
      full_access_confirmed_at = CASE
        WHEN p_pacing = 'full_access' THEN COALESCE(full_access_confirmed_at, NOW())
        ELSE full_access_confirmed_at
      END,
      accelerated_unlock_micro_usd = CASE
        WHEN p_pacing = 'full_access' THEN 14025000
        ELSE accelerated_unlock_micro_usd
      END,
      updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active'
  RETURNING * INTO v_cycle;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_billing_cycle_required'; END IF;
  RETURN v_cycle;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_xroga_paid_cycle(
  p_user_id UUID,
  p_provider_reference TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
)
RETURNS public.xroga_billing_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.xroga_billing_cycles;
  v_cycle public.xroga_billing_cycles;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF NULLIF(TRIM(p_provider_reference), '') IS NULL THEN RAISE EXCEPTION 'provider_reference_required'; END IF;
  IF p_ends_at <= p_starts_at OR p_ends_at > p_starts_at + INTERVAL '31 days' THEN
    RAISE EXCEPTION 'invalid_paid_cycle_period';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 45));
  SELECT * INTO v_existing
  FROM public.xroga_billing_cycles
  WHERE user_id = p_user_id AND provider_reference = p_provider_reference;
  IF FOUND THEN RETURN v_existing; END IF;

  UPDATE public.xroga_billing_cycles
  SET status = 'expired', updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.xroga_billing_cycles (
    user_id, cycle_kind, provider_reference, status, starts_at, ends_at,
    entitlement_micro_usd, pacing
  ) VALUES (
    p_user_id, 'paid', TRIM(p_provider_reference), 'active', p_starts_at, p_ends_at,
    16500000, 'balanced_month'
  ) RETURNING * INTO v_cycle;
  RETURN v_cycle;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_xroga_provider_budget(
  p_user_id UUID,
  p_idempotency_key UUID,
  p_purpose TEXT,
  p_internal_route TEXT,
  p_price_version TEXT,
  p_estimated_input_tokens BIGINT,
  p_maximum_output_tokens BIGINT,
  p_reservation_micro_usd BIGINT,
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS public.xroga_provider_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle public.xroga_billing_cycles;
  v_existing public.xroga_provider_reservations;
  v_unlocked BIGINT;
  v_reservation public.xroga_provider_reservations;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_purpose NOT IN ('daily_work', 'complexity', 'completion') THEN RAISE EXCEPTION 'invalid_budget_purpose'; END IF;
  IF p_reservation_micro_usd <= 0 THEN RAISE EXCEPTION 'invalid_reservation_amount'; END IF;

  SELECT * INTO v_existing FROM public.xroga_provider_reservations
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO v_cycle
  FROM public.xroga_billing_cycles
  WHERE user_id = p_user_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_billing_cycle_required'; END IF;
  IF p_now >= v_cycle.ends_at THEN RAISE EXCEPTION 'billing_cycle_expired'; END IF;

  -- A concurrent retry can only be identified reliably after the cycle lock.
  SELECT * INTO v_existing FROM public.xroga_provider_reservations
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  v_unlocked := public.xroga_unlocked_entitlement_micro_usd(v_cycle, p_purpose, p_now);
  IF v_cycle.settled_micro_usd + v_cycle.reserved_micro_usd +
     v_cycle.accounting_safety_hold_micro_usd + p_reservation_micro_usd > v_unlocked THEN
    RAISE EXCEPTION 'currently_unlocked_entitlement_exceeded';
  END IF;

  UPDATE public.xroga_billing_cycles
  SET reserved_micro_usd = reserved_micro_usd + p_reservation_micro_usd,
      updated_at = NOW()
  WHERE id = v_cycle.id;

  INSERT INTO public.xroga_provider_reservations (
    cycle_id, user_id, idempotency_key, purpose, internal_route, price_version,
    estimated_input_tokens, maximum_output_tokens, reserved_micro_usd, status
  ) VALUES (
    v_cycle.id, p_user_id, p_idempotency_key, p_purpose, p_internal_route, p_price_version,
    GREATEST(0, p_estimated_input_tokens), GREATEST(0, p_maximum_output_tokens),
    p_reservation_micro_usd, 'reserved'
  ) RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_xroga_provider_budget(
  p_user_id UUID,
  p_reservation_id UUID,
  p_actual_micro_usd BIGINT,
  p_provider_request_id TEXT,
  p_actual_input_tokens BIGINT,
  p_cached_input_tokens BIGINT,
  p_output_tokens BIGINT,
  p_reasoning_tokens BIGINT DEFAULT 0,
  p_tool_calls INTEGER DEFAULT 0,
  p_search_calls INTEGER DEFAULT 0
)
RETURNS public.xroga_provider_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.xroga_provider_reservations;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO v_reservation
  FROM public.xroga_provider_reservations
  WHERE id = p_reservation_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF v_reservation.status = 'settled' THEN RETURN v_reservation; END IF;
  IF v_reservation.status = 'released' THEN RAISE EXCEPTION 'reservation_already_released'; END IF;
  IF p_actual_micro_usd < 0 OR p_actual_micro_usd > v_reservation.reserved_micro_usd THEN
    RAISE EXCEPTION 'actual_cost_exceeds_reservation';
  END IF;

  UPDATE public.xroga_billing_cycles
  SET reserved_micro_usd = reserved_micro_usd - v_reservation.reserved_micro_usd,
      settled_micro_usd = settled_micro_usd + p_actual_micro_usd,
      updated_at = NOW()
  WHERE id = v_reservation.cycle_id;

  UPDATE public.xroga_provider_reservations
  SET status = 'settled', settled_micro_usd = p_actual_micro_usd,
      provider_request_id = NULLIF(TRIM(p_provider_request_id), ''),
      actual_input_tokens = GREATEST(0, p_actual_input_tokens),
      cached_input_tokens = GREATEST(0, p_cached_input_tokens),
      output_tokens = GREATEST(0, p_output_tokens),
      reasoning_tokens = GREATEST(0, p_reasoning_tokens),
      tool_calls = GREATEST(0, p_tool_calls), search_calls = GREATEST(0, p_search_calls),
      settled_at = NOW(), updated_at = NOW()
  WHERE id = v_reservation.id
  RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_xroga_provider_budget(
  p_user_id UUID,
  p_reservation_id UUID,
  p_error_category TEXT DEFAULT NULL,
  p_pending_reconciliation BOOLEAN DEFAULT FALSE
)
RETURNS public.xroga_provider_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.xroga_provider_reservations;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  SELECT * INTO v_reservation
  FROM public.xroga_provider_reservations
  WHERE id = p_reservation_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation_not_found'; END IF;
  IF v_reservation.status IN ('settled', 'released') THEN RETURN v_reservation; END IF;

  IF p_pending_reconciliation THEN
    UPDATE public.xroga_provider_reservations
    SET status = 'pending_reconciliation', error_category = p_error_category, updated_at = NOW()
    WHERE id = v_reservation.id RETURNING * INTO v_reservation;
    RETURN v_reservation;
  END IF;

  UPDATE public.xroga_billing_cycles
  SET reserved_micro_usd = reserved_micro_usd - v_reservation.reserved_micro_usd,
      updated_at = NOW()
  WHERE id = v_reservation.cycle_id;
  UPDATE public.xroga_provider_reservations
  SET status = 'released', error_category = p_error_category, updated_at = NOW()
  WHERE id = v_reservation.id RETURNING * INTO v_reservation;
  RETURN v_reservation;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_xroga_launch_promotion(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.xroga_unlocked_entitlement_micro_usd(public.xroga_billing_cycles, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_xroga_usage_pacing(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_xroga_paid_cycle(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_xroga_provider_budget(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_xroga_provider_budget(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_xroga_provider_budget(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_xroga_launch_promotion(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.xroga_unlocked_entitlement_micro_usd(public.xroga_billing_cycles, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_xroga_usage_pacing(UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_xroga_paid_cycle(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_xroga_provider_budget(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_xroga_provider_budget(UUID, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_xroga_provider_budget(UUID, UUID, TEXT, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';
