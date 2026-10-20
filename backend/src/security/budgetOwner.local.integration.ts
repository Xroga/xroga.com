import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import pg from 'pg';
import {syncPlanBudget} from '../ai/quota.js';
import {activatePaidCycle} from '../ai/providerBudget.js';
import {createTenantContext,type TenantContext} from './tenantContext.js';

/** Synthetic evidence references, real isolated Auth and SQL. Never a provider payment. */
export function registerBudgetOwnerTests(admin:SupabaseClient):void{
  test('real dormant budget contracts retain issued owners through concurrent replay and SQL failures',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const actors:{id:string;context:TenantContext;token:string}[]=[];
    t.after(async()=>{for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
    for(let n=0;n<2;n++){
      const email=`dormant-budget-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
      const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
      const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);
      actors.push({id:created.data.user.id,context:createTenantContext({userId:created.data.user.id,via:'remote_getuser'}),token:signed.data.session.access_token});
    }
    const [owner,other]=actors,startsAt=new Date(),endsAt=new Date(startsAt.getTime()+86400000),providerReference=`synthetic-${randomUUID()}`;
    const input={userId:owner.id,providerReference,startsAt,endsAt};
    const rows=async(user:string)=>{
      const usage=await admin.from('user_token_usage').select('*').eq('user_id',user),cycles=await admin.from('xroga_billing_cycles').select('*').eq('user_id',user).order('id');
      assert.equal(usage.error,null);assert.equal(cycles.error,null);return{usage:usage.data,cycles:cycles.data};
    };
    await syncPlanBudget(other.context,'free');
    await activatePaidCycle(other.context,{...input,userId:other.id,providerReference:`other-${providerReference}`});
    const foreignBefore=await rows(other.id);
    for(const forged of [owner.id,{...owner.context},structuredClone(owner.context)]){
      await assert.rejects(syncPlanBudget(forged as TenantContext,'spark'),{status:401});
      await assert.rejects(activatePaidCycle(forged as TenantContext,input),{status:401});
    }
    await assert.rejects(activatePaidCycle(owner.context,{...input,userId:other.id}),{status:404});
    await Promise.all([syncPlanBudget(owner.context,'spark'),syncPlanBudget(owner.context,'spark')]);
    const statuses=await Promise.all([activatePaidCycle(owner.context,input),activatePaidCycle(owner.context,input)]);
    assert.ok(statuses.every(row=>row.state==='paid_active'));
    let saved=await rows(owner.id);assert.equal(saved.usage?.length,1);assert.equal(saved.usage![0].user_id,owner.id);assert.equal(saved.usage![0].plan_tier,'spark');assert.equal(Number(saved.usage![0].plan_budget_usd),20);
    const paid=saved.cycles!.filter(row=>row.provider_reference===providerReference);assert.equal(paid.length,1);assert.equal(paid[0].user_id,owner.id);assert.equal(Date.parse(paid[0].starts_at),startsAt.getTime());assert.equal(Date.parse(paid[0].ends_at),endsAt.getTime());
    const beforeReplay=saved;
    assert.equal((await activatePaidCycle(owner.context,input)).state,'paid_active');
    assert.deepEqual(await rows(owner.id),beforeReplay);
    await assert.rejects(activatePaidCycle(owner.context,{...input,endsAt:new Date(endsAt.getTime()+1)}),/Paid entitlement could not be activated/);
    assert.deepEqual(await rows(owner.id),beforeReplay);assert.deepEqual(await rows(other.id),foreignBefore);
    for(const token of [undefined,owner.token]){
      const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
      for(const actor of actors){
        assert.equal((await browser.rpc('set_user_ai_plan_budget',{p_user_id:actor.id,p_plan_tier:'spark',p_plan_budget_usd:20})).error?.code,'42501');
        assert.equal((await browser.rpc('activate_xroga_paid_cycle',{p_user_id:actor.id,p_provider_reference:'denied',p_starts_at:startsAt.toISOString(),p_ends_at:endsAt.toISOString()})).error?.code,'42501');
      }
    }
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();
    const suffix=randomUUID().replaceAll('-',''),constraint=`fixture_budget_${suffix}`;
    try{
      // A real database refusal must neither return success nor create a cycle.
      await db.query(`alter table public.user_token_usage add constraint ${constraint} check (user_id <> '${owner.id}'::uuid or plan_tier <> 'free') not valid`);
      await assert.rejects(syncPlanBudget(owner.context,'free'),{code:'QUOTA_UNAVAILABLE'});
      assert.deepEqual(await rows(owner.id),beforeReplay);
      await db.query(`alter table public.xroga_billing_cycles add constraint ${constraint} check (user_id <> '${owner.id}'::uuid or provider_reference <> 'forced-failure') not valid`);
      await assert.rejects(activatePaidCycle(owner.context,{...input,providerReference:'forced-failure'}),/Paid entitlement could not be activated/);
      assert.deepEqual(await rows(owner.id),beforeReplay);
    }finally{
      await db.query(`alter table public.user_token_usage drop constraint if exists ${constraint}`);
      await db.query(`alter table public.xroga_billing_cycles drop constraint if exists ${constraint}`);await db.end();
    }
    await syncPlanBudget(owner.context,'free');saved=await rows(owner.id);assert.equal(saved.usage![0].plan_tier,'free');assert.equal(Number(saved.usage![0].plan_budget_usd),1.65);
    assert.deepEqual(await rows(other.id),foreignBefore);
  });
}
