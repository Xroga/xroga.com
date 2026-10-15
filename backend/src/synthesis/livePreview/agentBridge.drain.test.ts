import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {createRunDurable,withRunAttempt} from '../../ai/runStore.js';
import {createAgentLivePreviewBridge} from './agentBridge.js';
import type {SoftwareAgentCheckpointStore} from '../../ai/softwareAgent/softwareAgentCheckpoint.js';
import type {SoftwareRunEvent} from '../../ai/softwareAgent/runEvents.js';

async function fixture(store:SoftwareAgentCheckpointStore){
  const prior=[process.env.SUPABASE_SERVICE_ROLE_KEY,process.env.NODE_ENV];
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.NODE_ENV='test';
  try{return await withRunAttempt(async()=>{
    const userId=randomUUID(),runId=randomUUID();await createRunDurable(userId,'Synthetic preview drain',runId);
    const emitted:SoftwareRunEvent[]=[];
    // All test loads stop before project/provider access, these inputs must stay unused.
    const bridge=createAgentLivePreviewBridge({userId,runId,buildContract:{} as never,plan:{} as never,baseFiles:[],checkpointStore:store,emit:event=>{emitted.push(event);}});
    const event:SoftwareRunEvent={id:randomUUID(),runId,sequence:1,createdAt:new Date().toISOString(),type:'file.created',status:'success',title:'Synthetic mutation'};
    return{bridge,event,emitted};
  });}finally{['SUPABASE_SERVICE_ROLE_KEY','NODE_ENV'].forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
}

test('finalization drains the existing queue and rejects late mutation events',async()=>{
  let release:(()=>void)|undefined,reads=0;const order:string[]=[];
  const f=await fixture({load:async()=>{reads++;await new Promise<void>(resolve=>{release=resolve;});order.push('preview finished');return null;},save:async()=>{throw new Error('Unexpected save');}});
  f.bridge.handle(f.event);while(!release)await new Promise(resolve=>setImmediate(resolve));
  const drained=f.bridge.closeAndDrain().then(()=>{order.push('final revision allowed');});
  f.bridge.handle(f.event);assert.deepEqual(order,[]);release();await drained;
  assert.deepEqual(order,['preview finished','final revision allowed']);assert.equal(reads,1);assert.deepEqual(f.emitted,[]);
});

for(const code of ['RUN_STATE_CONFLICT','RESOURCE_ACCESS_UNAVAILABLE'])test(`queued ${code} blocks finalization and publishes no success`,async()=>{
  const f=await fixture({load:async()=>{throw Object.assign(new Error('Synthetic checkpoint failure'),{code});},save:async()=>{throw new Error('Unexpected save');}});
  f.bridge.handle(f.event);await assert.rejects(f.bridge.closeAndDrain(),{code});f.bridge.handle(f.event);assert.deepEqual(f.emitted,[]);
});

test('bounded drain rejects instead of allowing a final revision to overtake stalled preview',async()=>{
  let release:(()=>void)|undefined;
  const f=await fixture({load:async()=>{await new Promise<void>(resolve=>{release=resolve;});return {} as never;},save:async()=>{throw new Error('Unexpected save');}});
  f.bridge.handle(f.event);while(!release)await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(f.bridge.closeAndDrain(10),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
  release();await assert.rejects(f.bridge.closeAndDrain(),{code:'RESOURCE_ACCESS_UNAVAILABLE'});assert.deepEqual(f.emitted,[]);
});

test('adapter joins preview queue on success and failure, preview events follow durable revision receipt',()=>{
  const adapter=readFileSync(new URL('../softwareAgentImplementationAdapter.ts',import.meta.url),'utf8');
  assert.match(adapter,/\.finally\(\(\) => \{\s*implementationClosed = true;\s*return livePreviewBridge\.closeAndDrain\(\);/);
  assert.match(adapter,/if \(implementationClosed\) return;/);
  const bridge=readFileSync(new URL('./agentBridge.ts',import.meta.url),'utf8');
  assert.ok(bridge.indexOf('for (const pending of pendingEvents)')>bridge.indexOf('.saveRevision('));
});
