import test from 'node:test';import assert from 'node:assert/strict';
import {runSmoke,SOURCE,PROJECT,OWNER_SHA256,MODEL,REQUEST,messages} from './smoke.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const env={XROGA_RELEASE_SHA:SOURCE,XROGA_ZURELAY_PROBE_APPROVAL:SOURCE,CLOUD_RUN_JOB:'xroga-zurelay-probe-1103',NODE_ENV:'production',CLOUD_RUN_EXECUTION:'synthetic-execution',XROGA_ZURELAY_PROBE_EXPIRES_AT:new Date(Date.now()+25*60_000).toISOString()};
function fixture(changes={}){
 let calls=0,reservations=0;
 const result={modelId:MODEL,apiModel:'deepseek-v4.1-flash-1017',provider:'zurelay',text:'{"total":1000}',finishReason:'stop',providerRequestId:'synthetic-receipt',inputTokens:30,outputTokens:8};
 return {get calls(){return calls;},get reservations(){return reservations;},runtime:{priceVersion:'zurelay-2026-11-03-v2',
 readSyntheticProject:async(id)=>{assert.equal(id,PROJECT);return{id,user_id:owner,github_repo_name:null};},ownerHash:uid=>uid===owner?OWNER_SHA256:'foreign-fixture',
 persistedOwnerContext:userId=>({fixtureContext:true,userId}),estimate:()=>1000,
 reserve:async input=>{reservations++;assert.equal(input.idempotencyKey,REQUEST);assert.equal(input.scope.connectedAccountId,'platform');assert.equal(input.maximumOutputTokens,128);assert.deepEqual(input.payload.messages,messages);const r=await input.execute({payload:input.payload,beforeDispatch:async()=>{}});input.validateResponse(r);return r;},
 complete:async(id,msg,options)=>{calls++;assert.equal(id,MODEL);assert.equal(options.json,true);assert.equal(options.reasoningMode,'none');return result;},actualCost:()=>2,...changes}};
}
test('one operator-only canonical reservation and one default JSON request, with no content in the receipt',async()=>{
 const f=fixture(),r=await runSmoke(f.runtime,env);assert.equal(f.calls,1);assert.equal(f.reservations,1);assert.equal(r.catalogCostMicroUsd,2);assert.equal(r.streamingTested,false);assert.equal(r.founderUiOrMfaAcceptance,false);assert.equal('text' in r,false);
});
test('wrong source, job, approval, owner or price version cannot dispatch',async()=>{
 for(const changed of [{XROGA_RELEASE_SHA:'old'},{XROGA_ZURELAY_PROBE_APPROVAL:''},{CLOUD_RUN_JOB:'xroga-canonical-production'},{NODE_ENV:'test'},{CLOUD_RUN_EXECUTION:''},{XROGA_ZURELAY_PROBE_EXPIRES_AT:'2020-01-01T00:00:00Z'},{XROGA_ZURELAY_PROBE_EXPIRES_AT:''}]){
  const f=fixture();await assert.rejects(runSmoke(f.runtime,{...env,...changed}));assert.equal(f.calls,0);assert.equal(f.reservations,0);
 }
 const f=fixture({priceVersion:'historical'});await assert.rejects(runSmoke(f.runtime,env));assert.equal(f.calls,0);
});
test('foreign project, repository attachment and oversized reservation fail before purchasing a request',async()=>{
 for(const changed of [{readSyntheticProject:async()=>({id:PROJECT,user_id:'foreign',github_repo_name:null})},{readSyntheticProject:async()=>({id:PROJECT,user_id:owner,github_repo_name:'owner/repo'})},{estimate:()=>1001}]){
  const f=fixture(changed);await assert.rejects(runSmoke(f.runtime,env));assert.equal(f.calls,0);assert.equal(f.reservations,0);
 }
});
test('failure, wrong model, invalid answer or missing trace has no retry or second reservation',async()=>{
 for(const complete of [async()=>{throw Error('uncertain fixture');},async()=>({modelId:'retired'}),async()=>({modelId:MODEL,apiModel:'deepseek-v4.1-flash-1017',provider:'zurelay',finishReason:'stop',text:'{"total":999}'}),async()=>({modelId:MODEL,apiModel:'deepseek-v4.1-flash-1017',provider:'zurelay',finishReason:'stop',text:'{"total":1000}'})]){
  let calls=0;const f=fixture({complete:async(...args)=>{calls++;return complete(...args);}});await assert.rejects(runSmoke(f.runtime,env));assert.equal(calls,1);assert.equal(f.reservations,1);
 }
 const f=fixture({actualCost:()=>1001});await assert.rejects(runSmoke(f.runtime,env));assert.equal(f.calls,1);
});
