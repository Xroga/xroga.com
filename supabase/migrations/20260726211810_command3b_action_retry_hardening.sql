-- Command 3B follow-up: an interrupted or provider-failed action may be
-- reclaimed only after its lease expires and only within its attempt budget.
CREATE OR REPLACE FUNCTION public.operations_claim_action(
  p_action_id UUID,
  p_lease_owner TEXT,
  p_lease_seconds INT DEFAULT 60
) RETURNS SETOF public.operations_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_action_id::text, 0)) THEN
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE public.operations_actions
     SET status = 'running', lease_owner = p_lease_owner,
         lease_expires_at = NOW() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 10), 600)),
         attempt_count = attempt_count + 1,
         started_at = COALESCE(started_at, NOW()), updated_at = NOW()
   WHERE id = p_action_id
     AND status IN ('queued','approved','failed','running')
     AND attempt_count < max_attempts
     AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.operations_claim_action(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operations_claim_action(UUID, TEXT, INT) TO service_role;
