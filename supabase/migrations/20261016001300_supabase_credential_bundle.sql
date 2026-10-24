-- Atomic association of explicitly supplied project credentials in the existing
-- vault. Association is not provider verification or provisioning evidence.
CREATE OR REPLACE FUNCTION public.save_supabase_bundle_if_current(
  p_owner_id UUID, p_project_ref TEXT, p_rows JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE item JSONB; current_revision UUID; inserted INTEGER;
  bundle_id UUID := gen_random_uuid(); provider_name TEXT;
BEGIN
  IF p_owner_id IS NULL OR p_project_ref IS NULL OR p_project_ref !~ '^[a-z0-9]+$'
    OR length(p_project_ref)>64 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_rows)<>4 THEN RETURN FALSE; END IF;
  IF (SELECT count(DISTINCT r->>'provider') FROM jsonb_array_elements(p_rows) r)<>4
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE r->>'provider' NOT IN
      ('apikey_supabase_url','apikey_supabase_anon','apikey_supabase','apikey_supabase_db_password')
      OR NOT(r ? 'provider') OR NOT(r ? 'revision') OR jsonb_typeof(r->'access_token') IS DISTINCT FROM 'string')
    THEN RETURN FALSE; END IF;
  -- Any conflict rolls back inserted absent-row targets and every preceding save.
  BEGIN
    FOR item IN SELECT r FROM jsonb_array_elements(p_rows) r ORDER BY r->>'provider' LOOP
      provider_name := item->>'provider';
      INSERT INTO public.user_integrations(user_id,provider,access_token,metadata)
        VALUES(p_owner_id,provider_name,'',jsonb_build_object('revoked',true))
        ON CONFLICT(user_id,provider) DO NOTHING;
      GET DIAGNOSTICS inserted = ROW_COUNT;
      SELECT credential_revision INTO current_revision FROM public.user_integrations
        WHERE user_id=p_owner_id AND provider=provider_name FOR UPDATE;
      IF (item->>'revision') IS NULL THEN
        IF inserted<>1 THEN RAISE EXCEPTION 'bundle conflict' USING ERRCODE='P0001'; END IF;
      ELSIF inserted=1 OR current_revision IS DISTINCT FROM (item->>'revision')::UUID THEN
        RAISE EXCEPTION 'bundle conflict' USING ERRCODE='P0001';
      END IF;
      IF item->>'access_token' = '' THEN
        IF provider_name IN ('apikey_supabase_url','apikey_supabase_anon') THEN
          RAISE EXCEPTION 'incomplete bundle' USING ERRCODE='P0001';
        END IF;
        UPDATE public.user_integrations SET access_token='',metadata=jsonb_build_object('revoked',true),
          credential_revision=gen_random_uuid() WHERE user_id=p_owner_id AND provider=provider_name;
      ELSE
        IF NOT public.save_provider_key_if_current(p_owner_id,provider_name,current_revision,
          item->>'access_token',item->'metadata') THEN
          RAISE EXCEPTION 'bundle conflict' USING ERRCODE='P0001';
        END IF;
        UPDATE public.user_integrations SET metadata=metadata || jsonb_build_object(
          'supabase_bundle_id',bundle_id,'supabase_project_ref',p_project_ref)
          WHERE user_id=p_owner_id AND provider=provider_name;
      END IF;
    END LOOP;
  EXCEPTION WHEN raise_exception OR invalid_text_representation THEN RETURN FALSE;
  END;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.save_supabase_bundle_if_current(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_supabase_bundle_if_current(UUID,TEXT,JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
