-- PREPARATION ONLY. Production schema execution requires specific approval.
-- Shared admission state beside the canonical ledger, no new scheduler or service.
BEGIN;
ALTER TABLE public.xroga_provider_reservations
  ADD COLUMN IF NOT EXISTS dispatch_admission_id uuid,
  ADD COLUMN IF NOT EXISTS dispatch_admitted_at timestamptz;
CREATE TABLE IF NOT EXISTS public.xroga_model_request_capacity (
  key_fingerprint text PRIMARY KEY CHECK (key_fingerprint ~ '^[a-f0-9]{64}$'),
  lease_token uuid,
  lease_expires_at timestamptz NOT NULL DEFAULT '-infinity',
  next_dispatch_at timestamptz NOT NULL DEFAULT '-infinity',
  cooldown_until timestamptz NOT NULL DEFAULT '-infinity'
);
ALTER TABLE public.xroga_model_request_capacity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xroga_model_request_capacity FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.xroga_model_request_capacity TO service_role;

CREATE OR REPLACE FUNCTION public.claim_xroga_model_request(
  p_user_id uuid,p_reservation_id uuid,p_key text,p_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE capacity public.xroga_model_request_capacity%ROWTYPE;
  reservation public.xroga_provider_reservations%ROWTYPE;
  dispatch_now timestamptz;
  eligible_at timestamptz;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[a-f0-9]{64}$' OR p_token IS NULL THEN
    RAISE EXCEPTION 'MODEL_CAPACITY_BINDING_INVALID';
  END IF;
  -- Serialize only this credential. Sample the database clock after lock waits.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xroga-model-capacity:'||p_key,0));
  SELECT * INTO reservation FROM public.xroga_provider_reservations
    WHERE id=p_reservation_id AND user_id=p_user_id FOR UPDATE;
  dispatch_now:=pg_catalog.clock_timestamp();
  IF NOT FOUND OR reservation.status IS DISTINCT FROM 'reserved'
     OR reservation.internal_route NOT IN ('deepseek_v4_1_flash_1017','claude_sonnet_5_5')
     OR reservation.dispatch_admission_id IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public.xroga_billing_cycles
       WHERE id=reservation.cycle_id AND user_id=p_user_id AND status='active'
         AND starts_at<=dispatch_now AND ends_at>dispatch_now) THEN
    RAISE EXCEPTION 'CURRENT_MODEL_RESERVATION_REQUIRED';
  END IF;
  INSERT INTO public.xroga_model_request_capacity(key_fingerprint) VALUES(p_key) ON CONFLICT DO NOTHING;
  SELECT * INTO capacity FROM public.xroga_model_request_capacity WHERE key_fingerprint=p_key FOR UPDATE;
  eligible_at:=greatest(capacity.lease_expires_at,capacity.next_dispatch_at,capacity.cooldown_until);
  IF eligible_at>dispatch_now THEN
    RETURN pg_catalog.jsonb_build_object('granted',false,'retry_after_ms',
      least(210000,ceil(extract(epoch FROM eligible_at-dispatch_now)*1000)::integer));
  END IF;
  UPDATE public.xroga_provider_reservations SET dispatch_admission_id=p_token,dispatch_admitted_at=dispatch_now
    WHERE id=p_reservation_id AND user_id=p_user_id;
  -- Six RPM with one-second spacing headroom. One in-flight request per key.
  -- HTTP lifetime is bounded to 180 seconds, below this crash-recovery lease.
  UPDATE public.xroga_model_request_capacity SET lease_token=p_token,
    lease_expires_at=dispatch_now+interval '210 seconds',next_dispatch_at=dispatch_now+interval '11 seconds'
    WHERE key_fingerprint=p_key;
  RETURN pg_catalog.jsonb_build_object('granted',true,'retry_after_ms',0);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_xroga_model_request(p_key text,p_token uuid,p_cooldown_seconds integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_cooldown_seconds IS NULL OR p_cooldown_seconds NOT BETWEEN 0 AND 300 THEN
    RAISE EXCEPTION 'MODEL_COOLDOWN_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xroga-model-capacity:'||p_key,0));
  UPDATE public.xroga_model_request_capacity SET lease_token=NULL,lease_expires_at='-infinity',
    cooldown_until=greatest(cooldown_until,pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>p_cooldown_seconds))
    WHERE key_fingerprint=p_key AND lease_token=p_token;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_xroga_model_request(uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_xroga_model_request(text,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_xroga_model_request(uuid,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_xroga_model_request(text,uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
