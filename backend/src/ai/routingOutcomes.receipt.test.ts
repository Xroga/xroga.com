import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createTenantContext,type TenantContext} from '../security/tenantContext.js';
import {recordRoutingOutcome,recentRoutingOutcomes,resetRoutingOutcomeCache, type RoutingOutcome} from './routingOutcomes.js';

test('optional routing persistence never treats a substituted or unavailable receipt as cached success',async t=>{
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=keys.map(key=>process.env[key]);
  t.after(()=>{resetRoutingOutcomeCache();keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});});
  process.env.SUPABASE_URL='http://127.0.0.1:49197';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const userId=randomUUID(),other=randomUUID(),context=createTenantContext({userId,via:'local_jwt'});
  const input:RoutingOutcome={runId:randomUUID(),userId,taskClass:'code_generation',modelId:'deepseek_v4_flash',mode:'balanced',inputTokens:1,outputTokens:2,repairLoops:0,modelSwitches:0,requiredCapabilities:['fixture']};
  let calls=0,mode:unknown,mutate:(()=>void)|undefined;const warnings:unknown[][]=[];
  t.mock.method(console,'warn',(...args:unknown[])=>{warnings.push(args);});
  t.mock.method(globalThis,'fetch',async(resource:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(resource));assert.equal(url.origin,'http://127.0.0.1:49197');assert.equal(url.pathname,'/rest/v1/model_routing_outcomes');calls++;
    const row=JSON.parse(String(init?.body));assert.equal(row.user_id,userId);assert.ok(url.searchParams.get('select')?.includes('user_id'));mutate?.();
    if(mode==='transport')throw new Error('PRIVATE_CANARY');
    if(mode==='outage')return Response.json({message:'PRIVATE_CANARY'},{status:400});
    return Response.json(mode==='valid'?row:mode==='foreign'?{...row,user_id:other}:mode==='content'?{...row,required_capabilities:['foreign']}:mode);
  });
  for(const forged of [userId,{...context}])await assert.rejects(recordRoutingOutcome(forged as TenantContext,input),{status:401});
  await assert.rejects(recordRoutingOutcome(context,{...input,userId:other}),{status:404});assert.equal(calls,0);
  for(mode of [null,{},[],'foreign','content','outage','transport']){
    resetRoutingOutcomeCache();await recordRoutingOutcome(context,input);assert.deepEqual(recentRoutingOutcomes(),[]);
  }
  assert.ok(warnings.length>=7);assert.ok(warnings.every(args=>JSON.stringify(args)==='["[routingOutcomes] persistence unavailable"]'));
  mode='valid';mutate=()=>{input.userId=other;input.requiredCapabilities![0]='mutated';};
  await recordRoutingOutcome(context,input);const saved=recentRoutingOutcomes();assert.equal(saved.length,1);assert.equal(saved[0].userId,userId);assert.deepEqual(saved[0].requiredCapabilities,['fixture']);
});
