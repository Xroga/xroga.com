-- Serialize the existing primary GitHub row and legacy authority row in one transaction.
CREATE OR REPLACE FUNCTION public.save_github_oauth_connection(p_owner_id UUID,p_revision UUID,
  p_access_token TEXT,p_provider_user_id TEXT,p_username TEXT,p_repo_strategy TEXT,p_default_repo TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE observed UUID; receipt JSONB;
BEGIN
  IF p_owner_id IS NULL OR p_revision IS NULL OR p_access_token IS NULL OR length(trim(p_access_token))=0
    OR p_username IS NULL OR length(trim(p_username))=0 OR p_provider_user_id IS NULL OR length(p_provider_user_id)=0
    OR p_repo_strategy IS NULL OR p_repo_strategy NOT IN ('auto','monorepo','manual') THEN RETURN FALSE; END IF;
  SELECT credential_revision INTO observed FROM public.user_integrations
    WHERE user_id=p_owner_id AND provider='github' FOR UPDATE;
  IF observed IS DISTINCT FROM p_revision THEN RETURN FALSE; END IF;
  SELECT metadata INTO receipt FROM public.user_integrations
    WHERE user_id=p_owner_id AND provider='github_oauth_pkce' FOR UPDATE;
  IF receipt->>'authorization_revision' IS DISTINCT FROM p_revision::text
    OR receipt->>'consumed_at' IS NULL OR receipt->>'authorization_expires_at' IS NULL
    OR NOT isfinite((receipt->>'authorization_expires_at')::timestamptz)
    OR (receipt->>'authorization_expires_at')::timestamptz <= clock_timestamp() THEN RETURN FALSE; END IF;
  UPDATE public.user_integrations SET access_token=p_access_token,refresh_token=NULL,
    provider_user_id=p_provider_user_id,metadata=jsonb_build_object('username',p_username),credential_revision=gen_random_uuid()
    WHERE user_id=p_owner_id AND provider='github';
  INSERT INTO public.github_integrations(user_id,access_token,repo_strategy,default_repo,github_username)
    VALUES(p_owner_id,p_access_token,p_repo_strategy,p_default_repo,p_username)
    ON CONFLICT(user_id) DO UPDATE SET access_token=EXCLUDED.access_token,refresh_token=NULL,expires_at=NULL,
      repo_strategy=EXCLUDED.repo_strategy,default_repo=EXCLUDED.default_repo,github_username=EXCLUDED.github_username;
  RETURN TRUE;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN FALSE;
END;
$$;
CREATE OR REPLACE FUNCTION public.revoke_github_oauth_connection(p_owner_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF p_owner_id IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.user_integrations(user_id,provider,access_token,refresh_token,metadata,credential_revision)
    VALUES(p_owner_id,'github','',NULL,'{"revoked":true}'::jsonb,gen_random_uuid())
    ON CONFLICT(user_id,provider) DO UPDATE SET access_token='',refresh_token=NULL,expires_at=NULL,
      metadata=EXCLUDED.metadata,credential_revision=EXCLUDED.credential_revision;
  INSERT INTO public.github_integrations(user_id,access_token)
    VALUES(p_owner_id,'') ON CONFLICT(user_id) DO UPDATE SET access_token='',refresh_token=NULL,expires_at=NULL;
  -- Token row was locked first, matching authorization/save lock order.
  UPDATE public.user_integrations SET access_token='',refresh_token=NULL,metadata='{"revoked":true}'::jsonb,
    credential_revision=gen_random_uuid() WHERE user_id=p_owner_id AND provider='github_oauth_pkce';
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.save_github_oauth_connection(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_github_oauth_connection(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_github_oauth_connection(UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_github_oauth_connection(UUID) TO service_role;
DROP POLICY IF EXISTS github_connection_server_insert_guard ON public.github_integrations;
CREATE POLICY github_connection_server_insert_guard ON public.github_integrations AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(false);
DROP POLICY IF EXISTS github_connection_server_update_guard ON public.github_integrations;
CREATE POLICY github_connection_server_update_guard ON public.github_integrations AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(false) WITH CHECK(false);
DROP POLICY IF EXISTS github_connection_server_delete_guard ON public.github_integrations;
CREATE POLICY github_connection_server_delete_guard ON public.github_integrations AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(false);
NOTIFY pgrst,'reload schema';
