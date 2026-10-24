import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('activation evaluation requires an exact owned lifecycle and source-basis receipt',async()=>{
  const row={id:'lifecycle',tenant_id:'owner',project_id:'project',subject_type:'user',subject_id:'subject',lifecycle_state:'activated',
    activation_definition_id:'definition',evidence_reference:'activation:definition:deployment',version:1,transitioned_at:new Date().toISOString()};
  let data:any={activated:true,lifecycle:row,reason:'evidence_verified',basis:{definitionId:'definition',deploymentId:'deployment'}},error:string|null=null;
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},async maybeSingle(){
      if(table==='projects')return {data:{id:'project',user_id:'owner'},error:null};
      assert.equal(table,'profiles');return {data:{role:'member'},error:null};
    }};return q;
  },async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'evaluate_growth_activation');assert.deepEqual(args,{p_actor:'owner',p_tenant:'owner',p_project:'project',p_subject:'subject',
      p_allowed_roles:['viewer','operator','release_manager','recovery_manager','admin']});return {data,error:error?{code:error}:null};
  }};
  const service=new GrowthService(db as unknown as SupabaseClient),evaluate=()=>service.evaluateActivation('owner','project','subject');
  assert.deepEqual(await evaluate(),{activated:true,lifecycle:row,reason:'evidence_verified'});
  const valid=data;
  for(const patch of [{id:''},{tenant_id:'foreign'},{project_id:'foreign'},{subject_id:'foreign'},{subject_type:'product'},{lifecycle_state:'retained'},
    {activation_definition_id:'foreign'},{evidence_reference:'other'},{version:0},{version:'1'},{transitioned_at:null},{transitioned_at:'invalid'}]){
    data={...valid,lifecycle:{...row,...patch}};await assert.rejects(evaluate(),{code:'storage_unavailable',statusCode:503});
  }
  for(data of [null,[],{}, {...valid,activated:'true'},{...valid,basis:null},{...valid,basis:{definitionId:'definition',deploymentId:''}},{...valid,lifecycle:null},{...valid,reason:'not_configured'}]){
    await assert.rejects(evaluate(),{code:'storage_unavailable'});
  }
  for(const reason of ['not_configured','deployment_unverified','required_events_missing']){
    data={activated:false,lifecycle:null,reason};assert.deepEqual(await evaluate(),data);
  }
  for(data of [{activated:false,lifecycle:row,reason:'not_configured'},{activated:false,lifecycle:null,reason:'evidence_verified'}])await assert.rejects(evaluate(),{code:'storage_unavailable'});
  data=valid;
  for(const[code,expected,statusCode]of [['42501','forbidden',403],['40001','conflict',409],['22023','invalid_activation',400],['08006','storage_unavailable',503]] as const){
    error=code;await assert.rejects(evaluate(),{code:expected,statusCode});
  }
});
