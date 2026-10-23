import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import OpenAI from 'openai';
import {summarizeRepoForUpdates} from './repoSummarize.js';
import {createTenantContext} from '../security/tenantContext.js';
import {runtimeCredentialVault} from '../services/integrations/credentialVaultRuntime.js';
import {withRunAttempt,createRunDurable,captureAdmittedRunAttempt} from './runStore.js';
import {setProviderHealthStore} from './providerRuntime.js';

test('actual repository memo binds platform scope, worker, JSON payload and complexity accounting',async t=>{
  const env={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55438',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',GLM_API_KEY:'synthetic-platform'};
  const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  setProviderHealthStore({load:async()=>[],save:async()=>{}});t.after(()=>setProviderHealthStore(null));
  t.after(()=>{for(const k of Object.keys(env)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
  const owner=randomUUID(),foreign=randomUUID(),project=randomUUID(),runId=randomUUID();
  const context=createTenantContext({userId:owner,via:'remote_getuser'}),metadata={type:'user_api_key',vault_revision:randomUUID()};
  const token=await runtimeCredentialVault().seal(context,{tenant:owner,owner,provider:'zhipu',account:'apikey_zhipu',credentialType:'user_api_key',recordId:'apikey_zhipu',revision:metadata.vault_revision,scope:'user-provider-key'},'synthetic-current-user-key');
  const original={user_id:owner,provider:'apikey_zhipu',access_token:token,metadata,credential_revision:randomUUID()};
  let row=structuredClone(original),mode='ok',effects=0,projectReads=0;
  const requests:string[]=[];
  let run:Record<string,unknown>={};
  const reservations=new Map<string,Record<string,unknown>>(),settlements:Record<string,unknown>[]=[];
  let mutate:(()=>void)|undefined;
  const reset=(next='ok')=>{mode=next;row=structuredClone(original);projectReads=0;mutate=undefined;};
  t.mock.method(console,'warn',(...args:unknown[])=>{assert.deepEqual(args,['[repoSummarize] skipped: unavailable']);});
  const create=OpenAI.Chat.Completions.prototype.create;
  t.mock.method(OpenAI.Chat.Completions.prototype,'create',function(this:unknown,...args:any[]){
    // Change a real SDK request, not its result. The real SDK fetch hook must
    // reject this different wire body before the controlled provider sees it.
    if(mode==='mutatedWire')args[0]={...args[0],messages:[{role:'user',content:'foreign source'}]};
    return Reflect.apply(create,this,args);
  });
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):{};
    requests.push(url.pathname);
    if(url.origin==='https://open.bigmodel.cn'){
      effects++;assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-platform');
      assert.doesNotMatch(JSON.stringify(body),/foreign source|SYNTHETIC_CREDENTIAL/);
      assert.match(JSON.stringify(body),/original owned source/);assert.equal(body.max_tokens,700);
      if(mode==='providerFailure')return Response.json({error:{message:'SYNTHETIC_CREDENTIAL must not reach logs'}},{status:400});
      return Response.json({id:'synthetic-memo-receipt',choices:[{message:{content:'Owned repository memo'},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:4}});
    }
    assert.equal(url.origin,env.SUPABASE_URL,'No real external transport is allowed');
    if(url.pathname==='/rest/v1/model_provider_health')return Response.json(null);
    if(url.pathname==='/rest/v1/swarm_runs'){
      if(init?.method==='POST')return new Response(null,{status:201});
      assert.equal(url.searchParams.get('id'),'eq.'+runId);assert.equal(url.searchParams.get('user_id'),'eq.'+owner);return Response.json(run);
    }
    if(url.pathname==='/rest/v1/projects'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);projectReads++;
      if(mode==='revokeAtWire'&&projectReads===2)row.metadata={...row.metadata,revoked:true} as typeof row.metadata;
      return Response.json(mode==='foreignProject'||url.searchParams.get('id')!=='eq.'+project?null:{id:project,user_id:owner,github_repo_name:mode==='repoChanged'?'foreign/repo':null});
    }
    if(url.pathname==='/rest/v1/user_integrations'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('provider'),'eq.apikey_zhipu');
      return Response.json(mode==='foreignCredential'?{...row,user_id:foreign}:row);
    }
    if(url.pathname.endsWith('/reserve_xroga_provider_budget')){
      assert.equal(body.p_user_id,owner);assert.equal(body.p_purpose,'complexity');assert.equal(body.p_maximum_output_tokens,700);
      const r={id:randomUUID(),user_id:mode==='wrongReservation'?foreign:owner,status:'reserved',idempotency_key:body.p_idempotency_key,internal_route:body.p_internal_route,purpose:body.p_purpose,price_version:body.p_price_version,estimated_input_tokens:body.p_estimated_input_tokens,maximum_output_tokens:700,reserved_micro_usd:body.p_reservation_micro_usd};
      reservations.set(r.id,r);
      if(mode==='rotateAtBudget')row.credential_revision=randomUUID();
      if(mode==='repoAtBudget')mode='repoChanged';
      if(mode==='staleRun')run={...run,lease_generation:randomUUID()};
      mutate?.();return Response.json(r);
    }
    if(url.pathname.endsWith('/settle_xroga_provider_budget')){
      const r=reservations.get(body.p_reservation_id);assert.ok(r);assert.equal(body.p_user_id,owner);settlements.push(body);
      return Response.json({...r,status:'settled',settled_micro_usd:body.p_actual_micro_usd,provider_request_id:body.p_provider_request_id,actual_input_tokens:body.p_actual_input_tokens,cached_input_tokens:body.p_cached_input_tokens,output_tokens:body.p_output_tokens,reasoning_tokens:body.p_reasoning_tokens,tool_calls:body.p_tool_calls,search_calls:body.p_search_calls});
    }
    if(url.pathname.endsWith('/release_xroga_provider_budget')){assert.equal(body.p_pending_reconciliation,false);return Response.json(null);}
    assert.fail('Unexpected protocol request '+url.pathname);
  });
  const attempt=await withRunAttempt(async()=>{await createRunDurable(owner,'Synthetic memo',runId,project);return captureAdmittedRunAttempt(runId,owner);});
  const current={id:runId,user_id:owner,project_id:project,status:'running',worker_id:attempt.workerId,lease_generation:attempt.generation};
  const scope={context,userId:owner,projectId:project,runAttempt:attempt,connectedAccountId:'platform',repository:null};
  const options=()=>({userId:owner,dispatchScope:scope,prompt:'Describe repository',paths:['src/a.ts'],sampleFiles:[{path:'src/a.ts',content:'original owned source'}]});
  run={...current};const result=await summarizeRepoForUpdates(options());assert.ok(result,JSON.stringify(requests));assert.equal(result.summary,'Owned repository memo');assert.equal(result.inputTokens,8);assert.equal(result.outputTokens,4);assert.equal(effects,1);assert.equal(settlements.length,1);
  reset();const input=options();mutate=()=>{input.sampleFiles[0].content='foreign source';input.dispatchScope={...scope,connectedAccountId:'foreign-account'};};
  await summarizeRepoForUpdates(input);assert.equal(effects,2,'Caller mutation during reservation cannot replace captured data or account');
  for(const failing of ['foreignProject','repoChanged','repoAtBudget','staleRun','mutatedWire']){
    reset(failing);run={...current};const before:number=effects;await assert.rejects(summarizeRepoForUpdates(options()));assert.equal(effects,before,failing);
  }
  // This model uses the existing platform Zhipu account. Zhipu BYOK is not in
  // the canonical admitted credential-provider list. Never invent it for tests.
  // Revoking or rotating an unselected user row must not retarget the request.
  for(const change of [{metadata:{...metadata,revoked:true}},{credential_revision:randomUUID()}]){
    reset();run={...current};row={...row,...change};await summarizeRepoForUpdates(options());
  }
  assert.equal(effects,4);
  for(const dispatchScope of [{...scope,userId:foreign},{...scope,context:createTenantContext({userId:foreign,via:'remote_getuser'})},{...scope,connectedAccountId:'foreign-account'},{...scope,runAttempt:{...attempt}},{...scope,projectId:randomUUID()}]){
    reset();run={...current};await assert.rejects(summarizeRepoForUpdates({...options(),dispatchScope}));assert.equal(effects,4);
  }
  reset('wrongReservation');run={...current};assert.equal(await summarizeRepoForUpdates(options()),null);assert.equal(effects,4);
  reset('providerFailure');run={...current};assert.equal(await summarizeRepoForUpdates(options()),null);assert.equal(effects,5,'Availability failure preserves optional memo behavior without unsafe logging');
});
