-- Run ONLY in the named disposable staging project dqxnatoessviphudbhei,
-- inside BEGIN/ROLLBACK with the additive migration under test. Never production.
-- Synthetic accounting fixtures; no provider requests or customer rows are read.
CREATE TEMP TABLE search_os_checks(name text PRIMARY KEY,passed boolean NOT NULL);
ALTER TABLE search_os_checks ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE users uuid[]:=ARRAY[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 u uuid; cy uuid; run_id uuid; first_run uuid; idem uuid; r public.xroga_provider_reservations;
 kind text; mode_index integer; run_count integer; operations integer; i integer; j integer; message text;
BEGIN
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 FOREACH u IN ARRAY users LOOP
  INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
   VALUES(u,'authenticated','authenticated','search-os-fixture-'||u::text||'@example.invalid',now(),now());
  INSERT INTO public.xroga_billing_cycles(user_id,cycle_kind,status,starts_at,ends_at,entitlement_micro_usd,pacing,full_access_confirmed_at)
   VALUES(u,'paid','active',now()-interval '1 day',now()+interval '29 days',16500000,'full_access',now());
 END LOOP;
 FOR mode_index IN 1..3 LOOP
  u:=users[mode_index];kind:=CASE mode_index WHEN 1 THEN 'normal' WHEN 2 THEN 'automatic' ELSE 'deep' END;
  run_count:=CASE mode_index WHEN 1 THEN 650 WHEN 2 THEN 250 ELSE 90 END;
  operations:=CASE mode_index WHEN 1 THEN 1 WHEN 2 THEN 2 ELSE 5 END;
  FOR i IN 1..run_count LOOP
   run_id:=gen_random_uuid();IF i=1 THEN first_run:=run_id;END IF;
   FOR j IN 1..operations LOOP
    idem:=gen_random_uuid();
    r:=public.reserve_xroga_deepseek_web(u,idem,kind,run_id,'synthetic-staging-750',CASE WHEN j%2=0 THEN 'fetch' ELSE 'search' END);
    IF r.reserved_micro_usd<>750 OR r.user_id<>u THEN RAISE EXCEPTION 'wrong admission';END IF;
    -- Exact replay neither charges nor consumes another operation.
    IF (public.reserve_xroga_deepseek_web(u,idem,kind,run_id,'synthetic-staging-750',CASE WHEN j%2=0 THEN 'fetch' ELSE 'search' END)).id<>r.id THEN
     RAISE EXCEPTION 'replay changed identity';END IF;
   END LOOP;
  END LOOP;
  BEGIN
   PERFORM public.reserve_xroga_deepseek_web(u,gen_random_uuid(),kind,gen_random_uuid(),'synthetic-staging-750','search');
   RAISE EXCEPTION 'monthly cap failed';
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
   IF message<>(CASE WHEN kind='normal' THEN 'normal_web_retrieval_allowance_exceeded' ELSE 'monthly_research_run_allowance_exceeded' END) THEN RAISE;END IF;
  END;
  IF kind<>'normal' THEN
   BEGIN
    PERFORM public.reserve_xroga_deepseek_web(u,gen_random_uuid(),kind,first_run,'synthetic-staging-750','fetch');
    RAISE EXCEPTION 'per-run cap failed';
   EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
    IF message<>'research_run_operation_limit_exceeded' THEN RAISE;END IF;
   END;
  END IF;
  INSERT INTO search_os_checks VALUES(kind||'-monthly-and-operation-limits',true);
 END LOOP;
 -- A pre-existing uncertain hold must count toward the dollar ceiling.
 u:=users[4];SELECT id INTO cy FROM public.xroga_billing_cycles WHERE user_id=u;
 r:=public.reserve_xroga_provider_budget(u,gen_random_uuid(),'daily_work','web.deepseek_search','synthetic-prior-hold',0,0,1249250);
 INSERT INTO public.xroga_deepseek_web_calls(user_id,cycle_id,reservation_id,research_kind,research_run_id,operation)
 VALUES(u,cy,r.id,'normal',gen_random_uuid(),'search');
 UPDATE public.xroga_provider_reservations SET status='pending_reconciliation' WHERE id=r.id;
 PERFORM public.reserve_xroga_deepseek_web(u,gen_random_uuid(),'normal',gen_random_uuid(),'synthetic-staging-750','fetch');
 BEGIN
  PERFORM public.reserve_xroga_deepseek_web(u,gen_random_uuid(),'normal',gen_random_uuid(),'synthetic-staging-750','search');
  RAISE EXCEPTION 'dollar cap failed';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message<>'web_retrieval_budget_exceeded' THEN RAISE;END IF;
 END;
 INSERT INTO search_os_checks VALUES('1250000-exact-boundary-and-uncertain-holds',true);
 PERFORM public.put_xroga_private_retrieval_cache(users[1],repeat('a',64),'{"fixture":"owner-one"}',60);
 PERFORM public.put_xroga_private_retrieval_cache(users[2],repeat('a',64),'{"fixture":"owner-two"}',600);
 IF (SELECT count(*) FROM public.xroga_private_retrieval_cache WHERE user_id=ANY(users) AND cache_key=repeat('a',64))<>2 THEN RAISE EXCEPTION 'private cache owner collision'; END IF;
 INSERT INTO search_os_checks VALUES('private-cache-owner-key-isolation',true);
 IF has_function_privilege('authenticated','public.reserve_xroga_deepseek_web(uuid,uuid,text,uuid,text,text)','execute')
  OR has_function_privilege('anon','public.put_xroga_private_retrieval_cache(uuid,text,jsonb,integer)','execute')
  OR has_table_privilege('authenticated','public.xroga_private_retrieval_cache','select')
  OR has_table_privilege('anon','public.xroga_deepseek_web_calls','select') THEN RAISE EXCEPTION 'public access';END IF;
 INSERT INTO search_os_checks VALUES('service-only-rpcs-and-private-tables',true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 BEGIN
  PERFORM public.reserve_xroga_deepseek_web(users[1],gen_random_uuid(),'normal',gen_random_uuid(),'synthetic-staging-750','search');
  RAISE EXCEPTION 'role check failed';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message<>'service_role_required' THEN RAISE;END IF;
 END;
 INSERT INTO search_os_checks VALUES('authenticated-claim-rejected',true);
END;
$$;
SELECT * FROM search_os_checks ORDER BY name;
