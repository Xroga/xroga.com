import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('experiment outcome requires an exact transaction receipt and preserves typed denials',async()=>{
  let patch:Record<string,unknown>={},errorCode:string|null=null,calls=0;
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},async maybeSingle(){
      const data=table==='projects'?{id:'project',user_id:'owner'}:table==='profiles'?{role:'member'}
        :table==='growth_experiments'?{project_id:'project',tenant_id:'owner'}
        :table==='growth_experiment_assignments'?{id:'assignment',exposed_at:'2026-01-01'}:{id:'event'};
      return {data,error:null};
    }};return q;
  },async rpc(name:string,args:Record<string,unknown>){
    calls++;assert.equal(name,'record_growth_experiment_outcome');
    assert.deepEqual(args,{p_actor:'owner',p_tenant:'owner',p_project:'project',p_experiment:'experiment',p_assignment:'assignment',p_event:'event',p_metric:'metric'});
    return {data:[{id:'outcome',experiment_id:'experiment',assignment_id:'assignment',event_id:'event',metric_key:'metric',...patch}],error:errorCode?{code:errorCode}:null};
  }};
  const service=new GrowthService(db as unknown as SupabaseClient);
  const record=()=>service.recordExperimentOutcome('owner',{experimentId:'experiment',assignmentId:'assignment',eventId:'event',metricKey:'metric'});
  assert.equal((await record()).id,'outcome');assert.equal(calls,1);
  for(patch of [{id:null},{experiment_id:'other'},{assignment_id:'other'},{event_id:'other'},{metric_key:'other'}])await assert.rejects(record(),{code:'storage_unavailable',statusCode:503});
  patch={};
  for(const [code,expected,status]of [['P0002','not_found',404],['42501','forbidden',403],['P0001','invalid_state',409],['40001','conflict',409],['22023','invalid_request',400],['08006','storage_unavailable',503]] as const){
    errorCode=code;await assert.rejects(record(),{code:expected,statusCode:status});
  }
});
