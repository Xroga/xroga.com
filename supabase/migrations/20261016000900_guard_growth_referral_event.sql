-- A referral UUID is not product authority. Reuse the explicit attribution
-- tuple and hold its row through event commit, including service-role writes.
CREATE OR REPLACE FUNCTION public.guard_growth_referral_event()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.referral_id IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.growth_referral_attribution
    WHERE tenant_id=NEW.tenant_id AND project_id=NEW.project_id AND referral_id=NEW.referral_id
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event referral attribution unavailable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_growth_referral_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_growth_referral_event() TO service_role;
DROP TRIGGER IF EXISTS guard_growth_referral_event ON public.analytics_events;
CREATE TRIGGER guard_growth_referral_event
  BEFORE INSERT OR UPDATE OF tenant_id,project_id,referral_id ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_growth_referral_event();
