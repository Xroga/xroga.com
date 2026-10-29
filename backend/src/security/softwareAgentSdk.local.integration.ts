import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createTenantContext} from './tenantContext.js';
import {createXrogaAgentModel} from '../ai/softwareAgent/xrogaAgentModel.js';

/** Actual disposable Auth/PostgREST/PG reservations and atomic ledger. Only the
 * external model response is synthetic, intercepted at the fixed provider URL.
 * No external model service, customer account or production data is used. */
export function registerSoftwareAgentSdkTests(admin:SupabaseClient):void{
  test('real SoftwareAgent SDK caller binds owner and project through reservation, emits one atomic receipt and denies ownership transfer before wire',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    assert.equal(process.env.GLM_API_KEY,undefined,'Never replace an actual provider credential');
    const actors:string[]=[];
    t.after(async()=>{for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor)).error,null);});
    for(let n=0;n<2;n++){
      const created=await admin.auth.admin.createUser({email:`agent-sdk-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);actors.push(created.data.user.id);
    }
    const [owner,foreign]=actors,context=createTenantContext({userId:owner,via:'persisted_owner'});
    const created=await admin.from('projects').insert({user_id:owner,name:'Synthetic SDK boundary fixture',type:'app'}).select('id').single();
    assert.equal(created.error,null);assert.ok(created.data);const project=created.data.id as string;
    assert.equal((await admin.from('user_token_usage').upsert({user_id:owner,input_tokens:0,output_tokens:0,model_usage:{},spent_usd:0,
      rollover_usd:0,plan_tier:'free',plan_budget_usd:1.65,quota_period_start:new Date().toISOString().slice(0,7)+'-01'})).error,null);
    process.env.GLM_API_KEY='synthetic-agent-sdk-key';t.after(()=>{delete process.env.GLM_API_KEY;});
    const nativeFetch=globalThis.fetch;let providerCalls=0,transferAtReservation=false;
    t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      if(url.origin==='https://open.bigmodel.cn'){
        assert.equal(url.href,'https://open.bigmodel.cn/api/paas/v4/chat/completions');assert.equal(init?.redirect,'manual');
        const body=JSON.parse(String(init?.body));assert.equal(body.stream,true);assert.equal(body.model,'glm-5.3-flash');
        assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-agent-sdk-key');
        assert.doesNotMatch(String(init?.body),/synthetic-agent-sdk-key|SYNTHETIC_CREDENTIAL/);providerCalls++;
        return new Response('data: '+JSON.stringify({id:'synthetic-sdk-'+randomUUID(),choices:[{delta:{content:'synthetic owned result'},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:2}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
      }
      assert.equal(url.origin,process.env.SUPABASE_URL,'No unknown provider or production transport');
      const response=await nativeFetch(input,init);
      if(transferAtReservation&&url.pathname.endsWith('/reserve_xroga_provider_budget')){
        transferAtReservation=false;
        assert.equal((await admin.from('projects').update({user_id:foreign}).eq('id',project).eq('user_id',owner)).error,null);
      }
      return response;
    });
    const scope={context,userId:owner,projectId:project,connectedAccountId:'platform'};
    const bound=createXrogaAgentModel({userId:owner,modelId:'glm_5_3_flash',dispatchScope:scope,maximumOutputTokens:1024});
    const collect=async()=>{
      const events=[];
      for await(const event of bound.stream({systemPrompt:'Synthetic owned task',messages:[{role:'user',content:[{type:'text',text:'Synthetic owned project text'}]}],tools:[]} as Parameters<typeof bound.stream>[0]))events.push(event);
      return events;
    };
    assert.ok((await collect()).length>0);assert.equal(providerCalls,1);
    const ledger=()=>admin.from('ai_usage_ledger').select('*').eq('user_id',owner).order('id');
    const before=await ledger();assert.equal(before.error,null);assert.equal(before.data!.length,1);
    assert.equal(before.data![0].input_tokens,3);assert.equal(before.data![0].output_tokens,2);
    assert.match(before.data![0].accounting_receipt_id,/^[0-9a-f-]{36}$/i);
    const reservations=await admin.from('xroga_provider_reservations').select('user_id,status,actual_input_tokens,output_tokens').eq('user_id',owner);
    assert.equal(reservations.error,null);assert.equal(reservations.data!.length,1);assert.equal(reservations.data![0].status,'settled');
    assert.equal(reservations.data![0].actual_input_tokens,3);assert.equal(reservations.data![0].output_tokens,2);
    transferAtReservation=true;
    await assert.rejects(collect(),{code:'MODEL_DISPATCH_BINDING_DENIED'});
    assert.equal(providerCalls,1,'Committed project transfer between reservation and wire sends zero additional model bytes');
    assert.deepEqual((await ledger()).data,before.data,'Denied turn must not manufacture completion accounting');
    assert.equal((await admin.from('ai_usage_ledger').select('id').eq('user_id',foreign)).data!.length,0);
  });
}
