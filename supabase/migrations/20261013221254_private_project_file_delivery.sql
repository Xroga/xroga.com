-- Expand only: preserve all existing files/content and RLS/grants. No production application.
ALTER TABLE public.project_files ADD COLUMN IF NOT EXISTS storage_metadata jsonb;
ALTER TABLE public.project_files ADD COLUMN IF NOT EXISTS delivery_version bigint NOT NULL DEFAULT 1;

-- New private-storage metadata is server-owned; existing owner content edits remain unchanged.
-- Revocation epochs cannot be rolled back to reactivate an old link.
CREATE OR REPLACE FUNCTION public.guard_project_file_delivery_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.storage_metadata IS NOT NULL AND
     NEW.storage_metadata->>'ownerId' IS DISTINCT FROM
     (SELECT p.user_id::text FROM public.projects p WHERE p.id = NEW.project_id) THEN
    RAISE EXCEPTION 'file_storage_owner_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NEW.delivery_version < 1 OR (TG_OP = 'UPDATE' AND NEW.delivery_version < OLD.delivery_version) THEN
    RAISE EXCEPTION 'invalid_file_delivery_epoch' USING ERRCODE = '42501';
  END IF;
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    IF (TG_OP = 'INSERT' AND (NEW.storage_metadata IS NOT NULL OR NEW.delivery_version <> 1))
       OR (TG_OP = 'UPDATE' AND (NEW.storage_metadata IS DISTINCT FROM OLD.storage_metadata
                               OR NEW.delivery_version IS DISTINCT FROM OLD.delivery_version)) THEN
      RAISE EXCEPTION 'file_delivery_metadata_is_server_owned' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_project_file_delivery_metadata() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_project_file_delivery_metadata ON public.project_files;
CREATE TRIGGER guard_project_file_delivery_metadata BEFORE INSERT OR UPDATE ON public.project_files
FOR EACH ROW EXECUTE FUNCTION public.guard_project_file_delivery_metadata();

-- One atomic owner-parent statement; no separate check/update race or competing grant store.
CREATE OR REPLACE FUNCTION public.revoke_project_file_links(p_project_id uuid,p_file_id uuid,p_owner_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE result bigint;
BEGIN
  IF current_user <> 'service_role' THEN RAISE EXCEPTION 'server_only_file_revocation' USING ERRCODE = '42501'; END IF;
  UPDATE public.project_files f SET delivery_version = f.delivery_version + 1
  FROM public.projects p WHERE f.id=p_file_id AND f.project_id=p_project_id AND p.id=f.project_id AND p.user_id=p_owner_id
    AND f.delivery_version < 9007199254740991
  RETURNING f.delivery_version INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_project_file_links(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_project_file_links(uuid,uuid,uuid) TO service_role;
