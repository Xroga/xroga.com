-- Preparation only. Use after approval for this exact source pair.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission', 0));
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.xroga_release_fence WHERE singleton AND allowed_source = 'af9fea61d05720051d748ca0f134bee002d7a65b') <> 1
  THEN RAISE EXCEPTION 'CANONICAL_FENCE_SOURCE_DRIFT'; END IF;
END;
$guard$;
UPDATE public.xroga_release_fence SET allowed_source = NULL WHERE singleton;
COMMIT;
