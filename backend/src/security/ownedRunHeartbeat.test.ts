import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantContext, type TenantContext } from './tenantContext.js';
import { heartbeatOwnedRunAttempt } from './ownedRunPersistence.js';
import { randomUUID } from 'node:crypto';
import { createRunDurable } from '../ai/runStore.js';

test('worker heartbeat accepts only the exact current generation receipt and sanitizes outages',async()=>{
  const owner='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId:owner,via:'persisted_owner'});
  const row={id:'run',user_id:owner,worker_id:'worker',lease_generation:'generation',status:'running',heartbeat_at:new Date().toISOString()};
  let data:unknown=[row],error:unknown=null,calls=0;
  const client={async rpc(name:string,args:Record<string,unknown>){
    calls++;assert.equal(name,'heartbeat_swarm_run_attempt');assert.deepEqual(args,{p_run_id:'run',p_owner_id:owner,p_worker_id:'worker',p_generation:'generation'});return {data,error};
  }} as unknown as SupabaseClient;
  await heartbeatOwnedRunAttempt(client,context,'run','worker','generation');
  for(data of [null,{},[row,row],[null],...[{id:'foreign'},{user_id:'foreign'},{worker_id:'foreign'},{lease_generation:'foreign'},{status:'complete'},{heartbeat_at:null},{heartbeat_at:'invalid'}].map(patch=>[{...row,...patch}])]){
    await assert.rejects(heartbeatOwnedRunAttempt(client,context,'run','worker','generation'),{code:'RESOURCE_ACCESS_UNAVAILABLE',status:503});
  }
  data=[];await assert.rejects(heartbeatOwnedRunAttempt(client,context,'run','worker','generation'),{code:'RUN_STATE_CONFLICT'});
  data=[row];error={code:'08006',message:'private diagnostic'};
  await assert.rejects(heartbeatOwnedRunAttempt(client,context,'run','worker','generation'),{code:'RESOURCE_ACCESS_UNAVAILABLE',message:'Unable to check access right now. Retry shortly.'});
  const before=calls;await assert.rejects(heartbeatOwnedRunAttempt(client,{...context} as TenantContext,'run','worker','generation'),{status:401});assert.equal(calls,before);
});

test('the original run timer binds its heartbeat generation and handles rejected storage without private diagnostics',async t=>{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='http://127.0.0.1:49241';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-heartbeat-only';
  t.after(()=>{
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  });
  t.mock.timers.enable({apis:['setInterval']});
  const owner=randomUUID(),run=randomUUID();let stored:Record<string,any>|null=null,mode='valid',beats=0;const warnings:unknown[][]=[];
  t.mock.method(console,'warn',(...args:unknown[])=>{warnings.push(args);});
  t.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
    const url=new URL(String(input));assert.equal(url.origin,'http://127.0.0.1:49241');assert.equal(init?.method,'POST');
    const body=JSON.parse(String(init?.body));
    if(url.pathname==='/rest/v1/swarm_runs'){stored=body;return new Response(null,{status:201});}
    assert.equal(url.pathname,'/rest/v1/rpc/heartbeat_swarm_run_attempt');beats++;
    assert.deepEqual(body,{p_run_id:run,p_owner_id:owner,p_worker_id:stored!.worker_id,p_generation:stored!.lease_generation});
    if(mode==='outage')return Response.json({code:'XX000',message:'PRIVATE_DATABASE_DIAGNOSTIC'},{status:400});
    if(mode==='throw')throw new Error('PRIVATE_THROWN_DIAGNOSTIC');
    return Response.json(mode==='empty'?[]:[{id:run,user_id:owner,worker_id:stored!.worker_id,lease_generation:stored!.lease_generation,status:'running',heartbeat_at:new Date().toISOString()}]);
  });
  await createRunDurable(owner,'Synthetic timer fixture',run);
  for(mode of ['valid','empty','outage','throw']){
    t.mock.timers.tick(30_000);for(let i=0;i<4;i++)await new Promise<void>(resolve=>setImmediate(resolve));
  }
  assert.equal(beats,4);assert.equal(warnings.length,3);
  assert.equal(JSON.stringify(warnings).includes('PRIVATE_'),false);
  assert.ok(warnings.every(args=>args.length===1&&args[0]==='[runStore] heartbeat was not acknowledged'));
});
