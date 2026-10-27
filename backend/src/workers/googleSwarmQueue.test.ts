import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../security/tenantContext.js';
import {enqueueGoogleSwarm} from './googleSwarmQueue.js';
import type {SwarmRunRecord} from '../ai/runStore.js';

test('HTTP relay uses fresh owner-bound reads and requires the actual fenced result, including false',async()=>{
  const context=createTenantContext({userId:randomUUID(),via:'persisted_owner'}),runId=randomUUID();let reads=0,resultReads=0;
  const record:SwarmRunRecord={id:runId,userId:context.userId,prompt:'synthetic',status:'complete',output:{type:'chat',text:'synthetic'},
    events:[],lastSequence:0,iteration_count:1,created_at:new Date().toISOString(),completed_at:new Date().toISOString()};
  const app=express();app.post('/execute',async(req,res)=>{
    await enqueueGoogleSwarm(req,res,context,runId,{prompt:'synthetic'},true,{pollMs:1,quota:async()=>{},
      store:{enqueue:async()=>randomUUID(),loadResult:async()=>{resultReads++;return resultReads===1?null:{success:false,followUps:['synthetic next action']};}},
      transport:{enqueue:async()=>({taskName:'fixture',duplicate:false})},read:async(id,owner,fresh)=>{reads++;assert.equal(id,runId);assert.equal(owner,context.userId);assert.equal(fresh,true);return record;}});
  });
  const server=createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as {port:number}).port;
  try{
    const response=await fetch(`http://127.0.0.1:${port}/execute`,{method:'POST'});const body=await response.text();
    assert.equal(response.status,200);assert.equal(reads,2);assert.equal(resultReads,2);
    assert.equal((body.match(/event: complete/g)??[]).length,1);assert.ok(body.includes('"success":false'));assert.ok(!body.includes('"success":true'));
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('closing the HTTP observer stops polling without cancelling or repeating the durable Job',async()=>{
  const context=createTenantContext({userId:randomUUID(),via:'persisted_owner'}),runId=randomUUID();let dispatches=0,reads=0;
  const record:SwarmRunRecord={id:runId,userId:context.userId,prompt:'synthetic',status:'running',output:null,events:[],lastSequence:0,
    iteration_count:0,created_at:new Date().toISOString(),completed_at:null};
  const app=express();app.post('/execute',async(req,res)=>{await enqueueGoogleSwarm(req,res,context,runId,{prompt:'synthetic'},true,{pollMs:5,quota:async()=>{},
    store:{enqueue:async()=>randomUUID(),loadResult:async()=>null},transport:{enqueue:async()=>{dispatches++;return{taskName:'fixture',duplicate:false};}},
    read:async()=>{reads++;return record;}});});
  const server=createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');const port=(server.address() as {port:number}).port;
  const controller=new AbortController();
  try{
    const response=await fetch(`http://127.0.0.1:${port}/execute`,{method:'POST',signal:controller.signal});const reader=response.body!.getReader();
    await reader.read();controller.abort();await reader.cancel().catch(()=>{});await new Promise(resolve=>setTimeout(resolve,30));
    const stoppedReads=reads;await new Promise(resolve=>setTimeout(resolve,25));assert.equal(reads,stoppedReads);
    assert.equal(dispatches,1);assert.equal(record.status,'running');
  }finally{controller.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('quota or fabricated actor denial prevents durable enqueue and all external dispatch',async()=>{
  const context=createTenantContext({userId:randomUUID(),via:'persisted_owner'});let writes=0,dispatches=0,quotaReads=0;
  const dependencies={quota:async()=>{quotaReads++;throw new Error('SYNTHETIC_QUOTA_DENIED');},
    store:{enqueue:async()=>{writes++;return randomUUID();},loadResult:async()=>null},
    transport:{enqueue:async()=>{dispatches++;return{taskName:'fixture',duplicate:false};}},read:async()=>null};
  await assert.rejects(enqueueGoogleSwarm({} as any,{} as any,context,randomUUID(),{prompt:'synthetic'},false,dependencies),/SYNTHETIC_QUOTA_DENIED/);
  await assert.rejects(enqueueGoogleSwarm({} as any,{} as any,{...context},randomUUID(),{prompt:'synthetic'},false,dependencies));
  assert.equal(quotaReads,1);assert.equal(writes,0);assert.equal(dispatches,0);
});
