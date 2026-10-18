import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('activation definition binds current authority and exact returned fields with no independent upsert',async()=>{
  let patch:Record<string,unknown>={},error:string|null=null,shape='one',calls=0;
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},async maybeSingle(){
      if(table==='projects')return {data:{id:'project',user_id:'owner'},error:null};
      assert.equal(table,'profiles');return {data:{role:'member'},error:null};
    }};return q;
  },async rpc(name:string,args:Record<string,any>){
    calls++;assert.equal(name,'define_growth_activation');
    assert.deepEqual(args,{p_actor:'owner',p_tenant:'owner',p_project:'project',p_name:'Activation',p_version:1,p_events:['identity.linked.v1'],
      p_allowed_roles:['operator','release_manager','recovery_manager','admin']});
    const row={id:'definition',tenant_id:'owner',project_id:'project',name:args.p_name,version:1,required_event_names:args.p_events,minimum_distinct_events:1,active:true,...patch};
    return {data:shape==='empty'?[]:shape==='duplicate'?[row,row]:[row],error:error?{code:error}:null};
  }};
  const service=new GrowthService(db as unknown as SupabaseClient),input={projectId:'project',name:'Activation',version:1,requiredEvents:['identity.linked.v1']};
  assert.equal((await service.defineActivation('owner',input)).id,'definition');
  for(patch of [{id:null},{tenant_id:'foreign'},{project_id:'foreign'},{name:'changed'},{version:2},{required_event_names:['changed']},{minimum_distinct_events:2},{active:false}]){
    await assert.rejects(service.defineActivation('owner',input),{code:'storage_unavailable',statusCode:503});
  }
  patch={};for(shape of ['empty','duplicate'])await assert.rejects(service.defineActivation('owner',input),{code:'storage_unavailable'});shape='one';
  for(const[code,expected,statusCode]of [['42501','forbidden',403],['40001','conflict',409],['22023','invalid_activation',400],['22003','invalid_activation',400],['08006','storage_unavailable',503]] as const){
    error=code;await assert.rejects(service.defineActivation('owner',input),{code:expected,statusCode});
  }
  const before=calls;
  for(const requiredEvents of [[],['onboarding.started.v1'],['unregistered.event.v1']])await assert.rejects(service.defineActivation('owner',{...input,requiredEvents}),{code:'invalid_activation'});
  assert.equal(calls,before);
});
