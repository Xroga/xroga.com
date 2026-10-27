import assert from 'node:assert/strict';
import test from 'node:test';
import {GoogleSandboxRuntime,GoogleSandboxCleanupPendingError} from './googleSandbox.js';
import {InMemoryProjectRuntimeStore} from '../../synthesis/projectRuntime/store.js';
import type {ProjectRuntimeSession} from '../../synthesis/projectRuntime/types.js';
import {DEFAULT_SANDBOX_LIMITS,SandboxAdmissionError,SandboxUnavailableError,type SandboxExecutionRequest} from '../sandboxTypes.js';
import {GceControlError} from './gceMachineControl.js';

// Synthetic provider fixture. Real controller, SSH, provenance and caller
// staging have separate evidence and are not certified by this fixture.
function fixture(){
  const binding=Object.freeze({userId:'synthetic-owner',projectId:'synthetic-project',runId:'synthetic-run',caller:'universal-validation' as const,requestSha256:'a'.repeat(64)});
  const store=new InMemoryProjectRuntimeStore();let creates=0,destroys=0,denied=false,cleanupFails=false,stalled=false;
  let failedEvent:string|undefined;const append=store.appendEvent.bind(store);
  store.appendEvent=async input=>{if(input.eventType===failedEvent)throw new Error('PRIVATE_RECEIPT_CANARY');return append(input);};
  const operations:{command:string;networkPolicy:unknown;environment:unknown}[]=[];let onExec=()=>{};
  let result={exitCode:0 as number|null,stdout:'actual-output',stderr:'',timedOut:false,killedForLimit:false,durationMs:1};
  const runtime=new GoogleSandboxRuntime({}, {admissionTimeoutMs:20,store:()=>store,probe:async()=>{},
    authority:async(request,cleanup)=>{if(request.executionBinding!==binding||(!cleanup&&denied))throw new SandboxAdmissionError();
      if(!cleanup&&stalled)return new Promise<typeof binding>(()=>{});return binding;},
    provider:(_scope,_store,admit,allocated)=>({
      async create(input){await admit({userId:input.userId,projectId:input.projectId,action:'create',sourceFiles:input.files});creates++;
        const now=new Date().toISOString();const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:'synthetic-session',userId:input.userId,
          projectId:input.projectId,providerId:'google-gce',runtimeClass:'verification',status:'creating',image:'node@sha256:'+'a'.repeat(64),
          knownFiles:input.files.map(file=>file.path),workspaceRevision:0,processes:[],ports:[],providerState:{gce:{instanceId:'synthetic'}},createdAt:now,updatedAt:now,expiresAt:new Date(Date.now()+600000).toISOString()};
        await allocated(session);return {...session,status:'running'};},
      async exec(session,input){await admit({userId:session.userId,projectId:session.projectId,action:'exec',session});
        operations.push({command:input.command,networkPolicy:input.networkPolicy,environment:input.environment});onExec();return {...result};},
      async destroy(session){await admit({userId:session.userId,projectId:session.projectId,action:'destroy',session});destroys++;if(cleanupFails)throw new Error('PRIVATE_CLEANUP_CANARY');}
    })});
  const request:SandboxExecutionRequest={executionBinding:binding,files:[{path:'index.ts',content:'synthetic'}],command:'true',args:[],
    environment:{CI:'1'},timeoutMs:20000,networkPolicy:'none',limits:{...DEFAULT_SANDBOX_LIMITS},
    stages:[{id:'install',command:'npm',args:['install','--ignore-scripts'],networkPolicy:'registry-only',timeoutMs:10000},
      {id:'build',command:'npm',args:['run','build'],networkPolicy:'none',timeoutMs:10000}]};
  return {runtime,request,store,operations,get creates(){return creates;},get destroys(){return destroys;},deny(){denied=true;},
    failCleanup(){cleanupFails=true;},failEvent(value:string){failedEvent=value;},stall(){stalled=true;},onExec(value:()=>void){onExec=value;},reply(value:Partial<typeof result>){result={...result,...value};}};
}

