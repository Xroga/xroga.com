-- REVIEW DRAFT. Run only after admission is paused and all deliveries are drained.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtextextended('xroga-canonical-admission',0));
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.xroga_release_fence WHERE singleton AND allowed_source IS NULL) OR
     EXISTS (SELECT 1 FROM public.google_canonical_deliveries d LEFT JOIN public.swarm_runs r ON r.id=d.run_id AND r.user_id=d.user_id WHERE d.state IS DISTINCT FROM 'superseded' AND (r.id IS NULL OR r.status IS NULL OR r.status NOT IN ('completed','failed','complete','error','cancelled')))
  THEN RAISE EXCEPTION 'CANONICAL_FENCE_ROLLBACK_NOT_DRAINED'; END IF;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.enqueue_google_canonical_run(p_delivery UUID,p_run UUID,p_owner UUID,p_project UUID,p_input JSONB,p_source TEXT)
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

DROP TRIGGER xroga_release_fence_guard ON public.google_canonical_deliveries;
DROP FUNCTION public.xroga_release_fence_check();
DROP TABLE public.xroga_release_fence;
COMMIT;
