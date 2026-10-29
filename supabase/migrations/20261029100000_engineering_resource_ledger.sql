-- Batch 4: engineering resource ledger.
--
-- Model spend already has its own ledger (reserve_xroga_provider_budget). Sandbox compute, browser sessions and persistent storage did not have one,
-- so the cost of an engineering run was only the model cost. This adds one reserve/settle ledger for those three categories, with the same shape:
--   reserve  atomically, per owner and category, against a cap the caller passes in (the cap is configuration, not a number baked into the schema);
--   settle   exactly once, with the actual measured units;
--   release  a hold that was never used.
-- Reservations are idempotent by (run, category, key), so a redelivered request or a retried worker can never reserve or settle twice.
-- Nothing here prices anything. Units are what the provider boundary measured: seconds of compute, seconds of browser session, bytes stored.
--
-- Additive and service-role only. Not applied to production by this change.

CREATE TABLE IF NOT EXISTS public.engineering_resource_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  run_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sandbox_compute_seconds', 'browser_session_seconds', 'storage_bytes')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  reserved_units NUMERIC NOT NULL CHECK (reserved_units > 0),
  settled_units NUMERIC CHECK (settled_units >= 0),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'released')),
  provider_resource_id TEXT CHECK (provider_resource_id IS NULL OR length(provider_resource_id) <= 256),
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  settled_at TIMESTAMPTZ,
  CONSTRAINT engineering_resource_state_units CHECK (
    (state = 'reserved' AND settled_units IS NULL AND settled_at IS NULL)
    OR (state = 'settled' AND settled_units IS NOT NULL AND settled_at IS NOT NULL)
    OR (state = 'released' AND settled_units IS NULL AND settled_at IS NOT NULL)),
  CONSTRAINT engineering_resource_unique_key UNIQUE (run_id, category, idempotency_key)
);
CREATE INDEX IF NOT EXISTS engineering_resource_owner_window ON public.engineering_resource_reservations (user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS engineering_resource_open ON public.engineering_resource_reservations (created_at) WHERE state = 'reserved';

ALTER TABLE public.engineering_resource_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.engineering_resource_reservations FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.engineering_resource_reservations FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.engineering_resource_reservations FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN GRANT SELECT, INSERT, UPDATE ON public.engineering_resource_reservations TO service_role; END IF;
END $$;

-- Units already committed to an owner's category inside the window. A settled row counts what was actually measured; an open reservation counts
-- what was held; a released one counts nothing.
CREATE OR REPLACE FUNCTION public.engineering_resource_used(p_user UUID, p_category TEXT, p_window INTERVAL)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(SUM(CASE WHEN state = 'settled' THEN settled_units ELSE reserved_units END), 0)
  FROM public.engineering_resource_reservations
  WHERE user_id = p_user AND category = p_category AND state <> 'released' AND created_at >= clock_timestamp() - p_window;
$$;

CREATE OR REPLACE FUNCTION public.reserve_engineering_resource(
  p_user UUID, p_run UUID, p_category TEXT, p_units NUMERIC, p_key TEXT, p_cap NUMERIC, p_window INTERVAL)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE existing public.engineering_resource_reservations%ROWTYPE; used NUMERIC; created_id UUID;
BEGIN
  IF p_user IS NULL OR p_run IS NULL OR p_units IS NULL OR p_units <= 0 OR p_cap IS NULL OR p_cap <= 0 OR p_key IS NULL
     OR p_window IS NULL OR p_window <= INTERVAL '0' OR p_window > INTERVAL '31 days' THEN
    RAISE EXCEPTION 'RESOURCE_INVALID';
  END IF;
  -- one writer per owner and category: the cap check and the insert cannot race another reservation
  PERFORM pg_advisory_xact_lock(hashtext('xroga-engineering-resource:' || p_user::text || ':' || p_category));
  SELECT * INTO existing FROM public.engineering_resource_reservations WHERE run_id = p_run AND category = p_category AND idempotency_key = p_key;
  IF FOUND THEN
    IF existing.user_id <> p_user THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND'; END IF;
    RETURN jsonb_build_object('state', 'duplicate', 'reservationId', existing.id, 'ledgerState', existing.state);
  END IF;
  used := public.engineering_resource_used(p_user, p_category, p_window);
  IF used + p_units > p_cap THEN RETURN jsonb_build_object('state', 'exhausted', 'used', used, 'cap', p_cap); END IF;
  INSERT INTO public.engineering_resource_reservations (user_id, run_id, category, idempotency_key, reserved_units)
    VALUES (p_user, p_run, p_category, p_key, p_units) RETURNING id INTO created_id;
  RETURN jsonb_build_object('state', 'reserved', 'reservationId', created_id);
END;
$$;

-- Settles exactly once. A second settle of the same reservation changes nothing and says so; a released hold cannot be settled.
CREATE OR REPLACE FUNCTION public.settle_engineering_resource(p_user UUID, p_reservation UUID, p_actual NUMERIC, p_provider_resource TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.engineering_resource_reservations%ROWTYPE;
BEGIN
  IF p_user IS NULL OR p_reservation IS NULL OR p_actual IS NULL OR p_actual < 0 THEN RAISE EXCEPTION 'RESOURCE_INVALID'; END IF;
  SELECT * INTO r FROM public.engineering_resource_reservations WHERE id = p_reservation AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND'; END IF;
  IF r.state = 'settled' THEN RETURN jsonb_build_object('state', 'already_settled', 'settledUnits', r.settled_units); END IF;
  IF r.state = 'released' THEN RETURN jsonb_build_object('state', 'released'); END IF;
  UPDATE public.engineering_resource_reservations SET state = 'settled', settled_units = p_actual, settled_at = clock_timestamp(),
    provider_resource_id = COALESCE(p_provider_resource, provider_resource_id), note = CASE WHEN p_actual > r.reserved_units THEN 'overrun' ELSE note END
    WHERE id = p_reservation;
  RETURN jsonb_build_object('state', 'settled', 'settledUnits', p_actual, 'overrun', p_actual > r.reserved_units);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_engineering_resource(p_user UUID, p_reservation UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r public.engineering_resource_reservations%ROWTYPE;
BEGIN
  IF p_user IS NULL OR p_reservation IS NULL THEN RAISE EXCEPTION 'RESOURCE_INVALID'; END IF;
  SELECT * INTO r FROM public.engineering_resource_reservations WHERE id = p_reservation AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND'; END IF;
  IF r.state <> 'reserved' THEN RETURN jsonb_build_object('state', r.state); END IF;
  UPDATE public.engineering_resource_reservations SET state = 'released', settled_at = clock_timestamp() WHERE id = p_reservation;
  RETURN jsonb_build_object('state', 'released');
END;
$$;

-- A hold whose worker never settled or released it is a leak. It is charged in full, conservatively, as "swept", never silently dropped,
-- so a crashed worker can neither hide usage nor keep capacity blocked forever. Returns how many were swept.
CREATE OR REPLACE FUNCTION public.sweep_stale_engineering_reservations(p_older_than INTERVAL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE swept INTEGER;
BEGIN
  IF p_older_than IS NULL OR p_older_than < INTERVAL '1 minute' THEN RAISE EXCEPTION 'RESOURCE_INVALID'; END IF;
  UPDATE public.engineering_resource_reservations SET state = 'settled', settled_units = reserved_units, settled_at = clock_timestamp(), note = 'swept_unsettled'
    WHERE state = 'reserved' AND created_at < clock_timestamp() - p_older_than;
  GET DIAGNOSTICS swept = ROW_COUNT;
  RETURN swept;
END;
$$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.engineering_resource_used(UUID, TEXT, INTERVAL) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.reserve_engineering_resource(UUID, UUID, TEXT, NUMERIC, TEXT, NUMERIC, INTERVAL) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.settle_engineering_resource(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.release_engineering_resource(UUID, UUID) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.sweep_stale_engineering_reservations(INTERVAL) FROM PUBLIC;
  -- Supabase's default privileges grant EXECUTE on new public functions to anon and authenticated directly, which REVOKE FROM PUBLIC does not remove.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.engineering_resource_used(UUID, TEXT, INTERVAL) FROM anon;
    REVOKE ALL ON FUNCTION public.reserve_engineering_resource(UUID, UUID, TEXT, NUMERIC, TEXT, NUMERIC, INTERVAL) FROM anon;
    REVOKE ALL ON FUNCTION public.settle_engineering_resource(UUID, UUID, NUMERIC, TEXT) FROM anon;
    REVOKE ALL ON FUNCTION public.release_engineering_resource(UUID, UUID) FROM anon;
    REVOKE ALL ON FUNCTION public.sweep_stale_engineering_reservations(INTERVAL) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.engineering_resource_used(UUID, TEXT, INTERVAL) FROM authenticated;
    REVOKE ALL ON FUNCTION public.reserve_engineering_resource(UUID, UUID, TEXT, NUMERIC, TEXT, NUMERIC, INTERVAL) FROM authenticated;
    REVOKE ALL ON FUNCTION public.settle_engineering_resource(UUID, UUID, NUMERIC, TEXT) FROM authenticated;
    REVOKE ALL ON FUNCTION public.release_engineering_resource(UUID, UUID) FROM authenticated;
    REVOKE ALL ON FUNCTION public.sweep_stale_engineering_reservations(INTERVAL) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.engineering_resource_used(UUID, TEXT, INTERVAL) TO service_role;
    GRANT EXECUTE ON FUNCTION public.reserve_engineering_resource(UUID, UUID, TEXT, NUMERIC, TEXT, NUMERIC, INTERVAL) TO service_role;
    GRANT EXECUTE ON FUNCTION public.settle_engineering_resource(UUID, UUID, NUMERIC, TEXT) TO service_role;
    GRANT EXECUTE ON FUNCTION public.release_engineering_resource(UUID, UUID) TO service_role;
    GRANT EXECUTE ON FUNCTION public.sweep_stale_engineering_reservations(INTERVAL) TO service_role;
  END IF;
END $$;
