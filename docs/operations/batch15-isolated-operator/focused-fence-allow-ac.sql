-- Exact owner approval: 41a5b936, focused source-safe release. No schema or run mutation.
-- Run only after paired API/Job source verification and exact owner approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission',0));
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.xroga_release_fence WHERE singleton AND allowed_source IS NULL)
     OR EXISTS (SELECT 1 FROM public.google_canonical_deliveries d
       LEFT JOIN public.swarm_runs r ON r.id=d.run_id AND r.user_id=d.user_id
       WHERE d.state IS DISTINCT FROM 'superseded' AND
         (r.id IS NULL OR r.status IS NULL OR r.status NOT IN ('completed','failed','complete','error','cancelled')))
  THEN RAISE EXCEPTION 'CANONICAL_FENCE_NOT_PAUSED_AND_DRAINED'; END IF;
END;
$guard$;
UPDATE public.xroga_release_fence SET allowed_source='ac8168f940d6e56079bbeb5e717ef33001b8b171' WHERE singleton;
COMMIT;
