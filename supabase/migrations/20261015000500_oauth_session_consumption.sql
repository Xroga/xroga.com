-- Consume existing OAuth sessions exactly once before external token exchange.
-- No live credential migration or provider operation.
CREATE POLICY oauth_session_server_insert_guard ON public.user_integrations AS RESTRICTIVE
  FOR INSERT TO anon,authenticated WITH CHECK(provider NOT IN ('vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce'));
CREATE POLICY oauth_session_server_update_guard ON public.user_integrations AS RESTRICTIVE
  FOR UPDATE TO anon,authenticated
  USING(provider NOT IN ('vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce'))
  WITH CHECK(provider NOT IN ('vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce'));
CREATE POLICY oauth_session_server_delete_guard ON public.user_integrations AS RESTRICTIVE
  FOR DELETE TO anon,authenticated USING(provider NOT IN ('vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce'));

CREATE OR REPLACE FUNCTION public.consume_oauth_session(p_owner_id UUID,p_provider TEXT,p_state TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE session public.user_integrations%ROWTYPE; created TIMESTAMPTZ; result JSONB;
BEGIN
  IF p_owner_id IS NULL OR p_provider IS NULL OR p_provider NOT IN
    ('vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce')
    OR p_state IS NULL OR length(p_state)<16 OR length(p_state)>512 THEN RETURN NULL; END IF;
  SELECT * INTO session FROM public.user_integrations
    WHERE user_id=p_owner_id AND provider=p_provider FOR UPDATE;
  IF NOT FOUND OR session.access_token IS NULL OR length(session.access_token)=0
    OR session.metadata->>'state' IS DISTINCT FROM p_state
    OR session.metadata->>'revoked'='true'
    OR jsonb_typeof(session.metadata->'created_at') IS DISTINCT FROM 'string'
    OR jsonb_typeof(session.metadata->'redirect_uri') IS DISTINCT FROM 'string'
    OR length(session.metadata->>'redirect_uri')=0
  THEN RETURN NULL; END IF;
  created := (session.metadata->>'created_at')::timestamptz;
  IF NOT isfinite(created) OR created > clock_timestamp()
    OR created <= clock_timestamp()-interval '10 minutes' THEN RETURN NULL; END IF;
  result := jsonb_build_object('verifier',session.access_token,'state',p_state,
    'redirect_uri',session.metadata->>'redirect_uri','created_at',session.metadata->>'created_at');
  IF session.metadata ? 'nonce' THEN result := result || jsonb_build_object('nonce',session.metadata->'nonce'); END IF;
  UPDATE public.user_integrations SET access_token='',refresh_token=NULL,
    credential_revision=gen_random_uuid(),metadata=jsonb_build_object('revoked',true,'consumed_at',clock_timestamp())
    WHERE id=session.id;
  RETURN result;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_oauth_session(UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_oauth_session(UUID,TEXT,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
