-- Ensure service role can read/write messages (bypasses RLS but still needs table grants)
GRANT ALL ON TABLE public.messages TO service_role;
GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;
