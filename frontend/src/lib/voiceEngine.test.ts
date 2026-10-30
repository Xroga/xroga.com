import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceEngine } from './voiceEngine';

function fixture() {
  const messages: Array<{id:number;type:string;samples?:Float32Array}> = [];
  let created=0,terminated=0;
  const worker={onmessage:null as ((event:{data:unknown})=>void)|null,onerror:null as (()=>void)|null,onmessageerror:null as (()=>void)|null,
    postMessage(message: typeof messages[number]){messages.push(message);},terminate(){terminated++;}};
  const engine=createVoiceEngine(()=>{created++;return worker as unknown as Worker;},1000);
  const reply=(data:Record<string,unknown>)=>worker.onmessage?.({data});
  return {engine,messages,reply,get errorHandler(){return worker.onerror;},get created(){return created;},get terminated(){return terminated;}};
}

test('model preparation begins during capture and the ready worker serves repeated dictation',async()=>{
  const f=fixture(),abort=new AbortController();
  const preparation=f.engine.prepare(abort.signal,()=>{});
  assert.equal(f.messages[0].type,'prepare');
  f.reply({id:f.messages[0].id,type:'ready'});await preparation;
  for(const text of ['First task.','दूसरा काम اردو']) {
    const pending=f.engine.recognize(new Float32Array(16000).fill(0.1),abort.signal,()=>{});
    await Promise.resolve(); await Promise.resolve();
    const message=f.messages.at(-1)!;
    assert.equal(message.type,'transcribe');
    f.reply({id:message.id,type:'complete',text});assert.equal(await pending,text);
  }
  assert.equal(f.created,1);assert.equal(f.terminated,0);
  f.engine.dispose();assert.equal(f.terminated,1);
});

test('cancel terminates loading, rejects pending work and ignores stale replies',async()=>{
  const f=fixture(),abort=new AbortController();
  const preparation=f.engine.prepare(abort.signal,()=>{});
  const oldId=f.messages[0].id;
  const oldFailure=f.errorHandler;
  abort.abort();await assert.rejects(preparation,{name:'AbortError'});
  assert.equal(f.terminated,1);
  const next=f.engine.prepare(new AbortController().signal,()=>{});
  oldFailure?.();assert.equal(f.terminated,1);
  f.reply({id:oldId,type:'ready'});
  f.reply({id:f.messages.at(-1)!.id,type:'ready'});await next;
  assert.equal(f.created,2);f.engine.dispose();
});

test('idle public-model memory is released after two minutes',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  const f=fixture(),ready=f.engine.prepare(new AbortController().signal,()=>{});
  f.reply({id:f.messages[0].id,type:'ready'});await ready;
  f.engine.idle();context.mock.timers.tick(119999);assert.equal(f.terminated,0);
  context.mock.timers.tick(1);assert.equal(f.terminated,1);
});

test('download failure is classified without raw provider errors or a false transcript',async()=>{
  const f=fixture(),pending=f.engine.prepare(new AbortController().signal,()=>{});
  f.reply({id:f.messages[0].id,type:'error',code:'download'});
  await assert.rejects(pending,error=>error instanceof Error && error.name==='VoiceDownloadError');
  assert.equal(f.terminated,1);
});

test('a cached worker cannot deliver an earlier utterance to a new request',async()=>{
  const f=fixture(),signal=new AbortController().signal;
  const ready=f.engine.prepare(signal,()=>{});f.reply({id:f.messages[0].id,type:'ready'});await ready;
  const first=f.engine.recognize(new Float32Array(16000).fill(0.1),signal,()=>{});
  await Promise.resolve();await Promise.resolve();
  const firstId=f.messages.at(-1)!.id;
  f.reply({id:firstId,type:'complete',text:'One'});await first;
  const second=f.engine.recognize(new Float32Array(16000).fill(0.1),signal,()=>{});
  await Promise.resolve();await Promise.resolve();
  f.reply({id:firstId,type:'complete',text:'STALE'});
  f.reply({id:f.messages.at(-1)!.id,type:'complete',text:'Two'});
  assert.equal(await second,'Two');f.engine.dispose();
});
