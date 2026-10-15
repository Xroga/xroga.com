-- Expand-only. Legacy attempts have no fence and cannot use the new worker writer.
-- Resume assigns a new fence. Existing cancellation/reconciliation invalidates it.
ALTER TABLE public.swarm_runs ADD COLUMN IF NOT EXISTS lease_generation UUID;

CREATE OR REPLACE FUNCTION public.persist_swarm_run_attempt(
  p_run_id UUID, p_owner_id UUID, p_worker_id TEXT, p_generation UUID, p_state JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  current_run public.swarm_runs%ROWTYPE;
  next_status TEXT := p_state->>'status';
  next_completed TIMESTAMPTZ := (p_state->>'completed_at')::timestamptz;
  next_iteration INTEGER := (p_state->>'iteration_count')::integer;
  next_sequence BIGINT := (p_state->>'last_sequence')::bigint;
BEGIN
  IF p_generation IS NULL OR p_worker_id IS NULL OR length(p_worker_id) = 0
     OR jsonb_typeof(p_state) IS DISTINCT FROM 'object'
     OR next_status IS NULL OR next_status NOT IN ('running','complete','error','cancelled')
     OR next_iteration IS NULL OR next_iteration < 0 OR next_sequence IS NULL OR next_sequence < 0
     OR jsonb_typeof(p_state->'events') IS DISTINCT FROM 'array'
     OR (next_status = 'running') <> (next_completed IS NULL)
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_state) k WHERE k NOT IN
       ('prompt','status','output','feature_category','token_usage','completed_at','iteration_count','events','last_sequence'))
  THEN RETURN FALSE; END IF;

  SELECT * INTO current_run FROM public.swarm_runs
    WHERE id = p_run_id AND user_id = p_owner_id FOR UPDATE;
  IF NOT FOUND OR current_run.lease_generation IS DISTINCT FROM p_generation THEN RETURN FALSE; END IF;
  -- Exact repeat is safe, including a response lost after successful finalization.
  IF current_run.completed_at IS NOT DISTINCT FROM next_completed
     AND to_jsonb(current_run) @> (p_state - 'completed_at') THEN RETURN TRUE; END IF;
  IF next_sequence < current_run.last_sequence THEN RETURN FALSE; END IF;
  IF current_run.status = 'running' THEN
    IF current_run.worker_id IS DISTINCT FROM p_worker_id
       OR (next_status = 'running' AND next_sequence = current_run.last_sequence)
       OR next_iteration <> COALESCE(current_run.iteration_count,0) + CASE WHEN next_status = 'running' THEN 0 ELSE 1 END
    THEN RETURN FALSE; END IF;
  ELSIF current_run.status = 'error' THEN
    -- Preserve the established late-error enrichment contract, within this attempt only.
    IF current_run.worker_id IS NOT NULL OR next_status NOT IN ('error','cancelled')
       OR current_run.completed_at IS DISTINCT FROM next_completed
       OR next_iteration IS DISTINCT FROM current_run.iteration_count THEN RETURN FALSE; END IF;
  ELSE RETURN FALSE;
  END IF;
  UPDATE public.swarm_runs SET
    prompt = p_state->>'prompt', status = next_status, output = p_state->'output',
    feature_category = p_state->>'feature_category', token_usage = p_state->'token_usage',
    completed_at = next_completed, iteration_count = next_iteration,
    events = p_state->'events', last_sequence = next_sequence,
    worker_id = CASE WHEN next_status = 'running' THEN p_worker_id ELSE NULL END,
    heartbeat_at = CASE WHEN next_status = 'running' THEN clock_timestamp() ELSE NULL END
  WHERE id = p_run_id AND user_id = p_owner_id;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_swarm_run_attempt(UUID,UUID,TEXT,UUID,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_swarm_run_attempt(UUID,UUID,TEXT,UUID,JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
