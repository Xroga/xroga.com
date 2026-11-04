-- Batch 4: read-only operator diagnostics for stalled runs, queues and orphans.
--
-- Returns counts, ages and a few identifiers, never a prompt, payload, output or credential. It reads the three tables the engineering path already
-- owns (swarm_runs, google_canonical_deliveries, engineering_resource_reservations) and changes nothing. The thresholds are passed in by the caller
-- (configuration, not constants), so the same numbers the reconciler and the sweep use are the numbers reported here.
--
-- Depends on 20261026000000_google_canonical_deliveries.sql and 20261029100000_engineering_resource_ledger.sql. Additive, service-role only, and not
-- applied to production by this change.

CREATE OR REPLACE FUNCTION public.engineering_diagnostics(p_queue_ttl INTERVAL, p_worker_stale INTERVAL, p_hold_stale INTERVAL)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE now_ts TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_queue_ttl IS NULL OR p_worker_stale IS NULL OR p_hold_stale IS NULL
     OR p_queue_ttl < INTERVAL '1 minute' OR p_worker_stale < INTERVAL '1 minute' OR p_hold_stale < INTERVAL '1 minute' THEN
    RAISE EXCEPTION 'DIAGNOSTICS_INVALID';
  END IF;
  RETURN jsonb_build_object(
    'generatedAt', now_ts,
    'runs', jsonb_build_object(
      'queuedWaiting', (SELECT count(*) FROM public.swarm_runs WHERE status = 'running' AND worker_id IS NULL AND lease_generation IS NULL AND heartbeat_at IS NOT NULL),
      'queuedOldestSeconds', (SELECT COALESCE(floor(extract(epoch FROM now_ts - min(heartbeat_at))), 0)::bigint FROM public.swarm_runs WHERE status = 'running' AND worker_id IS NULL AND lease_generation IS NULL AND heartbeat_at IS NOT NULL),
      'queuedPastWait', (SELECT count(*) FROM public.swarm_runs WHERE status = 'running' AND worker_id IS NULL AND lease_generation IS NULL AND heartbeat_at < now_ts - p_queue_ttl),
      'staleWorkerRuns', (SELECT count(*) FROM public.swarm_runs WHERE status = 'running' AND (worker_id IS NOT NULL OR lease_generation IS NOT NULL) AND heartbeat_at < now_ts - p_worker_stale),
      'runningWithoutHeartbeat', (SELECT count(*) FROM public.swarm_runs WHERE status = 'running' AND heartbeat_at IS NULL)),
    'deliveries', jsonb_build_object(
      'pending', (SELECT count(*) FROM public.google_canonical_deliveries WHERE state = 'pending'),
      'pendingOldestSeconds', (SELECT COALESCE(floor(extract(epoch FROM now_ts - min(created_at))), 0)::bigint FROM public.google_canonical_deliveries WHERE state = 'pending'),
      'launchingLeaseExpired', (SELECT count(*) FROM public.google_canonical_deliveries WHERE state = 'launching' AND launch_lease_until < now_ts),
      'atAttemptCeiling', (SELECT count(*) FROM public.google_canonical_deliveries WHERE state IN ('pending', 'launching') AND launch_attempts >= 5),
      'running', (SELECT count(*) FROM public.google_canonical_deliveries WHERE state = 'running')),
    'reservations', jsonb_build_object(
      'open', (SELECT count(*) FROM public.engineering_resource_reservations WHERE state = 'reserved'),
      'openOlderThanStale', (SELECT count(*) FROM public.engineering_resource_reservations WHERE state = 'reserved' AND created_at < now_ts - p_hold_stale),
      'oldestOpenSeconds', (SELECT COALESCE(floor(extract(epoch FROM now_ts - min(created_at))), 0)::bigint FROM public.engineering_resource_reservations WHERE state = 'reserved'),
      'sweptLast24h', (SELECT count(*) FROM public.engineering_resource_reservations WHERE note = 'swept_unsettled' AND settled_at > now_ts - INTERVAL '1 day'),
      'overrunsLast24h', (SELECT count(*) FROM public.engineering_resource_reservations WHERE note = 'overrun' AND settled_at > now_ts - INTERVAL '1 day')),
    'samples', jsonb_build_object(
      'staleWorkerRunIds', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM (SELECT id FROM public.swarm_runs WHERE status = 'running' AND (worker_id IS NOT NULL OR lease_generation IS NOT NULL) AND heartbeat_at < now_ts - p_worker_stale ORDER BY heartbeat_at LIMIT 10) s),
      'queuedPastWaitRunIds', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM (SELECT id FROM public.swarm_runs WHERE status = 'running' AND worker_id IS NULL AND lease_generation IS NULL AND heartbeat_at < now_ts - p_queue_ttl ORDER BY heartbeat_at LIMIT 10) s),
      'launchingExpiredDeliveryIds', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM (SELECT id FROM public.google_canonical_deliveries WHERE state = 'launching' AND launch_lease_until < now_ts ORDER BY launch_lease_until LIMIT 10) s),
      'openStaleReservationIds', (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM (SELECT id FROM public.engineering_resource_reservations WHERE state = 'reserved' AND created_at < now_ts - p_hold_stale ORDER BY created_at LIMIT 10) s))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_engineering_resource_limits(p_user UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'DIAGNOSTICS_INVALID'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'cap', cap, 'updatedAt', updated_at) ORDER BY category), '[]'::jsonb)
          FROM public.engineering_resource_limits WHERE user_id = p_user);
END;
$$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.engineering_diagnostics(INTERVAL, INTERVAL, INTERVAL) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.list_engineering_resource_limits(UUID) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.engineering_diagnostics(INTERVAL, INTERVAL, INTERVAL) FROM anon;
    REVOKE ALL ON FUNCTION public.list_engineering_resource_limits(UUID) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.engineering_diagnostics(INTERVAL, INTERVAL, INTERVAL) FROM authenticated;
    REVOKE ALL ON FUNCTION public.list_engineering_resource_limits(UUID) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.engineering_diagnostics(INTERVAL, INTERVAL, INTERVAL) TO service_role;
    GRANT EXECUTE ON FUNCTION public.list_engineering_resource_limits(UUID) TO service_role;
  END IF;
END $$;
