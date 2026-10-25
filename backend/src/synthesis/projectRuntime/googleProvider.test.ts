import assert from 'node:assert/strict';
import test from 'node:test';
import {GoogleProjectRuntimeProvider, googleWorkspaceFiles} from './googleProvider.js';
import {executionBinding, type GceExecutionHandle, type CreateGceExecution} from '../../sandbox/google/gceMachineControl.js';
import type {GoogleProjectRuntimeOptions} from './googleProvider.js';
import type {ProviderRuntimeCreateInput} from './types.js';

// Transport/control are synthetic fixtures. They do not certify a live caller.
function fixture(){
 const image='node@sha256:'+'a'.repeat(64);let creates=0,destroys=0,dispatches=0;let denied=false,denyDuringAdmission=false,persistFailure=false;
 const operations:Record<string,unknown>[]=[];const sessions:unknown[]=[];
 let reply:unknown;let last:GceExecutionHandle|undefined;
 const configuration={project:'synthetic-project',zone:'us-central1-a',subnet:'projects/synthetic-project/regions/us-central1/subnetworks/test',
  imageName:'xroga-exec-synthetic',imageId:'12345',serviceAccount:'synthetic-runtime@synthetic-project.iam.gserviceaccount.com',admittedImages:[image]};
 const options:GoogleProjectRuntimeOptions={defaultImage:image,async nativeIdentity(){},
  async admit(){if(denied)throw Object.assign(new Error('denied'),{code:'RESOURCE_NOT_FOUND'});},
  async persistAllocation(session){if(persistFailure)throw new Error('PRIVATE_DB_CANARY');sessions.push(structuredClone(session));},
  control:{configuration,async probe(){},async resolve(){return{privateIp:'10.90.0.2',sshHostKey:'synthetic'};},
   async create(input:CreateGceExecution,onAllocated?:(handle:GceExecutionHandle)=>Promise<void>){creates++;last={...executionBinding(input),name:'xroga-exec-'+input.runtimeId.replaceAll('-',''),instanceId:'123456',expiresAtEpoch:Math.floor(Date.now()/1000)+input.ttlSeconds};await onAllocated?.(last);return last;},
   async destroy(){destroys++;}},
  transport:{async run<T>(_handle:GceExecutionHandle,operation:Readonly<Record<string,unknown>>,_timeout:number,admit?:()=>Promise<void>){
   assert.equal(typeof admit,'function');await admit!();if(denyDuringAdmission)denied=true;await admit!();
   dispatches++;operations.push(structuredClone(operation));
   const result=reply??(operation.operation==='write_files'?{written:(operation.files as {path:string}[]).map(f=>f.path)}
    :operation.operation==='read_file'?{content:'owned-content'}:operation.operation==='delete_files'?{deleted:operation.paths}
    :operation.operation==='exec'?{exitCode:0,stdout:'ok',stderr:'',timedOut:false,durationMs:12}
    :operation.operation==='start'?{pid:42,logPath:'docker:xroga-process-'+'b'.repeat(32)}
    :operation.operation==='stop'?{stopped:true}:{logs:'owned-logs'});
   return result as T;
  }} };
 const input:ProviderRuntimeCreateInput={userId:'11111111-1111-4111-8111-111111111111',projectId:'owned-project',runtimeClass:'interactive',
  files:[{path:'src/index.ts',content:'owned-source'}],image:null,environment:{},secretEnvironment:{},ttlSeconds:600};
 return {options,input,provider:new GoogleProjectRuntimeProvider(options),operations,sessions,
  get creates(){return creates;},get destroys(){return destroys;},get dispatches(){return dispatches;},get last(){return last;},
  deny(){denied=true;},denyAfterLogin(){denyDuringAdmission=true;},failPersistence(){persistFailure=true;},setReply(value:unknown){reply=value;}};
}

