-- Extend the existing worker identity fence using the existing nullable FK.
-- No backfill, new column, row deletion, NOT NULL or FK tightening. Legacy
-- logical workspaces without a database parent retain their existing fences.
CREATE OR REPLACE FUNCTION public.guard_worker_database_project_admission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE parent_project UUID; parent_owner UUID;
BEGIN
  IF TG_TABLE_NAME='swarm_runs' THEN
    parent_project:=NEW.project_id;
    parent_owner:=NEW.user_id;
    IF TG_OP='UPDATE' AND OLD.project_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Worker project authority unavailable';
    END IF;
    IF TG_OP='UPDATE' AND OLD.project_id IS NOT NULL
      AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      -- Allow the FK's existing ON DELETE SET NULL, never a caller rebind.
      IF NEW.project_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.projects WHERE id=OLD.project_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Worker project authority unavailable';
      END IF;
    END IF;
    IF TG_OP='UPDATE' THEN
      -- Losing project authority must never prevent an existing owner/leased
      -- maintenance path from stopping work. No resumed/completed state,
      -- changed identity, transcript, progress or budget payload is allowed here.
      IF OLD.status='running' AND NEW.status IN ('cancelled','error')
        AND NEW.worker_id IS NULL AND NEW.lease_generation IS NULL
        AND NEW.output->>'type'='error'
        AND (to_jsonb(NEW)-ARRAY['status','output','error','completed_at','worker_id','lease_generation','heartbeat_at'])
          IS NOT DISTINCT FROM
          (to_jsonb(OLD)-ARRAY['status','output','error','completed_at','worker_id','lease_generation','heartbeat_at']) THEN
        RETURN NEW;
      END IF;
    END IF;
  ELSE
    SELECT project_id,user_id INTO parent_project,parent_owner
      FROM public.swarm_runs WHERE id::text=NEW.run_id::text FOR UPDATE;
    IF parent_project IS NOT NULL AND NEW.user_id IS DISTINCT FROM parent_owner THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Worker project authority unavailable';
    END IF;
    IF TG_TABLE_NAME='execution_runs' THEN
      IF parent_project IS NOT NULL AND NEW.state->>'databaseProjectId' IS DISTINCT FROM parent_project::text THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Worker project authority unavailable';
      END IF;
    END IF;
  END IF;
  IF parent_project IS NOT NULL THEN
    -- SHARE, not KEY SHARE: ownership can change without changing the PK.
    PERFORM id FROM public.projects WHERE id=parent_project AND user_id=parent_owner FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Worker project authority unavailable'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_worker_database_project_admission() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_worker_database_project_admission() TO service_role;
DROP TRIGGER IF EXISTS worker_database_project_admission ON public.swarm_runs;
CREATE TRIGGER worker_database_project_admission BEFORE INSERT OR UPDATE ON public.swarm_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_worker_database_project_admission();
DROP TRIGGER IF EXISTS worker_database_project_admission ON public.execution_runs;
CREATE TRIGGER worker_database_project_admission BEFORE INSERT OR UPDATE ON public.execution_runs
  FOR EACH ROW EXECUTE FUNCTION public.guard_worker_database_project_admission();
DROP TRIGGER IF EXISTS worker_database_project_admission ON public.software_agent_checkpoints;
CREATE TRIGGER worker_database_project_admission BEFORE INSERT OR UPDATE ON public.software_agent_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.guard_worker_database_project_admission();
DROP TRIGGER IF EXISTS worker_database_project_admission ON public.project_runtime_revisions;
CREATE TRIGGER worker_database_project_admission BEFORE INSERT OR UPDATE ON public.project_runtime_revisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_worker_database_project_admission();
NOTIFY pgrst,'reload schema';
