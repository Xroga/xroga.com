import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

test('misbound operations actions cannot be confirmed approved or returned as verified',async()=>{
  for(const method of ['confirmAction','approveAction','executeAction'] as const){
    const reads:string[]=[];
    const db={from(table:string){
      reads.push(table);
      const query={select(){return query;},eq(){return query;},async maybeSingle(){
        if(table==='operations_actions')return {data:{id:'action',project_id:'project',user_id:'foreign-owner',requested_by:'actor',status:'verified',action_type:'retry_job'},error:null};
        if(table==='projects')return {data:{id:'project',user_id:'actor'},error:null};
        if(table==='profiles')return {data:{role:'member'},error:null};
        throw new Error('Unexpected downstream query');
      }};return query;
    }};
    const service=new OperationsService(db as unknown as SupabaseClient);
    const operation=method==='approveAction'?service.approveAction('actor','action','approved','fixture'):service[method]('actor','action');
    await assert.rejects(operation,{code:'forbidden',statusCode:403});
    assert.deepEqual(reads,['operations_actions','projects','profiles']);
  }
});

test('injected-client retry mutations bind owner project and optimistic target version',async()=>{
  for(const capability of ['retry_job','retry_webhook']){
    const filters:Array<[string,unknown]>=[];
    const db={from(){const query={update(){return query;},eq(key:string,value:unknown){filters.push([key,value]);return query;},lt(){return query;},async select(){return {data:[],error:null};}};return query;}};
    const service=new OperationsService(db as unknown as SupabaseClient);
    // Isolated unit inspection of the existing private adapter boundary; no production bypass.
    const adapter=service as unknown as {executeInternal(capability:string,input:Record<string,unknown>):Promise<{status:string}>};
    const result=await adapter.executeInternal(capability,{userId:'owner',projectId:'allowed-project',targetId:'foreign-project-target',targetVersion:2});
    assert.equal(result.status,'blocked');
    assert.ok(filters.some(([key,value])=>key==='project_id'&&value==='allowed-project'));
    assert.ok(filters.some(([key,value])=>key==='user_id'&&value==='owner'));
    assert.ok(filters.some(([key,value])=>key==='attempt_count'&&value===2));
  }
});
