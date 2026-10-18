import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

test('single-rule controls reject empty, substituted and duplicate mutation receipts', async () => {
  let rows: Record<string,unknown>[]=[];
  const filters:Record<string,unknown>={};
  const db={from(table:string){
    assert.equal(table,'operations_automation_rules');
    const q={update(){return q;},eq(key:string,value:unknown){filters[key]=value;return q;},
      async select(){return {data:rows,error:null};}};return q;
  }};
  const service=new OperationsService(db as unknown as SupabaseClient) as unknown as {
    executeInternal(capability:string,input:Record<string,unknown>):Promise<{status:string}>;
  };
  for(const capability of ['emergency_stop','resume_automation']){
    for(rows of [[],[{id:'other'}],[{id:'rule'},{id:'rule'}]]){
      assert.equal((await service.executeInternal(capability,{userId:'owner',projectId:'project',targetId:'rule',targetVersion:5})).status,'blocked');
      assert.deepEqual(filters,{user_id:'owner',project_id:'project',id:'rule',version:5});
    }
    rows=[{id:'rule'}];assert.equal((await service.executeInternal(capability,{userId:'owner',projectId:'project',targetId:'rule',targetVersion:5})).status,'verified');
  }
});

test('stale target preflight never overwrites a concurrently completed action or its approval',async()=>{
  const original={id:'action',user_id:'owner',project_id:'project',requested_by:'owner',action_type:'emergency_stop',
    target_type:'automation',target_id:'rule',target_version:1,status:'queued',confirmation_digest:'digest',action_plan_digest:'digest'};
  let storedStatus='queued';
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},async maybeSingle(){
      if(table==='operations_actions')return {data:{...original},error:null};
      if(table==='projects')return {data:{id:'project',user_id:'owner'},error:null};
      if(table==='profiles')return {data:{role:'member'},error:null};
      assert.equal(table,'operations_automation_rules');
      storedStatus='verified';return {data:{version:2},error:null};
    },update(){assert.fail('failed preflight must never mutate action or approval');}};return q;
  },rpc(){assert.fail('stale target cannot reach a claim or completion');}};
  await assert.rejects(new OperationsService(db as unknown as SupabaseClient).executeAction('owner','action'),{code:'invalid_state',statusCode:409});
  assert.equal(storedStatus,'verified');
});