test('native stages share one VM and retain distinct setup/build network policies, then destroy it',async()=>{
  const f=fixture();const result=await f.runtime.execute(f.request);
  assert.equal(f.creates,1);assert.equal(f.destroys,1);assert.equal(result.exitCode,0);
  assert.deepEqual(f.operations.map(operation=>operation.networkPolicy),['registry-only','none']);
  assert.ok(f.operations.every(operation=>JSON.stringify(operation.environment)==='{"CI":"1"}'));
  assert.deepEqual(result.stages?.map(stage=>[stage.id,stage.networkPolicy]),[['install','registry-only'],['build','none']]);
  assert.equal((await f.store.loadSession('synthetic-owner','synthetic-session'))?.status,'destroyed');
});

test('missing authority or invalid stages cannot allocate or dispatch',async()=>{
  const f=fixture();await assert.rejects(f.runtime.execute({...f.request,executionBinding:undefined}),SandboxAdmissionError);
  await assert.rejects(f.runtime.execute({...f.request,stages:[]}),SandboxAdmissionError);
  await assert.rejects(f.runtime.execute({...f.request,stages:f.request.stages!.map(stage=>({...stage,timeoutMs:20000}))}),SandboxAdmissionError);
  assert.equal(f.creates,0);assert.equal(f.operations.length,0);
});

test('failed setup never runs the build and still cleans the only allocated VM',async()=>{
  const f=fixture();f.reply({exitCode:1,stdout:'setup failed'});const result=await f.runtime.execute(f.request);
  assert.equal(result.exitCode,1);assert.equal(result.stages?.length,1);assert.equal(f.operations.length,1);assert.equal(f.destroys,1);
});

test('revocation after a command prevents another stage and cancellation still permits owned cleanup',async()=>{
  const f=fixture();f.onExec(()=>f.deny());await assert.rejects(f.runtime.execute(f.request),SandboxAdmissionError);
  assert.equal(f.operations.length,1);assert.equal(f.creates,1);assert.equal(f.destroys,1);
});

test('cancellation racing a successful receipt cannot become successful completion',async()=>{
  const f=fixture();const controller=new AbortController();f.onExec(()=>controller.abort());
  await assert.rejects(f.runtime.execute({...f.request,signal:controller.signal}),SandboxAdmissionError);
  assert.equal(f.operations.length,1);assert.equal(f.destroys,1);
});

test('execution limit or unverified cleanup cannot return successful verification',async()=>{
  const limited=fixture();limited.reply({killedForLimit:true});await assert.rejects(limited.runtime.execute(limited.request),SandboxUnavailableError);
  assert.equal(limited.operations.length,1);assert.equal(limited.destroys,1);
  const pending=fixture();pending.failCleanup();await assert.rejects(pending.runtime.execute(pending.request),error=>
    error instanceof GoogleSandboxCleanupPendingError&&error.cleanupCode==='GCE_ALLOCATION_CLEANUP_PENDING'&&!error.message.includes('PRIVATE_'));
  assert.equal(pending.destroys,1);assert.equal((await pending.store.loadSession('synthetic-owner','synthetic-session'))?.status,'running');
});

test('physical ownership denial remains fatal even when cleanup also fails',async()=>{
  const f=fixture();f.failCleanup();f.onExec(()=>{throw new GceControlError('GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH');});
  await assert.rejects(f.runtime.execute(f.request),error=>error instanceof SandboxAdmissionError&&error.cleanupPending);
  assert.equal(f.creates,1);assert.equal(f.operations.length,1);assert.equal(f.destroys,1);
});

test('a stalled admission read cannot hang completion or dispatch another stage',async()=>{
  const f=fixture();f.onExec(()=>f.stall());
  await assert.rejects(f.runtime.execute(f.request),SandboxAdmissionError);
  assert.equal(f.operations.length,1);assert.equal(f.destroys,1);
});

test('missing allocation or stage receipt prevents completion and further command dispatch',async()=>{
  for(const event of ['sandbox.allocated','sandbox.stage_completed']){
    const f=fixture();f.failEvent(event);
    await assert.rejects(f.runtime.execute(f.request),error=>error instanceof SandboxUnavailableError&&!error.message.includes('PRIVATE_'));
    assert.equal(f.creates,1);assert.equal(f.destroys,1);assert.equal(f.operations.length,event==='sandbox.allocated'?0:1);
  }
});
