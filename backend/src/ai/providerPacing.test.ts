import assert from 'node:assert/strict';
import test from 'node:test';
import {acquireModelRequestLease,providerCooldownSeconds,releasePacingWithBody,type PacingStore} from './providerPacing.js';
import {admittedModelReservation,registerModelSdkAdmission,requireModelSdkAdmission} from './modelSdkAdmission.js';

const binding={userId:'11111111-1111-4111-8111-111111111111',reservationId:'22222222-2222-4222-8222-222222222222'};
test('admission waits before dispatch without retrying inference or changing its reservation',async()=>{
  let now=0,claims=0,releases=0;const keys:string[]=[];
  const store:PacingStore={async claim(actual,key){assert.deepEqual(actual,binding);keys.push(key);claims++;return{granted:now>=11_000,retry_after_ms:Math.max(0,11_000-now)};},async release(){releases++;}};
  const lease=await acquireModelRequestLease({binding,credential:'synthetic-never-a-real-key',store,now:()=>now,wait:async ms=>{now+=ms;}});
  assert.equal(now,11_000);assert.equal(claims,12);assert.equal(new Set(keys).size,1);
  assert.match(keys[0],/^[a-f0-9]{64}$/);assert.ok(!keys[0].includes('synthetic'));
  await lease.release();await lease.release();assert.equal(releases,1);
});
test('capacity and cooldown waits are bounded and cancellation prevents acquisition',async()=>{
  let claims=0;const controller=new AbortController();
  const store:PacingStore={async claim(){claims++;return{granted:false,retry_after_ms:10_000};},async release(){assert.fail('No lease exists');}};
  await assert.rejects(acquireModelRequestLease({binding,credential:'synthetic',store,maximumWaitMs:1_000}),{code:'MODEL_PROVIDER_BUSY'});
  controller.abort();await assert.rejects(acquireModelRequestLease({binding,credential:'synthetic',store,signal:controller.signal}),{name:'AbortError'});
  assert.equal(claims,1);
  let now=0;
  await assert.rejects(acquireModelRequestLease({binding,credential:'synthetic',store,maximumWaitMs:12_000,now:()=>now,
    wait:async ms=>{now+=ms;}}),{code:'MODEL_PROVIDER_BUSY'});
  assert.ok(now<=12_000);
});
test('cancellation during the wait sends no subsequent admission request',async()=>{
  let calls=0;const controller=new AbortController();
  const store:PacingStore={async claim(){calls++;return{granted:false,retry_after_ms:100};},async release(){assert.fail();}};
  await assert.rejects(acquireModelRequestLease({binding,credential:'synthetic',store,signal:controller.signal,
    wait:async()=>{controller.abort();}}),{name:'AbortError'});
  assert.equal(calls,1);
});
test('the SDK pacing scope is issued, consumed, copied and revoked with canonical admission',()=>{
  const guard=async()=>{};
  assert.throws(()=>admittedModelReservation(guard),{code:'MODEL_DISPATCH_BINDING_DENIED'});
  const handle=registerModelSdkAdmission(guard,'deepseek_v4_1_flash_1017',undefined,binding);
  assert.throws(()=>admittedModelReservation(guard));
  requireModelSdkAdmission(guard,'deepseek_v4_1_flash_1017',undefined);
  const scope=admittedModelReservation(guard);assert.deepEqual(scope,binding);scope.userId='changed';
  assert.deepEqual(admittedModelReservation(guard),binding);
  handle.revoke();assert.throws(()=>admittedModelReservation(guard));
});
test('an SSE response keeps concurrency until its actual HTTP body ends',async()=>{
  let controller!:ReadableStreamDefaultController<Uint8Array>,released=0;
  const original=new Response(new ReadableStream<Uint8Array>({start(c){controller=c;}}),{headers:{'content-type':'text/event-stream'}});
  const response=releasePacingWithBody(original,async()=>{released++;});
  const reader=response.body!.getReader();controller.enqueue(new TextEncoder().encode('data: partial\n\n'));
  assert.equal((await reader.read()).done,false);assert.equal(released,0);
  controller.close();assert.equal((await reader.read()).done,true);assert.equal(released,1);
});
test('HTTP body cancellation releases its key without fabricating completed usage',async()=>{
  let cancelled=false,released=0;
  const response=releasePacingWithBody(new Response(new ReadableStream({cancel(){cancelled=true;}})),async()=>{released++;});
  await response.body!.cancel();assert.equal(cancelled,true);assert.equal(released,1);
});
test('429 cooldown respects bounded numeric and date Retry-After without retrying',()=>{
  assert.equal(providerCooldownSeconds(null),60);assert.equal(providerCooldownSeconds('120'),120);
  assert.equal(providerCooldownSeconds('2'),2);
  assert.equal(providerCooldownSeconds('999999'),300);assert.equal(providerCooldownSeconds('bad'),60);
  assert.equal(providerCooldownSeconds('Wed, 04 Nov 2026 07:02:00 GMT',Date.parse('2026-11-04T07:00:00Z')),120);
});
