-- Expand-only BYOK save/revoke fencing on the existing credential boundary.
-- No encryption migration, provider call, key deletion, or vault activation.
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS credential_revision UUID NOT NULL DEFAULT gen_random_uuid();

-- The shipped BYOK UI writes through /api/integrations/provider-keys. Preserve
-- legacy non-BYOK access, but prevent browser writes bypassing revision checks,
-- including renaming an ordinary row into/out of the protected provider space.
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS byok_server_insert_guard ON public.user_integrations;
CREATE POLICY byok_server_insert_guard ON public.user_integrations AS RESTRICTIVE
  FOR INSERT TO anon,authenticated WITH CHECK(provider !~ '^apikey_');
DROP POLICY IF EXISTS byok_server_update_guard ON public.user_integrations;
CREATE POLICY byok_server_update_guard ON public.user_integrations AS RESTRICTIVE
  FOR UPDATE TO anon,authenticated USING(provider !~ '^apikey_') WITH CHECK(provider !~ '^apikey_');
DROP POLICY IF EXISTS byok_server_delete_guard ON public.user_integrations;
CREATE POLICY byok_server_delete_guard ON public.user_integrations AS RESTRICTIVE
  FOR DELETE TO anon,authenticated USING(provider !~ '^apikey_');

CREATE OR REPLACE FUNCTION public.prepare_provider_key_write(p_owner_id UUID, p_provider TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE revision UUID;
BEGIN
  IF p_owner_id IS NULL OR p_provider IS NULL OR p_provider !~ '^apikey_[a-z_][a-z0-9_]{1,80}$'
  THEN RETURN NULL; END IF;
  -- Establish a durable CAS target even for a first save. Empty credentials are
  -- explicitly revoked, never a connected status or permission to use a mirror.
  INSERT INTO public.user_integrations(user_id,provider,access_token,metadata)
    VALUES(p_owner_id,p_provider,'',jsonb_build_object('revoked',true,'revoked_at',clock_timestamp()))
    ON CONFLICT(user_id,provider) DO NOTHING;
  SELECT credential_revision INTO revision FROM public.user_integrations
    WHERE user_id=p_owner_id AND provider=p_provider;
  RETURN revision;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_provider_key_if_current(
  p_owner_id UUID,p_provider TEXT,p_revision UUID,p_access_token TEXT,p_metadata JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE changed INTEGER;
BEGIN
  IF p_owner_id IS NULL OR p_provider IS NULL OR p_provider !~ '^apikey_[a-z_][a-z0-9_]{1,80}$'
    OR p_revision IS NULL OR p_access_token IS NULL OR p_access_token NOT LIKE 'v1:%'
    OR length(p_access_token) < 8 OR length(p_access_token) > 70000
    OR jsonb_typeof(p_metadata) IS DISTINCT FROM 'object'
  THEN RETURN FALSE; END IF;
  IF jsonb_typeof(p_metadata->'provider') IS DISTINCT FROM 'string'
    OR NOT ((p_provider !~ '^apikey_custom_' AND (p_metadata->>'provider')=substring(p_provider from 8))
      OR ((p_metadata->>'provider')='custom' AND p_provider ~ '^apikey_custom_[a-z_][a-z0-9_]{1,63}$'
        AND p_provider='apikey_custom_' || lower(p_metadata->>'env_var')))
    OR jsonb_typeof(p_metadata->'env_var') IS DISTINCT FROM 'string'
    OR (p_metadata->>'env_var') !~ '^[A-Z_][A-Z0-9_]{1,63}$'
    OR jsonb_typeof(p_metadata->'masked') IS DISTINCT FROM 'string'
    OR length(p_metadata->>'masked') > 32
    OR jsonb_typeof(p_metadata->'connected_at') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_metadata->'type') IS DISTINCT FROM 'string'
    OR (p_metadata->>'type') NOT IN ('user_publish_credential','supabase_provision','user_api_key')
    OR jsonb_typeof(p_metadata->'sync_target') IS DISTINCT FROM 'string'
    OR (p_metadata->>'sync_target') NOT IN ('eas','xroga_server','vercel')
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_metadata) k WHERE k NOT IN
      ('type','provider','env_var','sync_target','connected_at','masked'))
  THEN RETURN FALSE; END IF;
  -- Validate the existing display timestamp without using it for ordering.
  IF NOT isfinite((p_metadata->>'connected_at')::timestamptz) THEN RETURN FALSE; END IF;
  UPDATE public.user_integrations SET access_token=p_access_token,metadata=p_metadata,
    credential_revision=gen_random_uuid()
    WHERE user_id=p_owner_id AND provider=p_provider AND credential_revision=p_revision;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed=1;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_provider_key(p_owner_id UUID,p_provider TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_owner_id IS NULL OR p_provider IS NULL OR p_provider !~ '^apikey_[a-z_][a-z0-9_]{1,80}$'
  THEN RETURN FALSE; END IF;
  INSERT INTO public.user_integrations(user_id,provider,access_token,refresh_token,expires_at,metadata,credential_revision)
    VALUES(p_owner_id,p_provider,'',NULL,NULL,jsonb_build_object('revoked',true,'revoked_at',clock_timestamp()),gen_random_uuid())
    ON CONFLICT(user_id,provider) DO UPDATE SET access_token='',refresh_token=NULL,expires_at=NULL,
      metadata=EXCLUDED.metadata,credential_revision=EXCLUDED.credential_revision;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_provider_key_write(UUID,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_provider_key_if_current(UUID,TEXT,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_provider_key(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_provider_key_write(UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_provider_key_if_current(UUID,TEXT,UUID,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_provider_key(UUID,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
