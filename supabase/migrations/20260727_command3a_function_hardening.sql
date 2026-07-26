-- Production security hardening for privileged database functions.
-- These routines are invoked by trusted triggers or the backend service role;
-- they must not be callable through the public PostgREST RPC surface.

ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_old_chats_grouped_by_user(TIMESTAMPTZ) SET search_path = public, pg_temp;
ALTER FUNCTION public.rls_auto_enable() SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_old_chats_grouped_by_user(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.increment_user_token_usage(UUID, BIGINT, BIGINT, DATE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_user_token_usage(UUID, BIGINT, BIGINT, DATE, NUMERIC, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_user_model_usage(UUID, JSONB, DATE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_ai_usage_ledger(UUID, TEXT, TEXT, BIGINT, BIGINT, NUMERIC, DATE)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_ai_plan_budget(UUID, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_user_token_usage(UUID, BIGINT, BIGINT, DATE)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_user_token_usage(UUID, BIGINT, BIGINT, DATE, NUMERIC, NUMERIC, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_user_model_usage(UUID, JSONB, DATE)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_ai_usage_ledger(UUID, TEXT, TEXT, BIGINT, BIGINT, NUMERIC, DATE)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_ai_plan_budget(UUID, TEXT, NUMERIC)
  TO service_role;

NOTIFY pgrst, 'reload schema';
