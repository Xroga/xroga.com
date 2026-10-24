-- Expand-only checkpoint fence. Deploy before the writer, then drain legacy writers.
CREATE OR REPLACE FUNCTION public.persist_execution_checkpoint_attempt(
  p_run_id UUID, p_owner_id UUID, p_worker_id TEXT, p_generation UUID,
  p_state JSONB, p_status TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_run public.swarm_runs%ROWTYPE;
BEGIN
  IF p_generation IS NULL OR p_worker_id IS NULL OR length(p_worker_id)=0
    OR jsonb_typeof(p_state) IS DISTINCT FROM 'object'
    OR p_state->>'runId' IS DISTINCT FROM p_run_id::text
    OR COALESCE(length(p_state->>'projectId'),0)=0
    OR jsonb_typeof(p_state->'repository') NOT IN ('object','null')
    OR NOT (p_state ? 'repository')
    OR COALESCE(length(p_state->>'selectedBranch'),0)=0
    OR jsonb_typeof(p_state->'tasks') IS DISTINCT FROM 'array'
    OR p_state->>'updatedAt' IS NULL
    OR p_status IS NULL OR p_status NOT IN ('pending','running','completed','partially_completed','blocked','failed','cancelled')
  THEN RETURN FALSE; END IF;
  SELECT * INTO current_run FROM public.swarm_runs
    WHERE id=p_run_id AND user_id=p_owner_id FOR UPDATE;
  IF NOT FOUND OR current_run.status <> 'running'
    OR current_run.worker_id IS DISTINCT FROM p_worker_id
    OR current_run.lease_generation IS DISTINCT FROM p_generation THEN RETURN FALSE; END IF;
  INSERT INTO public.execution_runs(run_id,user_id,project_id,repository_identity,selected_branch,starting_commit_sha,state,status,updated_at)
    VALUES(p_run_id::text,p_owner_id,p_state->>'projectId',NULLIF(p_state->'repository','null'::jsonb),p_state->>'selectedBranch',
      p_state->>'startingCommitSha',p_state,p_status,(p_state->>'updatedAt')::timestamptz)
  ON CONFLICT(run_id) DO UPDATE SET starting_commit_sha=EXCLUDED.starting_commit_sha,
    state=EXCLUDED.state,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at
  WHERE execution_runs.user_id=p_owner_id
    AND execution_runs.project_id=EXCLUDED.project_id
    AND execution_runs.repository_identity IS NOT DISTINCT FROM EXCLUDED.repository_identity
    AND execution_runs.selected_branch=EXCLUDED.selected_branch
    AND execution_runs.state->'databaseProjectId' IS NOT DISTINCT FROM EXCLUDED.state->'databaseProjectId';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_execution_checkpoint_attempt(UUID,UUID,TEXT,UUID,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_execution_checkpoint_attempt(UUID,UUID,TEXT,UUID,JSONB,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
