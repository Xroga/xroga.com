import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

test('missing authorized target is denied before any action or audit insert',async()=>{
  for(const targetType of ['job','webhook','service','release','deployment']){
    const reads:string[]=[];
    const db={from(table:string){
      reads.push(table);
      const query={select(){return query;},eq(){return query;},async maybeSingle(){
        if(table==='projects')return {data:{id:'project',user_id:'actor'},error:null};
        if(table==='profiles')return {data:{role:targetType==='release'?'admin':'member'},error:null};
        return {data:null,error:null};
      },then(resolve:(value:unknown)=>unknown){return Promise.resolve(resolve({data:[],error:null}));},
      insert(){throw new Error('Missing target must never produce an action or audit write');}};
      return query;
    }};
    const service=new OperationsService(db as unknown as SupabaseClient);
    const actionTypes: Record<string,string> = {job:'retry_job',webhook:'retry_webhook',service:'refresh_health',release:'promote_release',deployment:'prepare_repair'};
    const actionType = actionTypes[targetType];
    await assert.rejects(service.createAction('actor',{projectId:'project',actionType,targetType,targetId:'outside-project',targetVersion:0,idempotencyKey:'fixture',confirmed:true}),{code:'forbidden',statusCode:403});
    assert.ok(!reads.includes('operations_actions'));assert.ok(!reads.includes('production_audit_log'));
    if (targetType==='release') assert.ok(reads.includes('production_releases'));
    if (targetType==='deployment') assert.ok(reads.includes('deployment_status'));
  }
});

test('missing action yields not found without querying an undefined project',async()=>{
  const db={from(table:string){assert.equal(table,'operations_actions');const query={select(){return query;},eq(){return query;},async maybeSingle(){return {data:null,error:null};}};return query;}};
  const service=new OperationsService(db as unknown as SupabaseClient);
  await assert.rejects(service.confirmAction('actor','missing'),{statusCode:404});
  await assert.rejects(service.approveAction('actor','missing','approved','fixture'),{statusCode:404});
  await assert.rejects(service.executeAction('actor','missing'),{statusCode:404});
});

test('release target lookup validates the returned owner project and resource identity', async () => {
  let receipt: Record<string,unknown> | null = null;
  const db = { from(table: string) {
    assert.equal(table, 'production_releases'); const filters: Record<string,unknown> = {};
    const q = { select() { return q; }, eq(key: string,value: unknown) { filters[key] = value; return q; },
      async maybeSingle() { assert.deepEqual(filters, { id: 'release', project_id: 'project', user_id: 'owner' }); return { data: receipt, error: null }; } };
    return q;
  } };
  const service = new OperationsService(db as unknown as SupabaseClient) as unknown as {
    currentTargetVersion(action: Record<string,unknown>): Promise<number | null>;
  };
  const action = { target_type: 'release', target_id: 'release', project_id: 'project', user_id: 'owner' };
  for (receipt of [null, { id: 'other', user_id: 'owner', project_id: 'project' },
    { id: 'release', user_id: 'foreign', project_id: 'project' }, { id: 'release', user_id: 'owner', project_id: 'foreign' }]) {
    await assert.rejects(service.currentTargetVersion(action), { code: 'forbidden', statusCode: 403 });
  }
  receipt = { id: 'release', user_id: 'owner', project_id: 'project' };
  assert.equal(await service.currentTargetVersion(action), 1);
});

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
    const action={action_type:capability,user_id:'owner',project_id:'allowed-project',target_id:'foreign-project-target',target_version:2,status:'running',lease_owner:'api:actor',lease_expires_at:new Date(Date.now()+60_000).toISOString()};
    let calls=0;
    const db={async rpc(name:string,args:Record<string,unknown>){calls++;assert.equal(name,'mutate_operations_internal_target');assert.equal(args.p_capability,capability);assert.equal(args.p_actor,'actor');assert.deepEqual(args.p_expected,action);assert.deepEqual(args.p_allowed_roles,['operator','release_manager','recovery_manager','admin']);assert.equal(args.p_confirmation_required,true);assert.equal(args.p_approval_role,null);return {data:{rows:[],completion:null},error:null};},from(){assert.fail('An internal effect must never fall back to a preflight-only raw update');}};
    const service=new OperationsService(db as unknown as SupabaseClient);
    // Isolated unit inspection of the existing private adapter boundary; no production bypass.
    const adapter=service as unknown as {executeInternal(capability:string,input:Record<string,unknown>):Promise<{status:string}>};
    const result=await adapter.executeInternal(capability,{userId:'owner',actorId:'actor',projectId:'allowed-project',targetId:'foreign-project-target',targetVersion:2,admittedAction:action});
    assert.equal(result.status,'blocked');
    assert.equal(calls,1);
  }
});
