-- Existing software checkpoint table, fenced by the canonical admitted swarm attempt.
CREATE OR REPLACE FUNCTION public.persist_software_checkpoint_attempt(
  p_run_id UUID,p_owner_id UUID,p_worker_id TEXT,p_generation UUID,p_checkpoint JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_run public.swarm_runs%ROWTYPE;
BEGIN
  IF p_generation IS NULL OR p_worker_id IS NULL OR length(p_worker_id)=0
    OR jsonb_typeof(p_checkpoint) IS DISTINCT FROM 'object'
    OR p_checkpoint->>'schemaVersion' IS DISTINCT FROM '1.0.0'
    OR p_checkpoint->>'runId' IS DISTINCT FROM p_run_id::text
    OR NOT (p_checkpoint ? 'projectId') OR jsonb_typeof(p_checkpoint->'projectId') NOT IN ('string','null')
    OR NOT (p_checkpoint ? 'repository') OR jsonb_typeof(p_checkpoint->'repository') NOT IN ('object','null')
    OR COALESCE(length(p_checkpoint->>'baseFingerprint'),0)=0
    OR jsonb_typeof(p_checkpoint->'changes') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_checkpoint->'evidence') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_checkpoint->'blockers') IS DISTINCT FROM 'array'
    OR p_checkpoint->>'updatedAt' IS NULL
    OR p_checkpoint->>'status' IS NULL OR p_checkpoint->>'status' NOT IN ('active','verified','incomplete','failed','cancelled')
  THEN RETURN FALSE; END IF;
  SELECT * INTO current_run FROM public.swarm_runs WHERE id=p_run_id AND user_id=p_owner_id FOR UPDATE;
  IF NOT FOUND OR current_run.status <> 'running'
    OR current_run.worker_id IS DISTINCT FROM p_worker_id
    OR current_run.lease_generation IS DISTINCT FROM p_generation THEN RETURN FALSE; END IF;
  INSERT INTO public.software_agent_checkpoints(run_id,user_id,project_id,repository_identity,base_fingerprint,status,checkpoint,updated_at)
    VALUES(p_run_id::text,p_owner_id,p_checkpoint->>'projectId',NULLIF(p_checkpoint->'repository','null'::jsonb),
      p_checkpoint->>'baseFingerprint',p_checkpoint->>'status',p_checkpoint,(p_checkpoint->>'updatedAt')::timestamptz)
  ON CONFLICT(run_id,user_id) DO UPDATE SET status=EXCLUDED.status,checkpoint=EXCLUDED.checkpoint,updated_at=EXCLUDED.updated_at
  WHERE software_agent_checkpoints.project_id IS NOT DISTINCT FROM EXCLUDED.project_id
    AND software_agent_checkpoints.repository_identity IS NOT DISTINCT FROM EXCLUDED.repository_identity
    AND software_agent_checkpoints.base_fingerprint=EXCLUDED.base_fingerprint;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.persist_software_checkpoint_attempt(UUID,UUID,TEXT,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_software_checkpoint_attempt(UUID,UUID,TEXT,UUID,JSONB) TO service_role;
NOTIFY pgrst,'reload schema';
