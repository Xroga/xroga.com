-- Extend the existing credential revision to cover authorization before provider I/O.
-- Existing credentials remain readable. Old in-flight sessions must authorize again.
CREATE OR REPLACE FUNCTION public.begin_oauth_session(p_owner_id UUID,p_provider TEXT,p_session JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target TEXT; epoch UUID;
BEGIN
  target := CASE p_provider WHEN 'supabase_oauth_pkce' THEN 'supabase_oauth' WHEN 'vercel_oauth_pkce' THEN 'vercel' WHEN 'cws_oauth_pkce' THEN 'apikey_cws_oauth' WHEN 'github_oauth_pkce' THEN 'github' END;
  IF p_owner_id IS NULL OR target IS NULL OR jsonb_typeof(p_session) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_session->'verifier') IS DISTINCT FROM 'string' OR length(p_session->>'verifier')=0
    OR jsonb_typeof(p_session->'state') IS DISTINCT FROM 'string' OR length(p_session->>'state') NOT BETWEEN 16 AND 512
    OR jsonb_typeof(p_session->'redirect_uri') IS DISTINCT FROM 'string' OR length(p_session->>'redirect_uri')=0
    THEN RETURN FALSE; END IF;
  -- This row is also the serialization point for disconnect, refresh and callback save.
  INSERT INTO public.user_integrations(user_id,provider,access_token,metadata,credential_revision)
    VALUES(p_owner_id,target,'','{"revoked":true}'::jsonb,gen_random_uuid())
    ON CONFLICT(user_id,provider) DO UPDATE SET credential_revision=gen_random_uuid()
    RETURNING credential_revision INTO epoch;
  INSERT INTO public.user_integrations(user_id,provider,access_token,refresh_token,metadata)
    VALUES(p_owner_id,p_provider,p_session->>'verifier',NULL,
      (p_session-'verifier'-'revoked'-'authorization_revision') || jsonb_build_object(
        'created_at',clock_timestamp(),'authorization_revision',epoch))
    ON CONFLICT(user_id,provider) DO UPDATE SET access_token=EXCLUDED.access_token,
      refresh_token=NULL,metadata=EXCLUDED.metadata,credential_revision=gen_random_uuid();
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_oauth_session(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_oauth_session(UUID,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_oauth_session(p_owner_id UUID,p_provider TEXT,p_state TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE session public.user_integrations%ROWTYPE; created TIMESTAMPTZ; result JSONB; target TEXT; epoch UUID;
BEGIN
  IF p_owner_id IS NULL OR p_provider IS NULL OR p_provider NOT IN
    ('vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce','github_oauth_pkce')
    OR p_state IS NULL OR length(p_state)<16 OR length(p_state)>512 THEN RETURN NULL; END IF;
  target := CASE p_provider WHEN 'supabase_oauth_pkce' THEN 'supabase_oauth' WHEN 'vercel_oauth_pkce' THEN 'vercel' WHEN 'cws_oauth_pkce' THEN 'apikey_cws_oauth' WHEN 'github_oauth_pkce' THEN 'github' END;
  IF target IS NOT NULL THEN
    SELECT credential_revision INTO epoch FROM public.user_integrations
      WHERE user_id=p_owner_id AND provider=target FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  SELECT * INTO session FROM public.user_integrations
    WHERE user_id=p_owner_id AND provider=p_provider FOR UPDATE;
  IF NOT FOUND OR session.access_token IS NULL OR length(session.access_token)=0
    OR session.metadata->>'state' IS DISTINCT FROM p_state OR session.metadata->>'revoked'='true'
    OR jsonb_typeof(session.metadata->'created_at') IS DISTINCT FROM 'string'
    OR jsonb_typeof(session.metadata->'redirect_uri') IS DISTINCT FROM 'string'
    OR length(session.metadata->>'redirect_uri')=0
    OR (target IS NOT NULL AND session.metadata->>'authorization_revision' IS DISTINCT FROM epoch::text)
    THEN RETURN NULL; END IF;
  created := (session.metadata->>'created_at')::timestamptz;
  IF NOT isfinite(created) OR created > clock_timestamp()
    OR created <= clock_timestamp()-interval '10 minutes' THEN RETURN NULL; END IF;
  result := jsonb_build_object('verifier',session.access_token,'state',p_state,
    'redirect_uri',session.metadata->>'redirect_uri','created_at',session.metadata->>'created_at');
  IF target IS NOT NULL THEN result := result || jsonb_build_object('authorization_revision',epoch); END IF;
  IF session.metadata ? 'nonce' THEN result := result || jsonb_build_object('nonce',session.metadata->'nonce'); END IF;
  UPDATE public.user_integrations SET access_token='',refresh_token=NULL,
    credential_revision=gen_random_uuid(),metadata=jsonb_build_object('revoked',true,'consumed_at',clock_timestamp(),
      'authorization_revision',epoch,'authorization_expires_at',created+interval '10 minutes')
    WHERE id=session.id;
  RETURN result;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_oauth_connection(p_owner_id UUID,p_provider TEXT,p_revision UUID,
  p_access_token TEXT,p_refresh_token TEXT,p_metadata JSONB,p_provider_user_id TEXT,p_expected_refresh_token TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE affected INTEGER; observed UUID; receipt JSONB; session_provider TEXT;
BEGIN
  IF p_owner_id IS NULL OR p_provider IS NULL OR p_provider NOT IN ('supabase_oauth','vercel')
    OR p_revision IS NULL OR p_access_token IS NULL OR length(trim(p_access_token))=0
    OR jsonb_typeof(p_metadata) IS DISTINCT FROM 'object' OR p_metadata->>'revoked'='true' THEN RETURN FALSE; END IF;
  SELECT credential_revision INTO observed FROM public.user_integrations
    WHERE user_id=p_owner_id AND provider=p_provider FOR UPDATE;
  IF observed IS DISTINCT FROM p_revision THEN RETURN FALSE; END IF;
  IF p_expected_refresh_token IS NULL THEN
    session_provider := CASE p_provider WHEN 'vercel' THEN 'vercel_oauth_pkce' ELSE 'supabase_oauth_pkce' END;
    SELECT metadata INTO receipt FROM public.user_integrations
      WHERE user_id=p_owner_id AND provider=session_provider FOR UPDATE;
    IF receipt->>'authorization_revision' IS DISTINCT FROM p_revision::text
      OR receipt->>'consumed_at' IS NULL OR receipt->>'authorization_expires_at' IS NULL
      OR NOT isfinite((receipt->>'authorization_expires_at')::timestamptz)
      OR (receipt->>'authorization_expires_at')::timestamptz <= clock_timestamp() THEN RETURN FALSE; END IF;
  END IF;
  UPDATE public.user_integrations SET access_token=p_access_token,refresh_token=p_refresh_token,
    metadata=p_metadata,provider_user_id=p_provider_user_id,credential_revision=gen_random_uuid()
    WHERE user_id=p_owner_id AND provider=p_provider AND credential_revision=p_revision
      AND (p_expected_refresh_token IS NULL OR (refresh_token=p_expected_refresh_token AND metadata->>'revoked' IS DISTINCT FROM 'true'));
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected=1;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.save_oauth_connection(UUID,TEXT,UUID,TEXT,TEXT,JSONB,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_oauth_connection(UUID,TEXT,UUID,TEXT,TEXT,JSONB,TEXT,TEXT) TO service_role;

-- CWS retains the existing encrypted BYOK persistence and metadata validation.
-- This adapter only adds the consumed-session lifetime to its existing revision CAS.
CREATE OR REPLACE FUNCTION public.save_cws_oauth_key_if_current(
  p_owner_id UUID,p_provider TEXT,p_revision UUID,p_access_token TEXT,p_metadata JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE observed UUID; receipt JSONB;
BEGIN
  IF p_owner_id IS NULL OR p_provider IS DISTINCT FROM 'apikey_cws_oauth' OR p_revision IS NULL THEN RETURN FALSE; END IF;
  SELECT credential_revision INTO observed FROM public.user_integrations
    WHERE user_id=p_owner_id AND provider=p_provider FOR UPDATE;
  IF observed IS DISTINCT FROM p_revision THEN RETURN FALSE; END IF;
  SELECT metadata INTO receipt FROM public.user_integrations
    WHERE user_id=p_owner_id AND provider='cws_oauth_pkce' FOR UPDATE;
  IF receipt->>'authorization_revision' IS DISTINCT FROM p_revision::text
    OR receipt->>'consumed_at' IS NULL OR receipt->>'authorization_expires_at' IS NULL
    OR NOT isfinite((receipt->>'authorization_expires_at')::timestamptz)
    OR (receipt->>'authorization_expires_at')::timestamptz <= clock_timestamp() THEN RETURN FALSE; END IF;
  RETURN public.save_provider_key_if_current(p_owner_id,p_provider,p_revision,p_access_token,p_metadata);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.save_cws_oauth_key_if_current(UUID,TEXT,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_cws_oauth_key_if_current(UUID,TEXT,UUID,TEXT,JSONB) TO service_role;

-- Browser writes must not bypass the epoch, including renaming into/out of protected rows.
DROP POLICY IF EXISTS oauth_connection_server_insert_guard ON public.user_integrations;
CREATE POLICY oauth_connection_server_insert_guard ON public.user_integrations AS RESTRICTIVE
  FOR INSERT TO anon,authenticated WITH CHECK(provider NOT IN ('supabase_oauth','vercel','github','github_oauth_pkce'));
DROP POLICY IF EXISTS oauth_connection_server_update_guard ON public.user_integrations;
CREATE POLICY oauth_connection_server_update_guard ON public.user_integrations AS RESTRICTIVE
  FOR UPDATE TO anon,authenticated USING(provider NOT IN ('supabase_oauth','vercel','github','github_oauth_pkce'))
  WITH CHECK(provider NOT IN ('supabase_oauth','vercel','github','github_oauth_pkce'));
DROP POLICY IF EXISTS oauth_connection_server_delete_guard ON public.user_integrations;
CREATE POLICY oauth_connection_server_delete_guard ON public.user_integrations AS RESTRICTIVE
  FOR DELETE TO anon,authenticated USING(provider NOT IN ('supabase_oauth','vercel','github','github_oauth_pkce'));
NOTIFY pgrst,'reload schema';
