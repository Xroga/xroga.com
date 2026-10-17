-- Audit identifiers describe historical subjects, not live owned children.
-- Keep every existing byte and the UPDATE/DELETE rejection trigger. Cascading
-- parent deletion must neither erase history nor rewrite its attribution.
BEGIN;

ALTER TABLE public.production_audit_log
  DROP CONSTRAINT IF EXISTS production_audit_log_actor_id_fkey,
  DROP CONSTRAINT IF EXISTS production_audit_log_user_id_fkey,
  DROP CONSTRAINT IF EXISTS production_audit_log_project_id_fkey,
  DROP CONSTRAINT IF EXISTS production_audit_log_environment_id_fkey;

-- Preserve the former FK admission checks for new events. KEY SHARE serializes
-- insertion against parent deletion; retained historical IDs grant no access.
CREATE OR REPLACE FUNCTION public.operations_validate_audit_subjects()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.actor_id IS NOT NULL THEN
    PERFORM 1 FROM auth.users WHERE id = NEW.actor_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'audit actor unavailable' USING ERRCODE = '23503'; END IF;
  END IF;
  IF NEW.user_id IS NOT NULL THEN
    PERFORM 1 FROM auth.users WHERE id = NEW.user_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'audit owner unavailable' USING ERRCODE = '23503'; END IF;
  END IF;
  IF NEW.project_id IS NOT NULL THEN
    PERFORM 1 FROM public.projects WHERE id = NEW.project_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'audit project unavailable' USING ERRCODE = '23503'; END IF;
  END IF;
  IF NEW.environment_id IS NOT NULL THEN
    PERFORM 1 FROM public.operations_environments WHERE id = NEW.environment_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'audit environment unavailable' USING ERRCODE = '23503'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.operations_validate_audit_subjects() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS operations_audit_subject_admission ON public.production_audit_log;
CREATE TRIGGER operations_audit_subject_admission
  BEFORE INSERT ON public.production_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.operations_validate_audit_subjects();

-- TRUNCATE does not fire row DELETE triggers. Protect that separate path too.
REVOKE TRUNCATE ON public.production_audit_log FROM service_role;
DROP TRIGGER IF EXISTS operations_audit_no_truncate ON public.production_audit_log;
CREATE TRIGGER operations_audit_no_truncate
  BEFORE TRUNCATE ON public.production_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.operations_reject_audit_mutation();

COMMENT ON TABLE public.production_audit_log IS
  'Immutable server-only history. Subject UUIDs are historical attribution, validated on insert and retained unchanged after subject deletion. Retention/purge requires a separately approved policy.';
COMMIT;