test('native project allocation persists its owner binding before transferring canonical files',async()=>{
 const f=fixture();const session=await f.provider.create(f.input);
 assert.equal(f.creates,1);assert.equal(f.sessions.length,1);assert.equal((f.sessions[0] as {status:string}).status,'creating');
 assert.equal(session.status,'running');assert.equal(session.providerId,'google-gce');assert.equal(session.image,f.options.defaultImage);
 assert.deepEqual(session.knownFiles,['src/index.ts']);assert.equal(f.destroys,0);
 assert.deepEqual(f.operations[0],{operation:'write_files',files:f.input.files});
});

test('denied ownership and invalid files cannot allocate or dispatch a worker',async()=>{
 const f=fixture();f.deny();await assert.rejects(f.provider.create(f.input));assert.equal(f.creates,0);assert.equal(f.dispatches,0);
 for(const path of ['../escape','/etc/passwd','C:\\host','a//b']){
  const clean=fixture();await assert.rejects(clean.provider.create({...clean.input,files:[{path,content:'bad'}]}));
  assert.equal(clean.creates,0);assert.equal(clean.dispatches,0);
 }
 assert.throws(()=>googleWorkspaceFiles([{path:'a',content:'one'},{path:'./a',content:'two'}]));
});

test('allocation persistence or malformed write receipt fails closed and destroys only the allocated worker',async()=>{
 for(const mode of ['persistence','receipt']){
  const f=fixture();if(mode==='persistence')f.failPersistence();else f.setReply({written:[]});
  await assert.rejects(f.provider.create(f.input),error=>error instanceof Error&&!error.message.includes('PRIVATE_DB_CANARY'));
  assert.equal(f.creates,1);assert.equal(f.destroys,1);assert.equal(f.dispatches,mode==='persistence'?0:1);
 }
});

test('revocation during admission prevents execution, never retries or switches provider',async()=>{
 const f=fixture();const session=await f.provider.create(f.input);const before=f.dispatches;f.denyAfterLogin();
 await assert.rejects(f.provider.exec(session,{command:'node',args:['--version'],environment:{},secretEnvironment:{PROJECT_TOKEN:'PRIVATE_PROJECT_CANARY'}}));
 assert.equal(f.dispatches,before);assert.equal(f.creates,1);assert.equal(f.operations.some(op=>JSON.stringify(op).includes('PRIVATE_PROJECT_CANARY')),false);
});

test('native execution uses exact operation secrets, safe cwd and confirmed receipts',async()=>{
 const f=fixture();const session=await f.provider.create(f.input);
 const result=await f.provider.exec(session,{command:'node',args:['--version'],cwd:'src',environment:{MODE:'test'},secretEnvironment:{PROJECT_TOKEN:'PRIVATE_PROJECT_CANARY'}});
 assert.equal(result.exitCode,0);const operation=f.operations.at(-1)!;
 assert.equal(operation.timeoutMs,120000);assert.equal(operation.networkPolicy,'none');
 assert.deepEqual(operation.command,['/bin/sh','-c','cd -- "$1" && shift && exec "$@"','xroga-cwd','/work/src','node','--version']);
 assert.equal((operation.environment as Record<string,string>).PROJECT_TOKEN,'PRIVATE_PROJECT_CANARY');
 assert.equal(JSON.stringify(session).includes('PRIVATE_PROJECT_CANARY'),false);
 f.setReply({exitCode:0});await assert.rejects(f.provider.exec(session,{command:'true',environment:{},secretEnvironment:{}}),{message:'GCE_EXECUTION_RECEIPT_INVALID'});
});

test('foreign durable handle or changed infrastructure cannot restore, read or destroy a different runtime',async()=>{
 const f=fixture();const session=await f.provider.create(f.input);const foreign=structuredClone(session);
 (foreign.providerState.gce as GceExecutionHandle).ownerBinding='f'.repeat(40);
 await assert.rejects(f.provider.restore(foreign),{message:'GCE_SESSION_REFERENCE_INVALID'});
 await assert.rejects(f.provider.readFile(foreign,'src/index.ts'),{message:'GCE_SESSION_REFERENCE_INVALID'});
 await assert.rejects(f.provider.destroy(foreign),{message:'GCE_SESSION_REFERENCE_INVALID'});
 assert.equal(f.destroys,0);
});
