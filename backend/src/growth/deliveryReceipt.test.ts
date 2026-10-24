import assert from 'node:assert/strict';import{test}from'node:test';import type{SupabaseClient}from'@supabase/supabase-js';import{GrowthService}from'./growthService.js';
test('in-app processing accepts only bound completed receipts and never calls a provider',async()=>{
 let rpcCalls=0;let response:Record<string,unknown>={campaign_id:'campaign',tenant_id:'actor',project_id:'project',status:'completed',version:3,queued:1,suppressed:2,duplicate:0,replayed:false};
 const valid={...response};let channel='in_app';
 const db={from(table:string){const q={select(){return q;},eq(){return q;},async maybeSingle(){return{error:null,data:table==='projects'?{id:'project',user_id:'actor'}:table==='profiles'?{role:'member'}:table==='growth_segments'?{definition:{lifecycleStates:['activated']}}:{id:'campaign',tenant_id:'actor',project_id:'project',segment_id:'segment',status:'running',channel,version:2}};}};return q;},rpc:async(name:string,args:unknown)=>{rpcCalls++;assert.equal(name,'process_growth_in_app_campaign');assert.deepEqual(args,{p_actor:'actor',p_campaign:'campaign'});return{data:response,error:null};}};
 const service=new GrowthService(db as unknown as SupabaseClient);
 assert.deepEqual(await service.processCampaign('actor','campaign'),{queued:1,suppressed:2,duplicate:0});
 for(const patch of [{tenant_id:'foreign'},{project_id:'foreign'},{campaign_id:'foreign'},{status:'running'},{version:4},{queued:-1},{suppressed:1.5},{duplicate:Infinity},{replayed:'false'},{queued:501}]){
   response={...valid,...patch};await assert.rejects(service.processCampaign('actor','campaign'),{statusCode:503});
 }
 channel='email';const before=rpcCalls;await assert.rejects(service.processCampaign('actor','campaign'),{code:'external_setup_required',statusCode:409});assert.equal(rpcCalls,before);
});
