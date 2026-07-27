-- deployment_status predates the canonical operations schema and did not
-- explicitly grant its server runtime access. Keep it inaccessible to browsers.
REVOKE ALL ON TABLE public.deployment_status FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deployment_status TO service_role;
