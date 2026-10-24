-- Keep project deletion and its retained activity receipt in one transaction.
-- No Storage/provider object deletion is performed by this function.
CREATE OR REPLACE FUNCTION public.delete_owned_project_atomic(p_owner_id UUID, p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE owned public.projects%ROWTYPE; deleted UUID;
BEGIN
  IF p_owner_id IS NULL OR p_project_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO owned FROM public.projects WHERE id=p_project_id AND user_id=p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM public.projects WHERE id=p_project_id AND user_id=p_owner_id RETURNING id INTO deleted;
  IF deleted IS NULL THEN RAISE EXCEPTION 'Project deletion lost ownership'; END IF;
  -- The deleted parent cannot remain an activity foreign key. Retain its identity
  -- in details while the actor-owned record survives the parent cascade.
  INSERT INTO public.activity_logs(user_id,project_id,action,details)
    VALUES(p_owner_id,NULL,'deleted_project',jsonb_build_object('projectId',deleted,'name',owned.name));
  RETURN jsonb_build_object('id',deleted,'user_id',p_owner_id);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_owned_project_atomic(UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_owned_project_atomic(UUID,UUID) TO service_role;
NOTIFY pgrst,'reload schema';
