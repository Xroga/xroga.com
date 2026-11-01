import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import { ContainerBrowserWorker, type BrowserModelGateway, type ModelUsage } from './containerBrowserWorker.js';
import { RemoteBrowserWorker } from './browserCoordinator.js';
import { parseBrowserJob } from './browserJob.js';
import { BrowserModelLifetime } from './browserModelLifetime.js';

const job = parseBrowserJob({version:1,tenantId:'t1',userId:'u1',projectId:'p1',runId:'r1',taskId:'k1',attempt:1,
  startUrl:'https://example.com/',allowedOrigins:['https://example.com'],limits:{maxDurationMs:60000,maxNavigations:5,maxRedirects:1,maxPages:1,maxResponseBytes:1000000,maxArtifactBytes:1000000,maxModelCostMicros:100}});
const lease={tenantId:'t1',runId:'r1',taskId:'k1',workerId:'api-1',token:7,expiresAt:Date.now()+60000};
const result={finalUrl:job.startUrl,visitedUrls:[job.startUrl],navigations:1,responseBytes:1,summary:'fixture',artifacts:[]};
const nextTurn=()=>new Promise<void>(resolve=>setImmediate(resolve));

function fixture(kind:'container'|'remote',gateway:BrowserModelGateway){
  const replies:unknown[]=[];
  let write:(value:unknown)=>void;
  let run:Promise<unknown>;
  const abort=new AbortController();
  if(kind==='container'){
    const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>true}) as unknown as ChildProcess;
    child.stdin!.on('data',data=>{for(const line of String(data).trim().split('\n'))replies.push(JSON.parse(line));});
    const worker=new ContainerBrowserWorker({repoRoot:fileURLToPath(new URL('../../../',import.meta.url)),browserImage:'synthetic-browser@sha256:'+'a'.repeat(64),proxyImage:'synthetic-proxy'});
    const usage:ModelUsage={calls:0,inputTokens:0,outputTokens:0,costMicros:0,refused:0};
    run=(worker as any).converse(child,job,{steps:[],expect:[]},{},usage,abort.signal,gateway);
    write=value=>child.stdout!.emit('data',Buffer.from(JSON.stringify(value)+'\n'));
  }else{
    let stream:ReadableStreamDefaultController<Uint8Array>;
    const body=new ReadableStream<Uint8Array>({start(controller){stream=controller;}});
    const fetchImpl:typeof fetch=async(_input,init)=>{
      if(init?.method==='POST'&&String(_input).endsWith('/v1/jobs'))return new Response(body,{headers:{'x-xroga-job':'11111111-1111-4111-8111-111111111111'}});
      if(init?.body)replies.push(JSON.parse(String(init.body)));
      return new Response(null,{status:204});
    };
    run=new RemoteBrowserWorker({baseUrl:'http://127.0.0.1',secret:'s'.repeat(40),gateway,fetchImpl}).run(job,{signal:abort.signal,lease});
    write=value=>stream.enqueue(Buffer.from(JSON.stringify(value)+'\n'));
  }
  // Attach rejection observation before driving the untrusted worker stream.
  run.catch(()=>undefined);
  return {run,write,replies,abort};
}

test('settled calls use the new remainder, ordinary provider failures can recover, and worker claims cannot change spend',async()=>{
  const usage={calls:0,inputTokens:0,outputTokens:0,costMicros:0,refused:0};
  const remainders:number[]=[];
  const session=new BrowserModelLifetime(job,{generate:async(_p,ctx)=>{
    remainders.push(ctx.remainingMicros);
    if(remainders.length===1)throw Object.assign(Error('synthetic unavailable'),{status:503});
    return{result:{},inputTokens:1,outputTokens:2,costMicros:40};
  }},new AbortController().signal,usage);
  try{
    await assert.rejects(session.request(1,{}),{status:503});
    await session.request(2,{});await session.request(3,{});session.assertComplete();
    assert.deepEqual(remainders,[100,100,60]);assert.equal(usage.costMicros,80);
    assert.equal(usage.calls,2);assert.equal(usage.refused,1);
    assert.throws(()=>session.request(3,{}),{code:'WORKER_FAILED'});
    assert.throws(()=>session.request(4,{}),{code:'WORKER_FAILED'});
  }finally{session.close();}
});

