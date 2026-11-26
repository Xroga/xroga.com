-- Preparation only. Use after approval for this exact source pair.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission', 0));
DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.xroga_release_fence WHERE singleton AND allowed_source = '1715953a6f1c2310e23e3437613a2bdaf70d41ff') <> 1
  THEN RAISE EXCEPTION 'CANONICAL_FENCE_SOURCE_DRIFT'; END IF;
END;
$guard$;
UPDATE public.xroga_release_fence SET allowed_source = NULL WHERE singleton;
COMMIT;
