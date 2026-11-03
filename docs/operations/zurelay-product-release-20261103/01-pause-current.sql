-- PREPARATION ONLY. Specific response release approval and verified API/Job parity required.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission',0));
DO $guard$ BEGIN
IF (SELECT count(*) FROM public.xroga_release_fence WHERE singleton AND allowed_source='cd5541c6c887a11ba68aaf3cccfb78609f906167') IS DISTINCT FROM 1
THEN RAISE EXCEPTION 'CANONICAL_FENCE_SOURCE_DRIFT'; END IF;
END; $guard$;
UPDATE public.xroga_release_fence SET allowed_source=NULL WHERE singleton;
COMMIT;
