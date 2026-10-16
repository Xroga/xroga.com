-- The first insert establishes the runtime session's immutable identity.
-- Keep legacy JSON readable by the independent fail-closed restoration guard.
CREATE OR REPLACE FUNCTION public.enforce_runtime_session_identity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
    OR NEW.runtime_class IS DISTINCT FROM OLD.runtime_class
  THEN RAISE EXCEPTION 'Runtime session identity cannot be changed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS runtime_session_identity ON public.project_runtime_sessions;
CREATE TRIGGER runtime_session_identity BEFORE UPDATE ON public.project_runtime_sessions
FOR EACH ROW EXECUTE FUNCTION public.enforce_runtime_session_identity();
REVOKE ALL ON FUNCTION public.enforce_runtime_session_identity() FROM PUBLIC,anon,authenticated;
