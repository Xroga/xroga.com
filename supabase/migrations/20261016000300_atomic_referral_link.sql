-- Link only pending referral evidence. This function never awards tokens or discounts.
CREATE OR REPLACE FUNCTION public.apply_referral_code_atomic(p_owner_id UUID, p_code TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE own public.user_referral_profiles%ROWTYPE; referrer UUID; inserted UUID;
BEGIN
  IF p_owner_id IS NULL OR p_code IS NULL OR p_code !~ '^XROGA-[A-HJ-NP-Z2-9]{6}$' THEN RETURN 'invalid'; END IF;
  SELECT * INTO own FROM public.user_referral_profiles WHERE user_id=p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'profile_unavailable'; END IF;
  IF own.referred_by_user_id IS NOT NULL OR own.referred_by_code IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.referrals WHERE referred_id=p_owner_id) THEN RETURN 'already_linked'; END IF;
  SELECT user_id INTO referrer FROM public.user_referral_profiles WHERE code=p_code;
  IF referrer IS NULL THEN RETURN 'not_found'; END IF;
  IF referrer=p_owner_id THEN RETURN 'self_referral'; END IF;
  INSERT INTO public.referrals(referrer_id,referred_id,code,qualification_status,qualification_evidence)
    VALUES(referrer,p_owner_id,p_code,'pending','referral-application:'||gen_random_uuid()::text)
    ON CONFLICT(referred_id) DO NOTHING RETURNING id INTO inserted;
  IF inserted IS NULL THEN RETURN 'already_linked'; END IF;
  UPDATE public.user_referral_profiles SET referred_by_user_id=referrer,referred_by_code=p_code,updated_at=clock_timestamp()
    WHERE user_id=p_owner_id AND referred_by_user_id IS NULL AND referred_by_code IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Referral profile claim lost'; END IF;
  RETURN 'recorded';
END;
$$;
REVOKE ALL ON FUNCTION public.apply_referral_code_atomic(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_code_atomic(UUID,TEXT) TO service_role;
NOTIFY pgrst,'reload schema';
