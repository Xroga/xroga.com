-- Additive worker writer. Authenticated post-build restore/delivery uses its
-- existing independently authorized path. Drain old workers before rollout.
CREATE OR REPLACE FUNCTION public.persist_worker_project_revision(
  p_owner_id UUID,p_run_id UUID,p_worker_id TEXT,p_generation UUID,
  p_project JSONB,p_fingerprint TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE current_run public.swarm_runs%ROWTYPE;
  canonical public.execution_runs%ROWTYPE;
  revision public.project_runtime_revisions%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR p_run_id IS NULL OR p_generation IS NULL
    OR COALESCE(length(p_worker_id),0)=0
    OR jsonb_typeof(p_project) IS DISTINCT FROM 'object'
    OR p_project->>'runId' IS DISTINCT FROM p_run_id::text
    OR p_project->'contract'->>'runId' IS DISTINCT FROM p_run_id::text
    OR COALESCE(length(p_project->>'projectId'),0)=0
    OR p_project->'contract'->>'projectId' IS DISTINCT FROM p_project->>'projectId'
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$'
  THEN RETURN NULL; END IF;
  SELECT * INTO current_run FROM public.swarm_runs
    WHERE id=p_run_id AND user_id=p_owner_id FOR UPDATE;
  IF NOT FOUND OR current_run.status<>'running'
    OR current_run.worker_id IS DISTINCT FROM p_worker_id
    OR current_run.lease_generation IS DISTINCT FROM p_generation THEN RETURN NULL; END IF;
  SELECT * INTO canonical FROM public.execution_runs WHERE run_id=p_run_id::text AND user_id=p_owner_id;
  IF NOT FOUND OR canonical.project_id IS DISTINCT FROM p_project->>'projectId' THEN RETURN NULL; END IF;
  INSERT INTO public.project_runtime_revisions(user_id,project_id,run_id,workspace_fingerprint,software_project)
    VALUES(p_owner_id,p_project->>'projectId',p_run_id::text,p_fingerprint,p_project)
    RETURNING * INTO revision;
  RETURN jsonb_build_object('revision_id',revision.revision_id,'user_id',revision.user_id,
    'project_id',revision.project_id,'run_id',revision.run_id,'workspace_fingerprint',revision.workspace_fingerprint,
    'revision_number',revision.revision_number,'created_at',revision.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.persist_worker_project_revision(UUID,UUID,TEXT,UUID,JSONB,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_worker_project_revision(UUID,UUID,TEXT,UUID,JSONB,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
