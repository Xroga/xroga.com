-- Restore the API privileges omitted by the historical notifications migration.
-- Users may only read/update their own rows through RLS. Inserts and deletes
-- remain server-controlled operations performed with the service role.
REVOKE ALL ON TABLE public.notifications FROM anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;
