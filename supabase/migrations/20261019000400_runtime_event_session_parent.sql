-- Keep session-less logical-project diagnostics compatible. New session-bearing
-- events must reference the current exact owner/project parent at their write.
-- No existing rows are rewritten, deleted or subjected to a new FK/NOT NULL.
CREATE OR REPLACE FUNCTION public.guard_runtime_event_session_parent()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.session_id IS NOT NULL THEN
    PERFORM session_id FROM public.project_runtime_sessions
      WHERE session_id=NEW.session_id AND user_id=NEW.user_id AND project_id=NEW.project_id
      FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Runtime event authority unavailable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_runtime_event_session_parent() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_runtime_event_session_parent() TO service_role;
DROP TRIGGER IF EXISTS runtime_event_session_parent ON public.project_runtime_events;
CREATE TRIGGER runtime_event_session_parent
  BEFORE INSERT OR UPDATE OF user_id,project_id,session_id ON public.project_runtime_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_runtime_event_session_parent();
NOTIFY pgrst,'reload schema';
