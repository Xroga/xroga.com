-- REVIEW DRAFT. Not approved or applied to production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
BEGIN
  IF to_regclass('public.xroga_release_fence') IS NOT NULL OR
    NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)'::regprocedure AND md5(prosrc)='9014766f51e6d9fd878cc5d4724383c2' AND NOT prosecdef AND proconfig=ARRAY['search_path=public']::text[] AND prorettype='jsonb'::regtype) OR
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.google_canonical_deliveries'::regclass AND NOT tgisinternal) OR
    NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) OR
    has_function_privilege('anon','public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE') OR
    has_function_privilege('authenticated','public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE') OR
    NOT has_function_privilege('service_role','public.enqueue_google_canonical_run(uuid,uuid,uuid,uuid,jsonb,text)','EXECUTE')
  THEN RAISE EXCEPTION 'CANONICAL_FENCE_PREFLIGHT_MISMATCH'; END IF;
END;
$guard$;
CREATE TABLE public.xroga_release_fence (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  allowed_source text CHECK (allowed_source IS NULL OR allowed_source ~ '^[a-f0-9]{40}$')
);
ALTER TABLE public.xroga_release_fence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xroga_release_fence FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.xroga_release_fence TO service_role;
INSERT INTO public.xroga_release_fence(singleton,allowed_source) VALUES(true,'ca94c2f8a813524e47f5f7abc868acb1618a1c45');
CREATE FUNCTION public.xroga_release_fence_check() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $f$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('xroga-canonical-admission',0));
  IF NOT EXISTS (SELECT 1 FROM public.xroga_release_fence WHERE singleton AND allowed_source=NEW.source_sha) THEN
    RAISE EXCEPTION 'CANONICAL_ADMISSION_PAUSED_OR_WRONG_SOURCE';
  END IF;
  RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION public.xroga_release_fence_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xroga_release_fence_check() TO service_role;
CREATE TRIGGER xroga_release_fence_guard BEFORE INSERT OR UPDATE OF source_sha ON public.google_canonical_deliveries FOR EACH ROW EXECUTE FUNCTION public.xroga_release_fence_check();
CREATE OR REPLACE FUNCTION public.enqueue_google_canonical_run(p_delivery UUID,p_run UUID,p_owner UUID,p_project UUID,p_input JSONB,p_source TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.swarm_runs%ROWTYPE; d public.google_canonical_deliveries%ROWTYPE; inserted_count INTEGER; allow_fresh BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('xroga-canonical-admission',0));
  IF NOT EXISTS (SELECT 1 FROM public.xroga_release_fence WHERE singleton AND allowed_source=p_source) THEN
    RAISE EXCEPTION 'CANONICAL_ADMISSION_PAUSED_OR_WRONG_SOURCE';
  END IF;
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

COMMIT;
