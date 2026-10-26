-- Delivery transport for the existing Swarm pipeline. No task graph, planner,
-- credential authority or automatic consequential-operation retry is added.
-- Apply only after isolated fresh/upgrade and ownership/concurrency proof.
CREATE TABLE public.google_canonical_deliveries (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.swarm_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input_payload JSONB NOT NULL CHECK (jsonb_typeof(input_payload)='object' AND octet_length(input_payload::text)<=524288),
  source_sha TEXT NOT NULL CHECK (source_sha ~ '^[a-f0-9]{40}$'),
  fresh_start BOOLEAN NOT NULL DEFAULT FALSE,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','launching','running','superseded')),
  launch_token UUID,
  launch_lease_until TIMESTAMPTZ,
  launch_attempts INTEGER NOT NULL DEFAULT 0 CHECK (launch_attempts BETWEEN 0 AND 5),
  operation_name TEXT,
  worker_id TEXT,
  lease_generation UUID,
  result_success BOOLEAN,
  result_follow_ups JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX google_canonical_deliveries_run ON public.google_canonical_deliveries(run_id,created_at DESC);
CREATE UNIQUE INDEX google_canonical_deliveries_current ON public.google_canonical_deliveries(run_id) WHERE state<>'superseded';
ALTER TABLE public.google_canonical_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_canonical_deliveries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.google_canonical_deliveries TO service_role;

CREATE FUNCTION public.enqueue_google_canonical_run(p_delivery UUID,p_run UUID,p_owner UUID,p_project UUID,p_input JSONB,p_source TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.swarm_runs%ROWTYPE; d public.google_canonical_deliveries%ROWTYPE; inserted_count INTEGER; allow_fresh BOOLEAN;
BEGIN
  IF p_delivery IS NULL OR p_run IS NULL OR p_owner IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR length(COALESCE(p_input->>'prompt',''))=0
    OR octet_length(p_input::text)>524288 OR p_source IS NULL OR p_source !~ '^[a-f0-9]{40}$' THEN RAISE EXCEPTION 'DELIVERY_INVALID'; END IF;
  IF p_project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project AND user_id=p_owner) THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND';
  END IF;
  INSERT INTO public.swarm_runs(id,user_id,project_id,prompt,status,iteration_count,events,last_sequence,heartbeat_at)
    VALUES(p_run,p_owner,p_project,left(p_input->>'prompt',8000),'running',0,'[]',0,clock_timestamp()) ON CONFLICT(id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT * INTO STRICT r FROM public.swarm_runs WHERE id=p_run FOR UPDATE;
  IF r.user_id<>p_owner OR r.project_id IS DISTINCT FROM p_project THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;
  SELECT * INTO d FROM public.google_canonical_deliveries WHERE run_id=p_run AND state<>'superseded';
  IF inserted_count=1 AND COALESCE(p_input#>>'{clientMeta,resumeRun}','false')='true' THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;
  IF d.id IS NULL AND inserted_count=0 AND r.status='running' THEN RAISE EXCEPTION 'DELIVERY_CONFLICT'; END IF;
  IF FOUND AND r.status='running' THEN
    IF d.user_id<>p_owner OR d.input_payload<>p_input OR d.source_sha<>p_source THEN RAISE EXCEPTION 'DELIVERY_CONFLICT'; END IF;
    RETURN jsonb_build_object('deliveryId',d.id,'runId',d.run_id,'userId',d.user_id,'sourceSha',d.source_sha);
  END IF;
  -- A retry with no checkpoint is safe only for a run originally created by
  -- this queue that has never issued any worker generation. Preserve the bit
  -- through repeated pre-start cancellations, never through an actual attempt.
  allow_fresh := inserted_count=1 OR (COALESCE(d.fresh_start,FALSE) AND NOT EXISTS
    (SELECT 1 FROM public.google_canonical_deliveries WHERE run_id=p_run AND worker_id IS NOT NULL));
  IF r.worker_id IS NOT NULL OR r.lease_generation IS NOT NULL OR r.status<>'running' THEN
    IF r.status NOT IN ('error','cancelled') OR COALESCE(p_input#>>'{clientMeta,resumeRun}','false')<>'true' THEN
      RAISE EXCEPTION 'DELIVERY_CONFLICT';
    END IF;
    UPDATE public.swarm_runs SET status='running',worker_id=NULL,lease_generation=NULL,
      heartbeat_at=clock_timestamp(),completed_at=NULL WHERE id=p_run AND user_id=p_owner;
  END IF;
  -- An explicit resume creates a different delivery. Old Tasks and delayed Jobs
  -- must never regain authority to replay the prior request against that run.
  UPDATE public.google_canonical_deliveries SET state='superseded' WHERE run_id=p_run AND user_id=p_owner;
  INSERT INTO public.google_canonical_deliveries(id,run_id,user_id,input_payload,source_sha,fresh_start)
    VALUES(p_delivery,p_run,p_owner,p_input,p_source,allow_fresh) RETURNING * INTO d;
  RETURN jsonb_build_object('deliveryId',d.id,'runId',d.run_id,'userId',d.user_id,'sourceSha',d.source_sha);
END;
$$;

-- Only the private OIDC dispatcher calls this. It reserves launch capacity,
-- not actor authority. Unknown launch outcomes retain their lease and are not
-- immediately retried. Five attempts is an absolute per-delivery ceiling.
CREATE FUNCTION public.reserve_google_canonical_launch(p_delivery UUID,p_source TEXT,p_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.google_canonical_deliveries%ROWTYPE; r public.swarm_runs%ROWTYPE; active_count INTEGER; run_key UUID;
BEGIN
  IF p_delivery IS NULL OR p_token IS NULL OR p_source IS NULL OR p_source !~ '^[a-f0-9]{40}$' THEN RAISE EXCEPTION 'DELIVERY_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('xroga-google-canonical-launch'));
  SELECT run_id INTO run_key FROM public.google_canonical_deliveries WHERE id=p_delivery;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','absent'); END IF;
  SELECT * INTO STRICT r FROM public.swarm_runs WHERE id=run_key FOR UPDATE;
  SELECT * INTO STRICT d FROM public.google_canonical_deliveries WHERE id=p_delivery FOR UPDATE;
  IF d.source_sha<>p_source THEN RAISE EXCEPTION 'DELIVERY_SOURCE_MISMATCH'; END IF;
  IF r.user_id<>d.user_id THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;
  IF r.status<>'running' OR d.state IN ('running','superseded') THEN RETURN jsonb_build_object('state','acknowledged'); END IF;
  IF d.launch_attempts>=5 OR (d.state='launching' AND d.launch_lease_until>clock_timestamp()) THEN
    RETURN jsonb_build_object('state','busy');
  END IF;
  SELECT count(*) INTO active_count FROM public.google_canonical_deliveries q JOIN public.swarm_runs s ON s.id=q.run_id AND s.user_id=q.user_id
    WHERE s.status='running' AND ((q.state='launching' AND q.launch_lease_until>clock_timestamp())
      OR (q.state='running' AND s.worker_id=q.worker_id AND s.lease_generation=q.lease_generation AND s.heartbeat_at>clock_timestamp()-interval '5 minutes'));
  IF active_count>=2 THEN RETURN jsonb_build_object('state','busy'); END IF;
  UPDATE public.google_canonical_deliveries SET state='launching',launch_token=p_token,
    launch_lease_until=clock_timestamp()+interval '3 minutes',launch_attempts=launch_attempts+1,operation_name=NULL WHERE id=p_delivery;
  RETURN jsonb_build_object('state','reserved','deliveryId',p_delivery,'token',p_token);
END;
$$;

CREATE FUNCTION public.record_google_canonical_launch(p_delivery UUID,p_token UUID,p_operation TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF p_delivery IS NULL OR p_token IS NULL OR p_operation IS NULL OR p_operation !~ '^projects/[a-z0-9-]+/locations/[a-z0-9-]+/operations/[a-zA-Z0-9_-]+$' THEN RAISE EXCEPTION 'DELIVERY_INVALID'; END IF;
  UPDATE public.google_canonical_deliveries SET operation_name=p_operation
    WHERE id=p_delivery AND launch_token=p_token AND state IN ('launching','running');
  RETURN FOUND;
END;
$$;

-- This is the only queued -> canonical worker handoff. The run row lock and
-- empty generation predicate allow one worker, including duplicate Job starts.
-- Cancellation or an orphan reconciliation wins the same row lock and denies
-- subsequent claims. No failed/complete run is automatically reopened here.
CREATE FUNCTION public.claim_google_canonical_run(p_delivery UUID,p_source TEXT,p_worker TEXT,p_generation UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d public.google_canonical_deliveries%ROWTYPE; r public.swarm_runs%ROWTYPE; run_key UUID;
BEGIN
  IF p_delivery IS NULL OR p_generation IS NULL OR p_source IS NULL OR p_source !~ '^[a-f0-9]{40}$'
    OR p_worker IS NULL OR length(p_worker)<1 OR length(p_worker)>128 THEN RAISE EXCEPTION 'DELIVERY_INVALID'; END IF;
  SELECT run_id INTO run_key FROM public.google_canonical_deliveries WHERE id=p_delivery;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO STRICT r FROM public.swarm_runs WHERE id=run_key FOR UPDATE;
  SELECT * INTO STRICT d FROM public.google_canonical_deliveries WHERE id=p_delivery FOR UPDATE;
  IF d.source_sha<>p_source THEN RAISE EXCEPTION 'DELIVERY_SOURCE_MISMATCH'; END IF;
  IF r.user_id<>d.user_id OR r.status<>'running' OR r.worker_id IS NOT NULL OR r.lease_generation IS NOT NULL
    OR d.state<>'launching' OR d.launch_lease_until<=clock_timestamp() THEN RETURN NULL; END IF;
  UPDATE public.swarm_runs SET worker_id=p_worker,lease_generation=p_generation,heartbeat_at=clock_timestamp()
    WHERE id=r.id AND user_id=d.user_id RETURNING * INTO r;
  UPDATE public.google_canonical_deliveries SET state='running',worker_id=p_worker,lease_generation=p_generation WHERE id=p_delivery;
  RETURN jsonb_build_object('deliveryId',d.id,'runId',r.id,'userId',r.user_id,'sourceSha',d.source_sha,
    'input',d.input_payload,'workerId',p_worker,'generation',p_generation,'freshStart',d.fresh_start);
END;
$$;

CREATE FUNCTION public.record_google_canonical_result(p_delivery UUID,p_owner UUID,p_worker TEXT,p_generation UUID,p_success BOOLEAN,p_follow_ups JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.swarm_runs%ROWTYPE; d public.google_canonical_deliveries%ROWTYPE; run_key UUID;
BEGIN
  IF p_generation IS NULL OR p_success IS NULL OR octet_length(COALESCE(p_follow_ups::text,''))>65536 THEN RAISE EXCEPTION 'DELIVERY_INVALID'; END IF;
  SELECT run_id INTO run_key FROM public.google_canonical_deliveries WHERE id=p_delivery AND user_id=p_owner;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  SELECT * INTO STRICT r FROM public.swarm_runs WHERE id=run_key AND user_id=p_owner FOR UPDATE;
  SELECT * INTO STRICT d FROM public.google_canonical_deliveries WHERE id=p_delivery AND user_id=p_owner FOR UPDATE;
  IF d.state<>'running' OR r.status<>'complete' OR r.worker_id IS NOT NULL OR r.completed_at IS NULL OR r.lease_generation IS DISTINCT FROM p_generation
    OR d.worker_id IS DISTINCT FROM p_worker OR d.lease_generation IS DISTINCT FROM p_generation THEN RETURN FALSE; END IF;
  IF d.result_success IS NOT NULL THEN RETURN d.result_success=p_success AND d.result_follow_ups IS NOT DISTINCT FROM p_follow_ups; END IF;
  UPDATE public.google_canonical_deliveries SET result_success=p_success,result_follow_ups=p_follow_ups WHERE id=p_delivery;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_google_canonical_result(UUID,UUID,TEXT,UUID,BOOLEAN,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_google_canonical_result(UUID,UUID,TEXT,UUID,BOOLEAN,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.enqueue_google_canonical_run(UUID,UUID,UUID,UUID,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reserve_google_canonical_launch(UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_google_canonical_launch(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_google_canonical_run(UUID,TEXT,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_google_canonical_run(UUID,UUID,UUID,UUID,JSONB,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_google_canonical_launch(UUID,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_google_canonical_launch(UUID,UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_google_canonical_run(UUID,TEXT,TEXT,UUID) TO service_role;
