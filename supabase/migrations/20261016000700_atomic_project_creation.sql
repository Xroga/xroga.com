-- Preserve the existing project API while making its required child writes atomic.
CREATE OR REPLACE FUNCTION public.save_owned_project_atomic(p_owner_id UUID, p_project JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE saved public.projects%ROWTYPE; matches INTEGER; created BOOLEAN := FALSE;
  repo TEXT := p_project->>'github_repo_name'; message TEXT := p_project->>'user_prompt';
BEGIN
  IF p_owner_id IS NULL OR jsonb_typeof(p_project) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_project->'name') IS DISTINCT FROM 'string'
     OR length(p_project->>'name') NOT BETWEEN 1 AND 200
     OR p_project->>'type' IS NULL OR p_project->>'type' NOT IN ('app','website','video','game','research','automation')
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_project) k WHERE k NOT IN ('name','type','github_repo_url','github_repo_name','github_branch','deploy_url','user_prompt'))
     OR EXISTS (SELECT 1 FROM jsonb_each(p_project) e WHERE e.key NOT IN ('name','type') AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  THEN RAISE EXCEPTION 'Invalid project request' USING ERRCODE='22023'; END IF;
  IF repo IS NOT NULL AND repo <> '' THEN
    -- Serialize this API's concurrent saves of the same actor/repository without
    -- imposing a new uniqueness constraint on potentially duplicated old data.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || repo, 0));
    SELECT count(*) INTO matches FROM public.projects WHERE user_id=p_owner_id AND github_repo_name=repo;
    IF matches > 1 THEN RAISE EXCEPTION 'Project identity is ambiguous' USING ERRCODE='21000'; END IF;
    SELECT * INTO saved FROM public.projects WHERE user_id=p_owner_id AND github_repo_name=repo FOR UPDATE;
  END IF;
  IF saved.id IS NULL THEN
    INSERT INTO public.projects(user_id,name,type,status,github_repo_url,github_repo_name)
      VALUES(p_owner_id,p_project->>'name',p_project->>'type','completed',p_project->>'github_repo_url',repo)
      RETURNING * INTO saved;
    created := TRUE;
  ELSE
    UPDATE public.projects SET name=p_project->>'name',type=p_project->>'type',status='completed',
      github_repo_url=p_project->>'github_repo_url',github_repo_name=repo,updated_at=now()
      WHERE id=saved.id AND user_id=p_owner_id RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project ownership changed'; END IF;
  END IF;
  IF message IS NOT NULL AND btrim(message) <> '' THEN
    INSERT INTO public.project_messages(project_id,role,content,metadata)
      VALUES(saved.id,'user',left(message,8000),jsonb_strip_nulls(jsonb_build_object(
        'deployUrl',p_project->>'deploy_url','githubRepoName',repo,
        'githubBranch',COALESCE(p_project->>'github_branch','main'),'source','client_create')));
  END IF;
  IF created THEN
    INSERT INTO public.activity_logs(user_id,project_id,action,details)
      VALUES(p_owner_id,saved.id,'created_project',jsonb_build_object('name',saved.name,'type',saved.type));
  END IF;
  RETURN jsonb_build_object('created',created,'project',to_jsonb(saved));
END;
$$;
REVOKE ALL ON FUNCTION public.save_owned_project_atomic(UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_owned_project_atomic(UUID,JSONB) TO service_role;
NOTIFY pgrst,'reload schema';
