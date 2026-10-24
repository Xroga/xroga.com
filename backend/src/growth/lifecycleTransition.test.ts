import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('managed lifecycle transitions require an exact owned versioned receipt and canonical manage roles',async()=>{
  let patch:Record<string,unknown>={},error:string|null=null,shape='one';
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},async maybeSingle(){
      if(table==='projects')return {data:{id:'project',user_id:'owner'},error:null};
      assert.equal(table,'profiles');return {data:{role:'member'},error:null};
    }};return q;
  },async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'transition_growth_lifecycle');assert.deepEqual(args,{p_actor:'owner',p_tenant:'owner',p_project:'project',p_subject_type:'user',p_subject:'subject',
      p_state:'retained',p_evidence:'proof',p_allowed_roles:['operator','release_manager','recovery_manager','admin']});
    const row={id:'lifecycle',tenant_id:'owner',project_id:'project',subject_type:'user',subject_id:'subject',lifecycle_state:'retained',evidence_reference:'proof',
      version:2,transitioned_at:new Date().toISOString(),...patch};
    return {data:shape==='empty'?[]:shape==='duplicate'?[row,row]:[row],error:error?{code:error}:null};
  }};
  const service=new GrowthService(db as unknown as SupabaseClient),transition=()=>service.transitionLifecycle('owner',{
    projectId:'project',subjectType:'user',subjectId:'subject',state:'retained',evidenceReference:'proof'});
  assert.equal((await transition()).version,2);
  for(patch of [{id:null},{tenant_id:'foreign'},{project_id:'foreign'},{subject_type:'product'},{subject_id:'foreign'},{lifecycle_state:'activated'},
    {evidence_reference:'changed'},{version:0},{version:'2'},{version:1.5},{transitioned_at:null},{transitioned_at:'invalid'}])await assert.rejects(transition(),{code:'storage_unavailable',statusCode:503});
  patch={};for(shape of ['empty','duplicate'])await assert.rejects(transition(),{code:'storage_unavailable'});shape='one';
  for(const[code,expected,statusCode]of [['42501','forbidden',403],['40001','conflict',409],['22023','invalid_lifecycle',400],['08006','storage_unavailable',503]] as const){
    error=code;await assert.rejects(transition(),{code:expected,statusCode});
  }
});
