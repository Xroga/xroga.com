-- Preparation only. Use after approval for this exact source pair.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission', 0));
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.xroga_release_fence WHERE singleton AND allowed_source IS NULL) <> 1
     OR EXISTS (
       SELECT 1 FROM public.google_canonical_deliveries d
       LEFT JOIN public.swarm_runs r ON r.id = d.run_id AND r.user_id = d.user_id
       WHERE d.state IS DISTINCT FROM 'superseded'
         AND (r.id IS NULL OR r.status IS NULL OR r.status NOT IN ('completed', 'failed', 'complete', 'error', 'cancelled'))
     )
  THEN RAISE EXCEPTION 'CANONICAL_FENCE_NOT_PAUSED_AND_DRAINED'; END IF;
END;
$guard$;
UPDATE public.xroga_release_fence SET allowed_source = 'af9fea61d05720051d748ca0f134bee002d7a65b' WHERE singleton;
COMMIT;
