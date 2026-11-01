import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {ContainerSandboxRuntime} from './sandboxProviders.js';
import {SandboxAdmissionError} from './sandboxTypes.js';
const IMAGE='sha256:63538dfe497cc29dfafdda25ada09b46db68a3f4cc205abf1f5d6bf0913f3384';
const docker=(args:string[])=>new Promise<string>((resolve,reject)=>execFile('docker',args,{encoding:'utf8',timeout:5000,maxBuffer:64*1024},(error,stdout)=>error?reject(error):resolve(stdout.trim())));
async function owned(marker:string){
 const ids=(await docker(['ps','-aq','--no-trunc','--filter','ancestor='+IMAGE])).split(/\r?\n/).filter(id=>/^[a-f0-9]{64}$/.test(id));
 const rows:Array<{Id:string;Config:{Cmd:string[]};State:{Running:boolean}}>=[];
 for(const id of ids)try{
  // Inspect only the command needed for nonce attribution and lifecycle state,
  // never unrelated container environment variables or credentials.
  const cmd:unknown=JSON.parse(await docker(['inspect','--format','{{json .Config.Cmd}}',id]));
  if(Array.isArray(cmd)&&cmd.every(v=>typeof v==='string')&&cmd.join('\n').includes(marker))rows.push({Id:id,Config:{Cmd:cmd},State:JSON.parse(await docker(['inspect','--format','{{json .State}}',id]))});
 }catch(error){if((await docker(['ps','-aq','--no-trunc','--filter','id='+id])).trim())throw error;}
 return rows;
}
const options={files:[],command:'node',timeoutMs:2500,networkPolicy:'none' as const,environment:{CI:'1'},limits:{memoryMb:128,cpuSeconds:60,diskMb:16,maxProcesses:32}};

test('real cached-image container stops after sandbox cancellation and leaves no owned resource',{timeout:35000},async t=>{
 assert.equal(await docker(['image','inspect',IMAGE,'--format','{{.Id}}']),IMAGE,'Use only the exact cached image, never pull or delete it');
 const marker='xroga-phase4-cancel-'+randomUUID(),script=`console.log(${JSON.stringify(marker)});setTimeout(()=>process.exit(0),12000);setInterval(()=>{},1000);`;
 const abort=new AbortController(),runtime=new ContainerSandboxRuntime({binary:'docker',image:IMAGE});let settled=false;
 const execution=runtime.execute({...options,args:['-e',script],timeoutMs:5000,signal:abort.signal}).then(result=>({result,error:null}),error=>({result:null,error})).finally(()=>{settled=true;});
 let selected:string|undefined;
 try{
  for(let i=0;i<40&&!settled;i++){const rows=await owned(marker);assert.ok(rows.length<=1);if(rows[0]?.State.Running){selected=rows[0].Id;break;}await delay(100);}
  assert.ok(selected,'The synthetic program must actually start before cancellation');
  const labels=JSON.parse(await docker(['inspect','--format','{{json .Config.Labels}}',selected]));
  assert.equal(labels['io.xroga.cleanup.owner'],'XROGA_LOCAL_DISPOSABLE_JOB_V1');
  assert.equal(labels['io.xroga.cleanup.job'],process.env.XROGA_CLEANUP_JOB_ID);
  assert.equal(labels['io.xroga.cleanup.disposable'],'true');
  abort.abort();
  const outcome=await execution,remaining=await owned(marker);
  t.diagnostic(JSON.stringify({image:IMAGE,ownedContainer:selected,runningAfterCancellation:remaining.some(row=>row.State.Running),outcome:outcome.error?'rejected':'returned',modelRequests:0,network:'none'}));
  assert.equal(remaining.length,0,'Cancellation must remove the daemon container, not only its attach CLI');
  assert.ok(outcome.error instanceof SandboxAdmissionError);assert.equal(outcome.error.cleanupPending,false);
 }finally{
  abort.abort();await execution;
  for(const row of await owned(marker)){assert.ok(row.Config.Cmd.join('\n').includes(marker));await docker(['rm','-f',row.Id]);}
  assert.deepEqual(await owned(marker),[]);assert.equal(await docker(['image','inspect',IMAGE,'--format','{{.Id}}']),IMAGE);
 }
});

test('real cached-image lifecycle preserves exits, timeout, output limits and credential isolation',{timeout:45000},async t=>{
 for(const mode of ['success','program-failure','timeout','output-limit','environment'])await t.test(mode,async()=>{
  const marker='xroga-phase4-outcome-'+randomUUID(),key='XROGA_SANDBOX_LIVE_TEST_API_KEY',previous=process.env[key];process.env[key]='fixture-control-plane-secret-value';
  const script=mode==='success'?`console.log(${JSON.stringify(marker)});process.exitCode=0;`:mode==='program-failure'?`console.log(${JSON.stringify(marker)});process.exitCode=7;`:
    mode==='environment'?`console.log(${JSON.stringify(marker)});console.log(JSON.stringify({secret:process.env[${JSON.stringify(key)}]??'absent',profile:process.env.USERPROFILE??'absent',root:process.env.SystemRoot??'absent'}));`:
    `console.log(${JSON.stringify(marker)});${mode==='output-limit'?"process.stdout.write('x'.repeat(100000));":''}setTimeout(()=>process.exit(0),12000);setInterval(()=>{},1000);`;
  const runtime=new ContainerSandboxRuntime({binary:'docker',image:IMAGE});
  try{
   const result=await runtime.execute({...options,args:['-e',script]});assert.ok(result.stdout.includes(marker),'The isolated program must actually run');
   if(['success','program-failure','environment'].includes(mode)){assert.equal(result.exitCode,mode==='program-failure'?7:0);assert.equal(result.timedOut,false);assert.equal(result.killedForLimit,false);}
   if(mode==='timeout')assert.equal(result.timedOut,true);
   if(mode==='output-limit'){assert.equal(result.killedForLimit,true);assert.ok(Buffer.byteLength(result.stdout)<=40000);}
   if(mode==='environment')assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)!),{secret:'absent',profile:'absent',root:'absent'});
  }finally{
   if(previous===undefined)delete process.env[key];else process.env[key]=previous;
   const remaining=await owned(marker);for(const row of remaining)await docker(['rm','-f',row.Id]);assert.equal(remaining.length,0,'No manual resource cleanup should be necessary after the adapter returns');
   assert.equal(await docker(['image','inspect',IMAGE,'--format','{{.Id}}']),IMAGE);
  }
 });
});
