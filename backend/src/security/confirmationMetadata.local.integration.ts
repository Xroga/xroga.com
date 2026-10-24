import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createTenantContext} from './tenantContext.js';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createBusinessActionConfirmation,confirmBusinessAction} from '../services/integrations/businessActionConfirmations.js';
import {verifyPlanDigest,type BusinessActionPlan} from '../services/integrations/businessAction.js';
import {reserveProviderBudget,finishFailedProviderReservation} from '../ai/providerBudget.js';

type Actor={id:string;token:string};
type ApiRequest=(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>;
export function registerConfirmationMetadataTests(admin:SupabaseClient,getUsers:()=>readonly Actor[],request:ApiRequest):void{
 test('real confirmation metadata preserves owner scope through create read cancel expiry and concurrent rejected execution',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [owner,other]=getUsers(),ids:string[]=[];
  t.after(async()=>{if(ids.length)assert.equal((await admin.from('business_action_confirmations').delete().in('id',ids)).error,null);});
  // Deterministic signed fixture, not a planned or executed provider action.
  const unsigned={version:'1.0' as const,sessionId:`trs_${randomUUID()}`,useCase:'isolated metadata fixture',toolkit:'fixture',toolSlug:'fixture',arguments:{},risk:'write' as const,requiresConfirmation:true,summary:`Synthetic confirmation ${randomUUID()}`,requiredScopes:[] as string[],scopeRequirements:null};
  const canonical=Object.fromEntries(Object.entries(unsigned).sort(([a],[b])=>a.localeCompare(b)));
  const plan:BusinessActionPlan={...unsigned,planDigest:createHash('sha256').update(JSON.stringify(canonical)).digest('hex')};assert.equal(verifyPlanDigest(plan),true);
  const seed=async(userId:string)=>{const created=await createBusinessActionConfirmation(userId,plan);ids.push(created.id);assert.equal(created.status,'pending');assert.equal(created.summary,plan.summary);assert.ok(!JSON.stringify(created).includes('planDigest'));return created.id;};
  const own=await seed(owner.id),foreign=await seed(other.id);
  const persisted=async(id:string)=>{const row=await admin.from('business_action_confirmations').select('*').eq('id',id).single();assert.equal(row.error,null);return row.data!;};
  const foreignBefore=await persisted(foreign),ownBefore=await persisted(own);assert.equal(ownBefore.user_id,owner.id);assert.deepEqual(ownBefore.plan,plan);assert.equal(ownBefore.plan_digest,plan.planDigest);
  await assert.rejects(createBusinessActionConfirmation(owner.id,{...plan,arguments:{changed:true}}),{code:'BUSINESS_ACTION_PLAN_CHANGED'});
  assert.deepEqual(await persisted(own),ownBefore);assert.deepEqual(await persisted(foreign),foreignBefore);
  const route=(id:string)=>`/api/phase1/business-actions/confirmations/${id}`;
  const read=await request(`${route(own)}?userId=${other.id}`,owner.token);assert.equal(read.status,200);const safe=(await read.json() as {confirmation:Record<string,unknown>}).confirmation;assert.equal(safe.id,own);assert.equal(safe.summary,plan.summary);assert.equal(safe.plan,undefined);assert.equal(safe.user_id,undefined);
  for(const [suffix,method]of [['','GET'],['/confirm','POST'],['/cancel','POST']]){
   assert.equal((await request(route(own)+suffix,undefined,method)).status,401);
   assert.equal((await request(route(foreign)+suffix,owner.token,method,method==='GET'?undefined:{userId:other.id,tenantId:other.id})).status,404);
  }
  const cancelled=await Promise.all(Array.from({length:3},()=>request(route(own)+'/cancel',owner.token,'POST',{userId:other.id})));for(const response of cancelled){assert.equal(response.status,200);assert.equal((await response.json() as {confirmation:{status:string}}).confirmation.status,'cancelled');}
  const cancelRow=await persisted(own);assert.equal(cancelRow.status,'cancelled');assert.equal(cancelRow.claimed_at,null);assert.ok(Number.isFinite(Date.parse(cancelRow.completed_at)));assert.deepEqual(cancelRow.plan,plan);
  assert.equal((await request(route(own)+'/cancel',owner.token,'POST',{})).status,200);assert.deepEqual(await persisted(own),cancelRow);
  assert.equal((await request(route(own)+'/confirm',owner.token,'POST',{})).status,409);assert.deepEqual(await persisted(foreign),foreignBefore);
  const expired=await seed(owner.id);assert.equal((await admin.from('business_action_confirmations').update({expires_at:new Date(Date.now()-60_000).toISOString()}).eq('id',expired)).error,null);
  const expiredRead=await request(route(expired),owner.token);assert.equal(expiredRead.status,200);assert.equal((await expiredRead.json() as {confirmation:{status:string}}).confirmation.status,'expired');assert.equal((await persisted(expired)).status,'expired');assert.deepEqual(await persisted(foreign),foreignBefore);
  // Deliberate malformed legacy state passes structural checks but must fail the
  // canonical digest before any tool metadata, account lookup or provider I/O.
  const failed=await seed(owner.id),invalid={...plan,planDigest:'a'.repeat(64)};
  assert.equal(verifyPlanDigest(invalid),false);assert.equal((await admin.from('business_action_confirmations').update({plan:invalid,plan_digest:invalid.planDigest}).eq('id',failed)).error,null);
  const context=createTenantContext({userId:owner.id,via:'persisted_owner'});
  const outcomes=await Promise.allSettled(Array.from({length:2},()=>confirmBusinessAction(context,failed)));
  const codes:string[]=[];for(const outcome of outcomes){assert.equal(outcome.status,'rejected');if(outcome.status==='rejected')codes.push(outcome.reason.code);}
  assert.deepEqual(codes.sort(),['BUSINESS_ACTION_CONFIRMATION_ALREADY_USED','BUSINESS_ACTION_PLAN_CHANGED'].sort());
  const failedRow=await persisted(failed);assert.equal(failedRow.user_id,owner.id);assert.equal(failedRow.status,'failed');assert.equal(failedRow.failure_code,'BUSINESS_ACTION_PLAN_CHANGED');assert.ok(Number.isFinite(Date.parse(failedRow.claimed_at)));assert.ok(Number.isFinite(Date.parse(failedRow.completed_at)));assert.deepEqual(failedRow.plan,invalid);assert.deepEqual(await persisted(foreign),foreignBefore);
  const failedReplay=await request(route(failed)+'/confirm',owner.token,'POST',{userId:other.id});assert.equal(failedReplay.status,409);assert.equal((await failedReplay.json() as {code:string}).code,'TOOL_UNAVAILABLE');assert.deepEqual(await persisted(failed),failedRow);
 });
 test('real failed reservation wrapper releases only the matching owner and retains uncertain holds',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const actors:{id:string}[]=[];t.after(async()=>{for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
  for(let i=0;i<2;i++){const created=await admin.auth.admin.createUser({email:`failure-budget-${randomUUID()}@example.invalid`,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);actors.push({id:created.data.user.id});}
  const [owner,other]=actors,input={modelId:'deepseek_v4_flash' as const,estimatedInputTokens:100,maximumOutputTokens:100};
  const absent=await admin.from('xroga_billing_cycles').select('id').in('user_id',actors.map(a=>a.id));assert.equal(absent.error,null);assert.deepEqual(absent.data,[]);
  const reserved=await reserveProviderBudget({...input,userId:owner.id,idempotencyKey:randomUUID()}),foreign=await reserveProviderBudget({...input,userId:other.id,idempotencyKey:randomUUID()});
  const rows=async()=>{const r=await admin.from('xroga_provider_reservations').select('*').in('id',[reserved.id,foreign.id]).order('id');assert.equal(r.error,null);assert.equal(r.data?.length,2);return r.data!;};
  const cycles=async()=>{const r=await admin.from('xroga_billing_cycles').select('*').in('user_id',[owner.id,other.id]).order('id');assert.equal(r.error,null);return r.data!;};
  const before=await rows(),beforeCycles=await cycles();
  assert.equal(beforeCycles.length,2);assert.ok(beforeCycles.every(c=>c.cycle_kind==='free'&&c.status==='active'&&Number(c.entitlement_micro_usd)===1_650_000));
  await finishFailedProviderReservation({userId:other.id,reservation:reserved,error:new Error('invalid request')});assert.deepEqual(await rows(),before);assert.deepEqual(await cycles(),beforeCycles);
  await finishFailedProviderReservation({userId:owner.id,reservation:reserved,error:new Error('invalid request')});
  const after=await rows();assert.equal(after.find(r=>r.id===reserved.id)?.status,'released');assert.deepEqual(after.find(r=>r.id===foreign.id),before.find(r=>r.id===foreign.id));
  const foreignCycle=beforeCycles.filter(c=>c.user_id===other.id);assert.deepEqual((await cycles()).filter(c=>c.user_id===other.id),foreignCycle);
  await finishFailedProviderReservation({userId:owner.id,reservation:reserved,error:new Error('invalid request')});assert.deepEqual(await rows(),after);
  await finishFailedProviderReservation({userId:other.id,reservation:foreign,error:new Error('timeout')});const held=await rows();assert.equal(held.find(r=>r.id===foreign.id)?.status,'pending_reconciliation');assert.deepEqual(held.find(r=>r.id===reserved.id),after.find(r=>r.id===reserved.id));
 });
}
