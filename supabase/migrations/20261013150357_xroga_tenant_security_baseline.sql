-- Command 007 expand-only baseline. NOT authorized for production until isolated
-- fresh/upgrade + staged security/authenticated-browser gates pass.
-- Adds restrictive guards alongside existing permissive policies; grants and
-- legitimate allowed operations are unchanged. Service-role bypass still needs
-- backend ownership checks. No rows/constraints/columns are deleted or tightened.
BEGIN;

DO $baseline$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'projects', 'chat_metadata', 'chats', 'swarm_runs', 'execution_runs',
    'terminal_sessions', 'project_runtime_sessions', 'ai_usage_ledger'
  ] LOOP
    IF to_regclass(format('public.%I', target)) IS NULL THEN
      RAISE EXCEPTION 'Tenant baseline prerequisite table missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = target AND column_name = 'user_id') THEN
      RAISE EXCEPTION 'Tenant baseline prerequisite owner column missing';
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('DROP POLICY IF EXISTS xroga_private_owner_guard ON public.%I', target);
    EXECUTE format('CREATE POLICY xroga_private_owner_guard ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))', target);
  END LOOP;
END $baseline$;

ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xroga_private_project_guard ON public.project_files;
CREATE POLICY xroga_private_project_guard ON public.project_files AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = (SELECT auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = (SELECT auth.uid())));

ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS xroga_private_project_guard ON public.project_messages;
CREATE POLICY xroga_private_project_guard ON public.project_messages AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = (SELECT auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = (SELECT auth.uid())));

-- A user-owned message must not reference someone else's chat container.
DROP POLICY IF EXISTS xroga_chat_container_guard ON public.chats;
CREATE POLICY xroga_chat_container_guard ON public.chats AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (chat_id IS NULL OR EXISTS (SELECT 1 FROM public.chat_metadata c WHERE c.id = chat_id AND c.user_id = (SELECT auth.uid())))
WITH CHECK (chat_id IS NULL OR EXISTS (SELECT 1 FROM public.chat_metadata c WHERE c.id = chat_id AND c.user_id = (SELECT auth.uid())));

COMMIT;
-- Rollback (isolated/staged only, reviewed): drop the eleven policy names above
-- on their exact tables. Keep existing RLS/permissive policies enabled. No data
-- backfill occurs here; orphan/reference remediation must be audited separately.
