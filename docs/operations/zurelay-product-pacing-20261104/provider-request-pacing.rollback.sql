-- ROLLBACK for provider-request-pacing.sql. PREPARATION ONLY. Production schema execution requires specific approval.
-- Run only AFTER the API/Job revision that calls claim_xroga_model_request has been replaced by one that does not;
-- a revision that still calls the function will fail closed (no model request is sent) once it is gone.
-- Financial columns and rows in xroga_provider_reservations are never read or rewritten here. Only the two
-- admission-fence columns added by the forward migration are removed. Idempotent.
BEGIN;
DROP FUNCTION IF EXISTS public.claim_xroga_model_request(uuid,uuid,text,uuid);
DROP FUNCTION IF EXISTS public.release_xroga_model_request(text,uuid,integer);
DROP TABLE IF EXISTS public.xroga_model_request_capacity;
ALTER TABLE public.xroga_provider_reservations
  DROP COLUMN IF EXISTS dispatch_admission_id,
  DROP COLUMN IF EXISTS dispatch_admitted_at;
NOTIFY pgrst, 'reload schema';
COMMIT;
