import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {ChildProcess} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ContainerBrowserWorker} from './containerBrowserWorker.js';
import {parseBrowserJob} from './browserJob.js';
const job=parseBrowserJob({version:1,tenantId:'t',userId:'u',projectId:'p',runId:'r',taskId:'k',attempt:1,allowedOrigins:['https://example.com'],startUrl:'https://example.com/',limits:{maxDurationMs:60000,maxNavigations:5,maxRedirects:1,maxPages:1,maxResponseBytes:1000000,maxArtifactBytes:1000000,maxModelCostMicros:0}});
function fixture(){
  const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>true}) as unknown as ChildProcess;
  const worker=new ContainerBrowserWorker({repoRoot:fileURLToPath(new URL('../../../',import.meta.url)),browserImage:'synthetic-browser@sha256:'+'a'.repeat(64),proxyImage:'synthetic-proxy'});
  const abort=new AbortController(),usage={calls:0,inputTokens:0,outputTokens:0,costMicros:0,refused:0};
  const run=(worker as any).converse(child,job,{steps:[],expect:[]},{},usage,abort.signal,undefined) as Promise<unknown>;run.catch(()=>undefined);
  return{child,run,abort};
}
const result={type:'result',result:{finalUrl:'https://example.com/',visitedUrls:[],navigations:0,responseBytes:0,summary:'ok',artifacts:[]}};
test('container worker output is bounded before accepting an untrusted result',async()=>{
  const f=fixture();
  try{
    f.child.stdout!.emit('data',Buffer.from('x'.repeat(6*1024*1024)+'\n'+JSON.stringify(result)+'\n'));
    await assert.rejects(f.run,e=>(e as any).code==='RESULT_OVER_LIMIT'&&(e as any).retryable===false);
  }finally{f.abort.abort();f.child.stdin!.destroy();f.child.stdout!.destroy();f.child.stderr!.destroy();}
});
test('malformed container records cannot be skipped to accept a later result',async()=>{
  const f=fixture();
  try{
    f.child.stdout!.emit('data',Buffer.from('not-json\n'+JSON.stringify(result)+'\n'));
    await assert.rejects(f.run,e=>(e as any).code==='WORKER_FAILED'&&(e as any).retryable===false);
  }finally{f.abort.abort();f.child.stdin!.destroy();f.child.stdout!.destroy();f.child.stderr!.destroy();}
});
for(const when of ['before','during-network'] as const)test(`cancellation ${when} cannot start browser or proxy containers`,async()=>{
  const abort=new AbortController(),commands:string[][]=[];let spawned=0;
  if(when==='before')abort.abort();
  const worker=new ContainerBrowserWorker({repoRoot:fileURLToPath(new URL('../../../',import.meta.url)),browserImage:'synthetic-browser@sha256:'+'a'.repeat(64),proxyImage:'synthetic-proxy',
    docker:async args=>{commands.push(args);if(when==='during-network'&&args[0]==='network'&&args[1]==='create')abort.abort();return{status:0,stdout:'{"listening":true}',stderr:''};},
    spawnDocker:()=>{spawned++;throw Error('No container should be started');}});
  await assert.rejects(worker.run(job,{signal:abort.signal,lease:{tenantId:'t',runId:'r',taskId:'k',workerId:'worker',token:1,expiresAt:Date.now()+60000}}),e=>(e as any).code==='CANCELLED');
  assert.equal(spawned,0);assert.equal(commands.filter(args=>args[0]==='run').length,0,'No proxy dispatch after cancellation');
  if(when==='before')assert.equal(commands.length,0,'No resource mutation for an already-cancelled job');
  else assert.ok(commands.some(args=>args[0]==='network'&&args[1]==='rm'),'The task-created network is cleaned');
});
test('actual container adapter keeps commands shell-free, passes no tenant authority, and cleans only its own resources',async()=>{
  const commands:string[][]=[],starts:any[]=[],spawnArgs:string[][]=[];
  const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>true}) as unknown as ChildProcess;
  child.stdin!.on('data',bytes=>{const value=JSON.parse(String(bytes));if(value.type==='start'){starts.push(value);queueMicrotask(()=>child.stdout!.emit('data',Buffer.from(JSON.stringify(result)+'\n')));}});
  const image='synthetic-browser@sha256:'+'a'.repeat(64),proxy='synthetic-proxy@sha256:'+'b'.repeat(64);
  const worker=new ContainerBrowserWorker({repoRoot:fileURLToPath(new URL('../../../',import.meta.url)),browserImage:image,proxyImage:proxy,docker:async args=>{commands.push(args);return{status:0,stdout:'{"listening":true}',stderr:''};},spawnDocker:args=>{spawnArgs.push(args);return child;}});
  try{
    await worker.run(job,{signal:new AbortController().signal,lease:{tenantId:'t',runId:'r',taskId:'k',workerId:'worker',token:1,expiresAt:Date.now()+60000}});
    assert.equal(starts.length,1);assert.deepEqual(Object.keys(starts[0]).sort(),['job','launch','plan','type']);
    const launch=spawnArgs[0];assert.ok(launch.includes('--read-only'));assert.ok(launch.includes('ALL'));assert.ok(launch.includes('no-new-privileges:true'));assert.ok(launch.includes(image));
    assert.equal(launch.includes('--privileged'),false);assert.equal(launch.some(a=>a.includes('docker.sock')),false);
    const proxyCommand=commands.find(a=>a[0]==='run')!;assert.ok(proxyCommand.includes(proxy));
    const envs=proxyCommand.flatMap((a,i)=>a==='-e'?[proxyCommand[i+1].split('=')[0]]:[]);
    assert.deepEqual(envs.sort(),['XROGA_PROXY_JOB','XROGA_PROXY_PASSWORD','XROGA_PROXY_PORT','XROGA_PROXY_USERNAME']);
    const cleanup=commands.filter(a=>a[0]==='rm'||a[0]==='network'&&a[1]==='rm');assert.equal(cleanup.length,3);
    assert.ok(cleanup.every(a=>/^xroga-bj-(?:browser-|proxy-)?[a-f0-9]{16}$/.test(a.at(-1)!)));
  }finally{child.stdin!.destroy();child.stdout!.destroy();child.stderr!.destroy();}
});
