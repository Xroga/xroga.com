-- A destroyed machine needs a new session identity. Preserve that terminal fact
-- against delayed restore/process/file writes, including legacy service writers.
CREATE OR REPLACE FUNCTION public.enforce_runtime_terminal_latch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF (OLD.status='destroyed' OR OLD.state->>'status'='destroyed')
    AND (NEW.status IS DISTINCT FROM 'destroyed' OR NEW.state->>'status' IS DISTINCT FROM 'destroyed')
  THEN
    RAISE EXCEPTION 'Destroyed runtime session cannot be reactivated' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS runtime_terminal_latch ON public.project_runtime_sessions;
CREATE TRIGGER runtime_terminal_latch BEFORE UPDATE ON public.project_runtime_sessions
FOR EACH ROW EXECUTE FUNCTION public.enforce_runtime_terminal_latch();
REVOKE ALL ON FUNCTION public.enforce_runtime_terminal_latch() FROM PUBLIC,anon,authenticated;
