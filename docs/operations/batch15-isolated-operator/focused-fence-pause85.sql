-- Exact owner approval: 41a5b936, focused source-safe release. No schema or run mutation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission',0));
DO $guard$ BEGIN
IF (SELECT count(*) FROM public.xroga_release_fence WHERE singleton AND allowed_source='85f83e3f1dcbb057d4a28d8a696dae8396d45114') IS DISTINCT FROM 1
THEN RAISE EXCEPTION 'CANONICAL_FENCE_SOURCE_DRIFT'; END IF;
END; $guard$;
UPDATE public.xroga_release_fence SET allowed_source=NULL WHERE singleton;
COMMIT;
