-- PREPARATION ONLY. Specific response release approval and verified API/Job parity required.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission',0));
DO $guard$ BEGIN
IF (SELECT count(*) FROM public.xroga_release_fence WHERE singleton AND allowed_source='fded88f45384d0514ae9a6c69d87a726b61d9669') IS DISTINCT FROM 1
THEN RAISE EXCEPTION 'CANONICAL_FENCE_SOURCE_DRIFT'; END IF;
END; $guard$;
UPDATE public.xroga_release_fence SET allowed_source=NULL WHERE singleton;
COMMIT;
