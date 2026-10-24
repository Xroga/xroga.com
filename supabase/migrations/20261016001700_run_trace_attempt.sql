-- Best-effort diagnostics, not a completion or audit receipt. Reuse the worker epoch.
CREATE OR REPLACE FUNCTION public.persist_run_trace_attempt(
  p_run_id UUID,p_owner_id UUID,p_worker_id TEXT,p_generation UUID,p_stages JSONB,p_meta JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_run public.swarm_runs%ROWTYPE;
BEGIN
  IF p_generation IS NULL OR p_worker_id IS NULL OR length(p_worker_id)=0
    OR jsonb_typeof(p_stages) IS DISTINCT FROM 'array' OR jsonb_typeof(p_meta) IS DISTINCT FROM 'object'
  THEN RETURN FALSE; END IF;
  SELECT * INTO current_run FROM public.swarm_runs WHERE id=p_run_id AND user_id=p_owner_id FOR UPDATE;
  IF NOT FOUND OR current_run.lease_generation IS DISTINCT FROM p_generation THEN RETURN FALSE; END IF;
  IF current_run.status='running' THEN
    IF current_run.worker_id IS DISTINCT FROM p_worker_id THEN RETURN FALSE; END IF;
  ELSIF current_run.status IN ('complete','error') THEN
    -- Canonical finalization clears worker_id but retains this attempt's generation.
    IF current_run.worker_id IS NOT NULL OR current_run.completed_at IS NULL THEN RETURN FALSE; END IF;
  ELSE RETURN FALSE;
  END IF;
  INSERT INTO public.swarm_run_traces(run_id,user_id,stages,meta,updated_at)
    VALUES(p_run_id::text,p_owner_id,p_stages,p_meta,clock_timestamp())
  ON CONFLICT(run_id) DO UPDATE SET stages=EXCLUDED.stages,meta=EXCLUDED.meta,updated_at=EXCLUDED.updated_at
    WHERE swarm_run_traces.user_id=p_owner_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_run_trace_attempt(UUID,UUID,TEXT,UUID,JSONB,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_run_trace_attempt(UUID,UUID,TEXT,UUID,JSONB,JSONB) TO service_role;
NOTIFY pgrst,'reload schema';
