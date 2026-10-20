import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createTenantContext, type TenantContext} from '../security/tenantContext.js';
import {syncPlanBudget} from './quota.js';
import {activatePaidCycle} from './providerBudget.js';

test('dormant budget writers require original issued owners and exact durable receipts', async t => {
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'], previous=keys.map(key=>process.env[key]);
  t.after(()=>keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];}));
  process.env.SUPABASE_URL='http://127.0.0.1:49196';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const owner=randomUUID(),other=randomUUID(),context=createTenantContext({userId:owner,via:'local_jwt'});
  const start=new Date(),end=new Date(start.getTime()+86400000);
  const input=()=>({userId:owner,providerReference:'synthetic-evidence',startsAt:new Date(start),endsAt:new Date(end)});
  let calls=0, budgetReceipt:unknown, cycleReceipt:unknown, changeDuringWait:(()=>void)|undefined;
  const usage={user_id:owner,plan_tier:'spark',plan_budget_usd:20,quota_period_start:`${start.toISOString().slice(0,7)}-01`,
    input_tokens:0,output_tokens:0,spent_usd:0,rollover_usd:0,model_usage:{}};
  const cycle={id:randomUUID(),user_id:owner,cycle_kind:'paid',provider_reference:'synthetic-evidence',starts_at:start.toISOString(),ends_at:end.toISOString()};
  t.mock.method(globalThis,'fetch',async (resource:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(resource));assert.equal(url.origin,'http://127.0.0.1:49196');calls++;
    if(url.pathname.endsWith('/set_user_ai_plan_budget')){
      assert.deepEqual(JSON.parse(String(init?.body)),{p_user_id:owner,p_plan_tier:'spark',p_plan_budget_usd:20});
      return Response.json(null);
    }
    if(url.pathname.endsWith('/user_token_usage')){assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);return Response.json(budgetReceipt);}
    if(url.pathname.endsWith('/activate_xroga_paid_cycle')){
      assert.deepEqual(JSON.parse(String(init?.body)),{p_user_id:owner,p_provider_reference:'synthetic-evidence',p_starts_at:start.toISOString(),p_ends_at:end.toISOString()});
      changeDuringWait?.();return Response.json(cycleReceipt);
    }
    if(url.pathname.endsWith('/ensure_xroga_free_cycle')){assert.deepEqual(JSON.parse(String(init?.body)),{p_user_id:owner});return Response.json(null);}
    assert.equal(url.pathname,'/rest/v1/xroga_billing_cycles');assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
    return Response.json({...cycle,status:'active',entitlement_micro_usd:16500000,pacing:'balanced_month',settled_micro_usd:0,reserved_micro_usd:0,accounting_safety_hold_micro_usd:0,accelerated_unlock_micro_usd:0});
  });
  for(const forged of [owner,{...context},structuredClone(context),{userId:other}]){
    await assert.rejects(syncPlanBudget(forged as TenantContext,'spark'),{status:401});
    await assert.rejects(activatePaidCycle(forged as TenantContext,input()),{status:401});
  }
  await assert.rejects(activatePaidCycle(context,{...input(),userId:other}),{status:404});assert.equal(calls,0);
  for(budgetReceipt of [null,[],{...usage,user_id:other},{...usage,plan_tier:'free'},{...usage,plan_budget_usd:0}]){
    await assert.rejects(syncPlanBudget(context,'spark'),{code:'QUOTA_UNAVAILABLE'});
  }
  budgetReceipt=usage;await syncPlanBudget(context,'spark');
  for(cycleReceipt of [null,[],{}, {...cycle,id:'invalid'},{...cycle,user_id:other},{...cycle,provider_reference:'foreign'},
    {...cycle,cycle_kind:'free'},{...cycle,starts_at:new Date(start.getTime()+1).toISOString()}, {...cycle,ends_at:'invalid'}]){
    const before:number=calls;await assert.rejects(activatePaidCycle(context,input()),/Paid entitlement could not be activated/);
    assert.equal(calls,before+1,'Invalid persistence evidence must not trigger a subsequent entitlement read');
  }
  cycleReceipt=cycle;
  const mutable=input();changeDuringWait=()=>{mutable.userId=other;mutable.startsAt.setTime(0);mutable.endsAt.setTime(0);mutable.providerReference='foreign';};
  assert.equal((await activatePaidCycle(context,mutable)).state,'paid_active');
});
