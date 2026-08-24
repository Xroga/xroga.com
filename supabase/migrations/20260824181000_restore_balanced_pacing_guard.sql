-- Returning to balanced pacing must also remove the accelerated allowance that
-- Full Access installed. Leaving it in place made the UI say balanced while the
-- provider budget remained almost fully unlocked for the rest of the cycle.

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
        ELSE 0
      END,
      updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active'
  RETURNING * INTO v_cycle;

  IF NOT FOUND THEN RAISE EXCEPTION 'active_billing_cycle_required'; END IF;
  RETURN v_cycle;
END;
$$;

REVOKE ALL ON FUNCTION public.set_xroga_usage_pacing(UUID, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_xroga_usage_pacing(UUID, TEXT, BOOLEAN)
  TO service_role;

-- Repair cycles that were already switched back to balanced under the previous
-- function. This is idempotent and does not change any user's consumed amount.
UPDATE public.xroga_billing_cycles
SET accelerated_unlock_micro_usd = 0,
    updated_at = NOW()
WHERE pacing = 'balanced_month'
  AND accelerated_unlock_micro_usd <> 0;
