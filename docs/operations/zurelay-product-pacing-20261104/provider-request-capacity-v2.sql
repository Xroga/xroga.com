-- Prepare after provider-request-pacing.sql. Existing keys stay at 3 RPM / one in flight.
BEGIN;
ALTER TABLE public.xroga_model_request_capacity
  ADD COLUMN IF NOT EXISTS dispatch_interval_ms integer NOT NULL DEFAULT 21000 CHECK (dispatch_interval_ms BETWEEN 500 AND 21000),
  ADD COLUMN IF NOT EXISTS max_in_flight integer NOT NULL DEFAULT 1 CHECK (max_in_flight BETWEEN 1 AND 16),
  ADD COLUMN IF NOT EXISTS max_per_user integer NOT NULL DEFAULT 1 CHECK (max_per_user BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS leases jsonb NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.claim_xroga_model_request(p_user_id uuid,p_reservation_id uuid,p_key text,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  capacity public.xroga_model_request_capacity%ROWTYPE;
  reservation public.xroga_provider_reservations%ROWTYPE;
  dispatch_now timestamptz;
  eligible_at timestamptz;
  active_leases jsonb;
  active_count integer;
  owner_count integer;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[a-f0-9]{64}$' OR p_token IS NULL THEN
    RAISE EXCEPTION 'MODEL_CAPACITY_BINDING_INVALID';
  END IF;
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
  -- Honor any in-flight lease admitted by the earlier function until it drains.
  eligible_at:=greatest(capacity.lease_expires_at,capacity.next_dispatch_at,capacity.cooldown_until);
  IF eligible_at>dispatch_now THEN
    RETURN pg_catalog.jsonb_build_object('granted',false,'retry_after_ms',
      least(210000,ceil(extract(epoch FROM eligible_at-dispatch_now)*1000)::integer));
  END IF;
  SELECT coalesce(pg_catalog.jsonb_object_agg(entry.key,entry.value),'{}'::jsonb),count(*),
         count(*) FILTER (WHERE entry.value->>'owner'=p_user_id::text)
    INTO active_leases,active_count,owner_count
    FROM pg_catalog.jsonb_each(capacity.leases) AS entry
    WHERE (entry.value->>'expires')::timestamptz>dispatch_now;
  IF active_leases ? p_token::text THEN RAISE EXCEPTION 'MODEL_CAPACITY_BINDING_INVALID'; END IF;
  IF active_count>=capacity.max_in_flight OR owner_count>=capacity.max_per_user THEN
    -- Release can happen at any moment. A short wait lets a cancelled waiter leave promptly.
    RETURN pg_catalog.jsonb_build_object('granted',false,'retry_after_ms',500);
  END IF;
  UPDATE public.xroga_provider_reservations SET dispatch_admission_id=p_token,dispatch_admitted_at=dispatch_now
    WHERE id=p_reservation_id AND user_id=p_user_id;
  UPDATE public.xroga_model_request_capacity SET
    leases=active_leases||pg_catalog.jsonb_build_object(p_token::text,
      pg_catalog.jsonb_build_object('owner',p_user_id,'expires',dispatch_now+interval '210 seconds')),
    next_dispatch_at=dispatch_now+capacity.dispatch_interval_ms*interval '1 millisecond'
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
  UPDATE public.xroga_model_request_capacity SET
    leases=leases-p_token::text,
    lease_token=CASE WHEN lease_token=p_token THEN NULL ELSE lease_token END,
    lease_expires_at=CASE WHEN lease_token=p_token THEN '-infinity' ELSE lease_expires_at END,
    cooldown_until=greatest(cooldown_until,pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>p_cooldown_seconds))
    WHERE key_fingerprint=p_key AND (lease_token=p_token OR leases ? p_token::text);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_xroga_model_request(uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_xroga_model_request(text,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_xroga_model_request(uuid,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_xroga_model_request(text,uuid,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
