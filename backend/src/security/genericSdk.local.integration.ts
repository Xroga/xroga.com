import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createTenantContext} from './tenantContext.js';
import {withTenantModelReservation} from '../ai/tenantModelDispatch.js';
import {chatCompletion,chatCompletionStream,type ChatMessage} from '../ai/openaiCompat.js';

/** Real disposable owner/project/reservation/settlement/atomic ledger. Only the
 * external model bytes are synthetic. No production or live provider access. */
export function registerGenericSdkTests(admin:SupabaseClient):void{
  test('real generic JSON and SSE SDK callers settle once, require an exact atomic receipt and deny committed project transfer before wire',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');assert.equal(process.env.GLM_API_KEY,undefined);
    const actors:string[]=[];
    t.after(async()=>{for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor)).error,null);});
    for(let i=0;i<2;i++){
      const created=await admin.auth.admin.createUser({email:`generic-sdk-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);actors.push(created.data.user.id);
    }
    const [owner,foreign]=actors,context=createTenantContext({userId:owner,via:'persisted_owner'});
    const created=await admin.from('projects').insert({user_id:owner,name:'Synthetic generic SDK fixture',type:'app'}).select('id').single();
    assert.equal(created.error,null);assert.ok(created.data);const project=created.data.id as string;
    assert.equal((await admin.from('user_token_usage').upsert({user_id:owner,input_tokens:0,output_tokens:0,model_usage:{},spent_usd:0,
      rollover_usd:0,plan_tier:'free',plan_budget_usd:1.65,quota_period_start:new Date().toISOString().slice(0,7)+'-01'})).error,null);
    process.env.GLM_API_KEY='synthetic-generic-sdk-key';t.after(()=>{delete process.env.GLM_API_KEY;});
    const nativeFetch=globalThis.fetch;let sends=0,mode='ok',atomicCalls=0,settlements=0;
    t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
      const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      if(url.origin==='https://open.bigmodel.cn'){
        assert.equal(url.href,'https://open.bigmodel.cn/api/paas/v4/chat/completions');assert.equal(init?.redirect,'manual');
        assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-generic-sdk-key');
        const body=JSON.parse(String(init?.body));assert.equal(body.model,'glm-5.3-flash');
        assert.doesNotMatch(String(init?.body),/synthetic-generic-sdk-key|SYNTHETIC_CREDENTIAL/);sends++;
        const receipt={id:'synthetic-generic-'+randomUUID(),choices:[body.stream?{delta:{content:'synthetic owned result'},finish_reason:'stop'}:{message:{content:'synthetic owned result'},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:2}};
        return body.stream?new Response('data: '+JSON.stringify(receipt)+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}}):Response.json(receipt);
      }
      assert.equal(url.origin,process.env.SUPABASE_URL);
      const response=await nativeFetch(input,init);
      if(url.pathname.endsWith('/settle_xroga_provider_budget')){assert.equal(response.status,200);settlements++;}
      if(url.pathname.endsWith('/record_ai_usage_atomic')){
        atomicCalls++;assert.equal(response.status,200);
        if(mode==='foreignReceipt')return Response.json({...await response.json() as Record<string,unknown>,userId:foreign});
      }
      if(mode==='transfer'&&url.pathname.endsWith('/reserve_xroga_provider_budget')){
        mode='transferred';assert.equal(response.status,200);
        assert.equal((await admin.from('projects').update({user_id:foreign}).eq('id',project).eq('user_id',owner)).error,null);
      }
      return response;
    });
    const scope={context,userId:owner,projectId:project,connectedAccountId:'platform'};
    const messages:ChatMessage[]=[{role:'user',content:'Synthetic owned source'}];
    const ledger=()=>admin.from('ai_usage_ledger').select('id,accounting_receipt_id,input_tokens,output_tokens').eq('user_id',owner).order('id');
    for(const invoke of [chatCompletion,chatCompletionStream]){
      const deltas:string[]=[];
      const run=(signal?:AbortSignal)=>withTenantModelReservation({scope,modelId:'glm_5_3_flash',payload:{messages},estimatedInputTokens:100,maximumOutputTokens:64,
        execute:d=>invoke('glm_5_3_flash',d.payload.messages as ChatMessage[],{maxTokens:64,credentialOverride:d.credentialOverride,beforeDispatch:d.beforeDispatch,signal,onDelta:text=>deltas.push(text)})});
      mode='ok';const beforeSend:number=sends,beforeAtomic:number=atomicCalls,beforeSettle:number=settlements;
      assert.equal((await run()).text,'synthetic owned result');assert.equal(sends,beforeSend+1);
      assert.equal(atomicCalls,beforeAtomic+1);assert.equal(settlements,beforeSettle+1);assert.equal(deltas.length,invoke===chatCompletionStream?1:0);
      const rows=await ledger();assert.equal(rows.error,null);assert.equal(rows.data!.at(-1)!.input_tokens,3);assert.equal(rows.data!.at(-1)!.output_tokens,2);
      assert.match(rows.data!.at(-1)!.accounting_receipt_id,/^[0-9a-f-]{36}$/i);
      mode='foreignReceipt';deltas.length=0;
      await assert.rejects(run(),{code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN'});
      assert.equal(sends,beforeSend+2);assert.deepEqual(deltas,[]);
      const beforeTransfer=await ledger();mode='transfer';
      try{await assert.rejects(run(),{code:'MODEL_DISPATCH_BINDING_DENIED'});assert.equal(sends,beforeSend+2);assert.deepEqual((await ledger()).data,beforeTransfer.data);}
      finally{assert.equal((await admin.from('projects').update({user_id:owner}).eq('id',project).eq('user_id',foreign)).error,null);}
      mode='ok';const controller=new AbortController();controller.abort();
      await assert.rejects(run(controller.signal),{name:'AbortError'});assert.equal(sends,beforeSend+2);
    }
    assert.equal((await ledger()).data!.length,4);assert.equal(atomicCalls,4);assert.equal(settlements,4);
    assert.equal((await admin.from('ai_usage_ledger').select('id').eq('user_id',foreign)).data!.length,0);
  });
}
