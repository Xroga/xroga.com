-- Command 007 expand-only baseline. NOT authorized for production until isolated
-- fresh/upgrade + staged security/authenticated-browser gates pass.
-- Adds restrictive guards alongside existing permissive policies; grants and
-- legitimate allowed operations are unchanged. Service-role bypass still needs
-- backend ownership checks. No rows/constraints/columns are deleted or tightened.
BEGIN;

-- Reconcile two legacy catalog tables that predate repository migration history.
-- Full observed columns/defaults/constraints/indexes, not projected test tables.
-- Provenance: schema-observation.json plus read-only catalog defaults/index audit
-- on 2026-10-13. Existing production tables/policies/grants are NOT recreated.
-- Fresh installations keep these retired resources inaccessible to API roles;
-- this does not introduce a second chat runtime or activate legacy endpoints.
DO $legacy_schema$
BEGIN
  IF to_regclass('public.chat_metadata') IS NULL THEN
    CREATE TABLE public.chat_metadata (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id),
      title text NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    ALTER TABLE public.chat_metadata ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.chat_metadata FROM anon, authenticated, service_role;
    CREATE POLICY "Users can read own chat_metadata" ON public.chat_metadata FOR SELECT USING(auth.uid()=user_id);
    CREATE POLICY "Users can insert own chat_metadata" ON public.chat_metadata FOR INSERT WITH CHECK(auth.uid()=user_id);
    CREATE POLICY "Users can update own chat_metadata" ON public.chat_metadata FOR UPDATE USING(auth.uid()=user_id);
    CREATE POLICY "Users can delete own chat_metadata" ON public.chat_metadata FOR DELETE USING(auth.uid()=user_id);
  END IF;
  IF to_regclass('public.chats') IS NULL THEN
    CREATE TABLE public.chats (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id),
      role text NOT NULL CHECK(role IN ('user','assistant')),
      content text NOT NULL,
      message_id text UNIQUE,
      created_at timestamptz DEFAULT now(),
      chat_id uuid REFERENCES public.chat_metadata(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_chats_user_time ON public.chats(user_id,created_at);
    ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.chats FROM anon, authenticated, service_role;
    REVOKE ALL ON SEQUENCE public.chats_id_seq FROM anon, authenticated, service_role;
    CREATE POLICY "Users can read own chats" ON public.chats FOR SELECT USING(auth.uid()=user_id);
    CREATE POLICY "Users can insert own chats" ON public.chats FOR INSERT WITH CHECK(auth.uid()=user_id);
  END IF;
END $legacy_schema$;

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
