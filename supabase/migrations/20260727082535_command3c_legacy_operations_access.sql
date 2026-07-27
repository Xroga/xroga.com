-- The queue predates the Operations Centre. Authorised backend services need
-- table privileges while browser roles remain unable to inspect job prompts.
REVOKE ALL ON TABLE public.swarm_job_queue FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.swarm_job_queue TO service_role;
