import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobBrowserWorker, type BrowserJobTransport } from './jobBrowserWorker.js';
import { MemoryLeaseStore } from './leaseStore.js';
import { parseBrowserJob } from './browserJob.js';
import { BROWSER_RUN_DEFAULTS } from './browserCapability.js';

async function setup(){
  const job=parseBrowserJob({version:1,tenantId:'alice',userId:'alice',projectId:'p',runId:'run',taskId:'browser-1',attempt:1,startUrl:'https://example.com/',allowedOrigins:['https://example.com'],limits:BROWSER_RUN_DEFAULTS});
  const leases=new MemoryLeaseStore();
  const lease=(await leases.acquire({tenantId:job.tenantId,runId:job.runId,taskId:job.taskId},'test',60000))!;
  const calls:string[]=[];const abort=new AbortController();
  const transport:BrowserJobTransport={
    start:async()=>{calls.push('start');},
    result:async executionId=>{calls.push('result');return {executionId,fence:lease.token,result:{finalUrl:job.startUrl,visitedUrls:[job.startUrl],navigations:1,responseBytes:20,summary:'fixture',artifacts:[]},usage:{browserMs:25,allocatedCpuMillis:30,allocatedMemoryMiBMillis:100}};},
    release:async(_id,signal)=>{assert.equal(signal.aborted,false);calls.push('release');return {terminated:true};},
  };
  const ctx={signal:abort.signal,lease,plan:{steps:[{op:'screenshot' as const,name:'page.png'}],expect:[]}};
  return {job,leases,lease,calls,abort,transport,ctx,worker:()=>new JobBrowserWorker(transport,leases)};
}

test('on-demand adapter returns usage only after verified cleanup',async()=>{
 const t=await setup();const result=await t.worker().run(t.job,t.ctx);
 assert.deepEqual(t.calls,['start','result','release']);
 assert.deepEqual(result.metrics?.resourceUsage,{browserMs:25,allocatedCpuMillis:30,allocatedMemoryMiBMillis:100});
});
test('lost start response still releases the deterministic execution identity',async()=>{
 const t=await setup();t.transport.start=async()=>{t.calls.push('start');throw new Error('private provider body');};
 await assert.rejects(t.worker().run(t.job,t.ctx),/did not complete/);
 assert.deepEqual(t.calls,['start','release']);
});
test('cancelled execution cleans up with a fresh signal and refuses late success',async()=>{
 const t=await setup();const read=t.transport.result;t.transport.result=async(id,signal)=>{t.abort.abort();return read(id,signal);};
 await assert.rejects(t.worker().run(t.job,t.ctx),/cancelled/);
 assert.deepEqual(t.calls,['start','result','release']);
});
test('unverified cleanup blocks automatic retry and completion',async()=>{
 const t=await setup();t.transport.release=async()=>{throw new Error('unavailable');};
 await assert.rejects(t.worker().run(t.job,t.ctx),e=>!!e&&typeof e==='object'&&'retryable'in e&&e.retryable===false&&String(e).includes('cleanup'));
});
test('wrong execution fence and missing usage cannot produce success',async()=>{
 for(const kind of ['fence','usage']){
   const t=await setup();const read=t.transport.result;
   t.transport.result=async(id,signal)=>{const receipt=await read(id,signal);if(kind==='fence')receipt.fence++;else receipt.usage.browserMs=NaN;return receipt;};
   await assert.rejects(t.worker().run(t.job,t.ctx));assert.equal(t.calls.at(-1),'release');
 }
});
test('another tenant lease and revoked lease are denied before external dispatch',async()=>{
 const t=await setup();
 await assert.rejects(t.worker().run(t.job,{...t.ctx,lease:{...t.lease,tenantId:'bob'}}));
 await t.leases.release(t.lease);
 await assert.rejects(t.worker().run(t.job,t.ctx));
 assert.deepEqual(t.calls,[]);
});