for(const error of [Object.assign(Error('synthetic denial'),{code:'MODEL_DISPATCH_BINDING_DENIED'}),
  Object.assign(Error('synthetic missing usage'),{code:'MODEL_USAGE_UNMEASURED'}),Error('synthetic settlement failure')]){
  test(`model lifetime stops after ${String((error as {code?:string}).code??'unconfirmed settlement')}`,async()=>{
    let calls=0;const session=new BrowserModelLifetime(job,{generate:async()=>{calls++;throw error;}},new AbortController().signal,
      {calls:0,inputTokens:0,outputTokens:0,costMicros:0,refused:0});
    try{
      await assert.rejects(session.request(1,{}),{code:'WORKER_FAILED'});
      assert.throws(()=>session.request(2,{}),{code:'WORKER_FAILED'});
      assert.throws(()=>session.assertComplete(),{code:'WORKER_FAILED'});assert.equal(calls,1);
    }finally{session.close();}
  });
}

test('cancellation prevents further dispatch and output even if a provider ignores abort',async()=>{
  const abort=new AbortController();let complete!:()=>void;let calls=0;
  const session=new BrowserModelLifetime(job,{generate:async()=>{calls++;await new Promise<void>(r=>{complete=r;});return{result:{},inputTokens:1,outputTokens:1,costMicros:1};}},abort.signal,
    {calls:0,inputTokens:0,outputTokens:0,costMicros:0,refused:0});
  const request=session.request(1,{});request.catch(()=>undefined);abort.abort();complete();
  try{await assert.rejects(request,{code:'WORKER_FAILED'});assert.throws(()=>session.request(2,{}),{code:'WORKER_FAILED'});assert.equal(calls,1);}
  finally{session.close();}
});

for(const kind of ['container','remote'] as const){
  test(`${kind}: untrusted worker failure text cannot enter persisted failure evidence`,async()=>{
    const f=fixture(kind,{generate:async()=>{throw Error('not called');}});
    f.write({type:'error',code:'RESULT_OUT_OF_SCOPE',reason:'OPAQUE_CREDENTIAL_CANARY_DO_NOT_PERSIST'});
    await assert.rejects(f.run,(error:Error)=>!error.message.includes('OPAQUE_CREDENTIAL_CANARY_DO_NOT_PERSIST'));
  });
  test(`${kind}: overlapping model requests cannot reuse an unspent allowance`,async()=>{
    let calls=0;let stop!:()=>void;
    const gateway:BrowserModelGateway={generate:async()=>{calls++;await new Promise<void>(r=>{stop=r;});return{result:{},inputTokens:1,outputTokens:1,costMicros:75};}};
    const f=fixture(kind,gateway);
    f.write({type:'llm',id:1,n:1,params:{messages:[]}});await nextTurn();
    f.write({type:'llm',id:2,n:2,params:{messages:[]}});await nextTurn();
    const observed=calls;stop();try{f.write({type:'result',result});}catch{/* rejected remote stream already closed */}
    await f.run.catch(()=>undefined);
    assert.equal(observed,1,'Only one request may use the current remaining allowance');
  });
  test(`${kind}: a result cannot succeed before model accounting completes and revokes the call lifetime`,async()=>{
    let signal:AbortSignal|undefined;let complete!:()=>void;
    const gateway:BrowserModelGateway={generate:async(_p,ctx)=>{signal=ctx.signal;await new Promise<void>(r=>{complete=r;});return{result:{},inputTokens:1,outputTokens:1,costMicros:1};}};
    const f=fixture(kind,gateway);
    f.write({type:'llm',id:1,n:1,params:{messages:[]}});await nextTurn();
    f.write({type:'result',result});
    try{await assert.rejects(f.run,{code:'WORKER_FAILED'});assert.equal(signal?.aborted,true);}
    finally{complete();}
  });
}
