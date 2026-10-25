-- Private setup state must not inherit the public community profile row policy.
-- No owner argument, arbitrary columns, write or role grant is exposed.
CREATE OR REPLACE FUNCTION public.read_current_profile_setup()
RETURNS JSONB
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('id', p.id, 'display_name', p.display_name, 'onboarding', p.onboarding)
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid()) AND (SELECT auth.uid()) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.read_current_profile_setup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_current_profile_setup() TO authenticated;
COMMENT ON FUNCTION public.read_current_profile_setup() IS
  'Fixed private setup projection for the current authenticated subject only. Public profile column grants and policies remain unchanged.';
