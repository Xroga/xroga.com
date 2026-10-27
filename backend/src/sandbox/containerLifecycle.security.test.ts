import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {ContainerSandboxRuntime} from './sandboxProviders.js';
import {SandboxAdmissionError,DEFAULT_SANDBOX_LIMITS} from './sandboxTypes.js';
const require=createRequire(import.meta.url),processes=require('node:child_process'),CID='1'.repeat(64);
const request=()=>({files:[],command:'node',args:['-e','process.exit(0)'],timeoutMs:1000,networkPolicy:'none' as const,environment:{CI:'1'},limits:{...DEFAULT_SANDBOX_LIMITS}});
function fixture(t:TestContext,mode:string){
 const abort=new AbortController(),commands:string[][]=[];
 t.mock.method(processes,'spawn',(_binary:string,args:string[])=>{
  commands.push(args);const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:()=>{queueMicrotask(()=>child.emit('close',null));return true;}});
  if(args[0]==='rm'&&mode==='lateAbort')abort.abort();
  queueMicrotask(()=>{if(args[0]==='create'){child.stdout.write(CID);if(mode==='createAbort')abort.abort();}child.stdout.end();child.stderr.end();child.emit('close',mode==='cleanupFailure'&&['rm','ps'].includes(args[0])?1:args[0]==='start'&&mode==='programFailure'?7:0);});
  return child;
 });syncBuiltinESMExports();t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports();});
 class Controlled extends ContainerSandboxRuntime {override async probe(){return{available:true,runtime:'controlled'};}}
 return{abort,commands,runtime:new Controlled({binary:'docker',image:'synthetic@sha256:'+'a'.repeat(64)})};
}
test('cancellation during final container cleanup cannot return successful completion',async t=>{
 const f=fixture(t,'lateAbort');await assert.rejects(f.runtime.execute({...request(),signal:f.abort.signal}),e=>e instanceof SandboxAdmissionError&&!e.cleanupPending);assert.ok(f.commands.some(a=>a[0]==='rm'&&a.at(-1)===CID));
});
test('cancellation while create completes cleans exact CID without starting it',async t=>{
 const f=fixture(t,'createAbort');await assert.rejects(f.runtime.execute({...request(),signal:f.abort.signal}),SandboxAdmissionError);assert.equal(f.commands.filter(a=>a[0]==='start').length,0);assert.ok(f.commands.some(a=>a[0]==='rm'&&a.at(-1)===CID));
});
test('unverified cleanup is a terminal pending admission failure',async t=>{
 const f=fixture(t,'cleanupFailure');await assert.rejects(f.runtime.execute(request()),e=>e instanceof SandboxAdmissionError&&e.cleanupPending);assert.equal(f.commands.filter(a=>a[0]==='start').length,1);
});
test('authorized ordinary program failure preserves its exit status and exact cleanup',async t=>{
 const f=fixture(t,'programFailure');assert.equal((await f.runtime.execute(request())).exitCode,7);assert.equal(f.commands.filter(a=>a[0]==='start').length,1);assert.ok(f.commands.filter(a=>a[0]==='rm').every(a=>a.join(' ')==='rm -f '+CID));
});

test('managed task containers carry the exact local cleanup ownership labels',async t=>{
 const f=fixture(t,'success');await f.runtime.execute(request());const create=f.commands.find(args=>args[0]==='create')!;
 const labels=create.flatMap((value,index)=>value==='--label'?[create[index+1]]:[]);
 assert.ok(labels.includes('io.xroga.cleanup.owner=XROGA_LOCAL_DISPOSABLE_JOB_V1'));
 assert.ok(labels.includes('io.xroga.cleanup.disposable=true'));
 assert.ok(labels.includes('io.xroga.cleanup.job='+process.env.XROGA_CLEANUP_JOB_ID));
});
