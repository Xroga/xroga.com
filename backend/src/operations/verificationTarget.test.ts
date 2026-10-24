import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';
import { httpVerificationAdapter, type ProviderAdapterRegistry } from './providerAdapters.js';

test('HTTP verification rechecks the admitted target receipt after claim before any adapter call',async()=>{
  const action={id:'action',user_id:'owner',project_id:'project',environment_id:null,requested_by:'owner',action_type:'refresh_health',
    target_type:'service',target_id:'resource',target_version:1,status:'queued',attempt_count:0,max_attempts:2,execution_plan:{},
    idempotency_key:'key',action_plan_digest:'digest',confirmation_digest:null,permission_required:'view_health',risk_level:'read_only'};
  const running={...action,status:'running',attempt_count:1,lease_owner:'api:owner',lease_expires_at:new Date(Date.now()+60_000).toISOString()};
  const resource={id:'resource',user_id:'owner',project_id:'project',version:1,observed_state:{url:'https://fixture.invalid'}};
  let patch:Record<string,unknown>={},reads=0,effects=0,completion:Record<string,any>|null=null;
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},async maybeSingle(){
      if(table==='operations_actions')return {data:action,error:null};
      if(table==='projects')return {data:{id:'project',user_id:'owner'},error:null};
      if(table==='profiles')return {data:{role:'member'},error:null};
      assert.equal(table,'operations_resources');return {data:reads++===0?{version:1}:{...resource,...patch},error:null};
    }};return q;
  },async rpc(name:string,args:Record<string,any>){
    if(name==='claim_operations_action_admitted')return {data:[running],error:null};
    assert.equal(name,'complete_operations_action');completion=args;
    return {data:[{...running,status:args.p_result.status,evidence_reference:args.p_evidence_id,lease_owner:null,lease_expires_at:null}],error:null};
  }};
  const service=new OperationsService(db as unknown as SupabaseClient);
  (service as unknown as {registry:ProviderAdapterRegistry}).registry.register({...httpVerificationAdapter,async execute(_capability,input){
    effects++;assert.equal(input.url,resource.observed_state.url);return {status:'verified',safeSummary:'Synthetic adapter, no HTTP request'};
  }});
  for(patch of [{id:'foreign'},{user_id:'foreign'},{project_id:'foreign'},{version:2},{version:null},{version:'1'},{version:1.5}]){
    reads=0;assert.equal((await service.executeAction('owner','action')).status,'blocked');
    assert.equal(effects,0);assert.equal(completion!.p_result.errorCategory,'invalid_state');
  }
  patch={};reads=0;assert.equal((await service.executeAction('owner','action')).status,'verified');assert.equal(effects,1);
});
