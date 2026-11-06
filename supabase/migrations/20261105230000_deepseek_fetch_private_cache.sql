-- Additive Search OS continuation. Preserve the existing five-argument caller.
-- Every Search and Fetch has its own canonical reservation and verified receipt.
ALTER TABLE public.xroga_deepseek_web_calls ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'search' CHECK (operation IN ('search','fetch'));
CREATE OR REPLACE FUNCTION public.reserve_xroga_deepseek_web(
  p_user_id uuid, p_idempotency_key uuid,
  p_research_kind text, p_research_run_id uuid,
  p_price_version text, p_operation text
) RETURNS public.xroga_provider_reservations
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cycle public.xroga_billing_cycles;
  v_existing public.xroga_provider_reservations;
  v_link public.xroga_deepseek_web_calls;
  v_reserved public.xroga_provider_reservations;
  v_spent bigint;
  v_used bigint;
  v_runs bigint;
  v_in_run bigint;
  v_run_max integer;
  v_month_max integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_user_id IS NULL OR p_idempotency_key IS NULL OR p_research_kind IS NULL OR p_operation IS NULL OR p_operation NOT IN ('search','fetch') OR p_research_kind NOT IN ('normal','automatic','deep')
    OR p_research_run_id IS NULL OR p_price_version IS NULL OR length(p_price_version)>120
    THEN RAISE EXCEPTION 'invalid_web_retrieval_contract'; END IF;
  -- Preserve the canonical lock ordering: advisory user lock first, then cycle row.
  -- Otherwise concurrent model/search reservations could deadlock on inverse locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,45));
  SELECT * INTO v_cycle FROM public.xroga_billing_cycles
    WHERE user_id=p_user_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'active_billing_cycle_required'; END IF;
  IF now()<v_cycle.starts_at OR now()>=v_cycle.ends_at
    THEN RAISE EXCEPTION 'active_web_retrieval_cycle_required'; END IF;
  -- Preserve existing Free-tier access under the canonical shared provider ledger.
  -- The new $1.25 and 650/250/90 allowances apply only to paid cycles.
  IF v_cycle.cycle_kind='free' THEN
    RETURN public.reserve_xroga_provider_budget(
      p_user_id,p_idempotency_key,'daily_work','web.deepseek_'||p_operation,
      p_price_version,0,0,750);
  END IF;
  IF v_cycle.cycle_kind<>'paid' THEN
    RAISE EXCEPTION 'unsupported_web_retrieval_cycle';
  END IF;
  SELECT * INTO v_existing FROM public.xroga_provider_reservations
    WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO v_link FROM public.xroga_deepseek_web_calls
      WHERE reservation_id=v_existing.id;
    IF NOT FOUND OR v_link.user_id<>p_user_id OR v_link.cycle_id<>v_cycle.id
       OR v_link.operation<>p_operation OR v_link.research_kind<>p_research_kind OR v_link.research_run_id<>p_research_run_id
       THEN RAISE EXCEPTION 'web_retrieval_replay_mismatch'; END IF;
    RETURN v_existing;
  END IF;

  SELECT coalesce(sum(CASE WHEN r.status='settled' THEN coalesce(r.settled_micro_usd,r.reserved_micro_usd)
                   ELSE r.reserved_micro_usd END),0)
    INTO v_spent
    FROM public.xroga_deepseek_web_calls c
    JOIN public.xroga_provider_reservations r ON r.id=c.reservation_id
    WHERE c.cycle_id=v_cycle.id AND c.user_id=p_user_id
      AND r.status IN ('reserved','pending_reconciliation','settled');
  IF v_spent+750>1250000 THEN RAISE EXCEPTION 'web_retrieval_budget_exceeded'; END IF;
  IF p_research_kind='normal' THEN
    SELECT count(*) INTO v_used FROM public.xroga_deepseek_web_calls c
      JOIN public.xroga_provider_reservations r ON r.id=c.reservation_id
      WHERE c.cycle_id=v_cycle.id AND c.user_id=p_user_id
        AND c.research_kind='normal' AND r.status IN ('reserved','pending_reconciliation','settled');
    IF v_used>=650 THEN RAISE EXCEPTION 'normal_web_retrieval_allowance_exceeded'; END IF;
  ELSE
    SELECT count(*) INTO v_in_run FROM public.xroga_deepseek_web_calls c
      JOIN public.xroga_provider_reservations r ON r.id=c.reservation_id
      WHERE c.cycle_id=v_cycle.id AND c.user_id=p_user_id
        AND c.research_kind=p_research_kind AND c.research_run_id=p_research_run_id
        AND r.status IN ('reserved','pending_reconciliation','settled');
    IF p_research_kind='automatic' THEN
      v_run_max:=2;
      v_month_max:=250;
    ELSE
      v_run_max:=5;
      v_month_max:=90;
    END IF;
    IF v_in_run>=v_run_max THEN
      RAISE EXCEPTION 'research_run_operation_limit_exceeded';
    END IF;
    SELECT count(DISTINCT c.research_run_id) INTO v_runs FROM public.xroga_deepseek_web_calls c
      JOIN public.xroga_provider_reservations r ON r.id=c.reservation_id
      WHERE c.cycle_id=v_cycle.id AND c.user_id=p_user_id
        AND c.research_kind=p_research_kind AND r.status IN ('reserved','pending_reconciliation','settled');
    IF v_in_run=0 AND v_runs>=v_month_max THEN
      RAISE EXCEPTION 'monthly_research_run_allowance_exceeded';
    END IF;
  END IF;
  -- This remains the canonical reservation: same transaction, same cycle lock,
  -- same model/sandbox budget authority. Failed statements roll back both records.
  v_reserved := public.reserve_xroga_provider_budget(
    p_user_id,p_idempotency_key,'daily_work','web.deepseek_'||p_operation,
    p_price_version,0,0,750);
  INSERT INTO public.xroga_deepseek_web_calls(user_id,cycle_id,reservation_id,research_kind,research_run_id,operation)
    VALUES (p_user_id,v_cycle.id,v_reserved.id,p_research_kind,p_research_run_id,p_operation);
  RETURN v_reserved;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_xroga_deepseek_web(uuid,uuid,text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_xroga_deepseek_web(uuid,uuid,text,uuid,text,text) TO service_role;

-- The previously staged signature remains compatible with old Search clients.
CREATE OR REPLACE FUNCTION public.reserve_xroga_deepseek_web(
 p_user_id uuid, p_idempotency_key uuid, p_research_kind text, p_research_run_id uuid, p_price_version text
) RETURNS public.xroga_provider_reservations LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT public.reserve_xroga_deepseek_web(p_user_id,p_idempotency_key,p_research_kind,p_research_run_id,p_price_version,'search');
$$;
REVOKE ALL ON FUNCTION public.reserve_xroga_deepseek_web(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_xroga_deepseek_web(uuid,uuid,text,uuid,text) TO service_role;

-- Private, bounded retrieval cache. No shared-public cache or cross-user reuse.
CREATE TABLE IF NOT EXISTS public.xroga_private_retrieval_cache (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 cache_key text NOT NULL CHECK (cache_key ~ '^[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK (octet_length(result::text)<=262144),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,cache_key)
);
ALTER TABLE public.xroga_private_retrieval_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.xroga_private_retrieval_cache FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.xroga_private_retrieval_cache TO service_role;
CREATE OR REPLACE FUNCTION public.put_xroga_private_retrieval_cache(
 p_user_id uuid,p_cache_key text,p_result jsonb,p_ttl_seconds integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 IF p_user_id IS NULL OR p_ttl_seconds IS NULL OR p_ttl_seconds NOT BETWEEN 1 AND 600
   OR p_cache_key IS NULL OR p_cache_key !~ '^[a-f0-9]{64}$' OR p_result IS NULL OR octet_length(p_result::text)>262144
 THEN RAISE EXCEPTION 'invalid_private_cache_contract'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,46));
 DELETE FROM public.xroga_private_retrieval_cache WHERE user_id=p_user_id AND expires_at<=now();
 INSERT INTO public.xroga_private_retrieval_cache(user_id,cache_key,result,expires_at)
 VALUES(p_user_id,p_cache_key,p_result,now()+make_interval(secs=>p_ttl_seconds))
 ON CONFLICT(user_id,cache_key) DO UPDATE SET result=excluded.result,expires_at=excluded.expires_at,created_at=now();
 DELETE FROM public.xroga_private_retrieval_cache WHERE user_id=p_user_id AND cache_key IN
  (SELECT cache_key FROM public.xroga_private_retrieval_cache WHERE user_id=p_user_id ORDER BY created_at DESC,cache_key OFFSET 256);
END;
$$;
REVOKE ALL ON FUNCTION public.put_xroga_private_retrieval_cache(uuid,text,jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.put_xroga_private_retrieval_cache(uuid,text,jsonb,integer) TO service_role;

NOTIFY pgrst, 'reload schema';
