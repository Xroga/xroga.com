import {randomUUID} from 'node:crypto';
import type {ProjectFile} from '../../ai/patches.js';
import {DEFAULT_SANDBOX_LIMITS} from '../../sandbox/sandboxTypes.js';
import {buildSandboxEnvironment, SANDBOX_ALLOWED_PASSTHROUGH} from '../../sandbox/sandboxEnvironment.js';
import {executionBinding, GceControlError, type GceExecutionHandle, type GceMachineControl} from '../../sandbox/google/gceMachineControl.js';
import {TenantAccessError} from '../../security/tenantErrors.js';
import type {GceSshTransport} from '../../sandbox/google/gceSshTransport.js';
import type {AdmitGoogleRuntime, GoogleRuntimeAction} from './googleAuthority.js';
import {PROJECT_RUNTIME_SCHEMA_VERSION, type ProjectRuntimeProvider, type ProjectRuntimeSession,
  type ProviderRuntimeCreateInput, type ProviderRuntimeCommand, type ProviderRuntimeProcessStartInput,
  type ProjectRuntimeProcessRecord, type RuntimeSnapshot} from './types.js';

const fail=(code:string):never=>{throw new GceControlError(code);};
const MAX_BYTES=2*1024*1024;
export function googleWorkspacePath(value:string):string {
  if(typeof value!=='string')return fail('INVALID_WORKSPACE_PATH');
  const normalized=value.replaceAll('\\','/').replace(/^(?:\.\/)+/,'');
  if(!normalized || normalized.includes('\0') || normalized.includes(':') || Buffer.byteLength(normalized)>2048
    || normalized.split('/').some(part=>!part||part==='.'||part==='..'||Buffer.byteLength(part)>255))return fail('INVALID_WORKSPACE_PATH');
  return normalized;
}
export function googleWorkspaceFiles(files:readonly ProjectFile[]):ProjectFile[][] {
  if(!Array.isArray(files)||files.length>20000)return fail('INVALID_WORKSPACE_FILES');
  const batches:ProjectFile[][]=[];const seen=new Set<string>();let batch:ProjectFile[]=[];let size=0;
  for(const value of files){
    if(!value||typeof value.content!=='string')return fail('INVALID_WORKSPACE_FILES');
    const file={path:googleWorkspacePath(value.path),content:value.content};
    const bytes=Buffer.byteLength(file.content);const wire=Buffer.byteLength(JSON.stringify(file));
    if(bytes>MAX_BYTES||wire>3*1024*1024||seen.has(file.path))return fail('INVALID_WORKSPACE_FILES');
    seen.add(file.path);
    // Bound JSON expansion as well as UTF-8 data, before provisioning anything.
    if(batch.length && (size+wire>1024*1024||batch.length===1000)){batches.push(batch);batch=[];size=0;}
    batch.push(file);size+=wire;
  }
  if(batch.length)batches.push(batch);
  return batches;
}

type Control=Pick<GceMachineControl,'configuration'|'probe'|'create'|'resolve'|'destroy'>;
type Transport=Pick<GceSshTransport,'run'>;
export interface GoogleProjectRuntimeOptions {
  control: Control;
  transport: Transport;
  defaultImage: string;
  admit: AdmitGoogleRuntime;
  /** Existing session store records allocation before workspace/credential dispatch. */
  persistAllocation: (session:ProjectRuntimeSession)=>Promise<void>;
  nativeIdentity: ()=>Promise<void>;
  request?: typeof fetch;
}

/** Physical provider under the existing runtime manager, never a scheduler or
 * authority issuer. Failed admission does not select Fly or create another VM. */
export class GoogleProjectRuntimeProvider implements ProjectRuntimeProvider {
  readonly id='google-gce';
  readonly capabilities={persistentSessions:true,persistentProcesses:true,fileReadWrite:true,commandExec:true,
    snapshots:true,portDiscovery:false,publicPortExposure:false,secretInjection:true,networkIsolation:true} as const;
  constructor(private readonly options:GoogleProjectRuntimeOptions){
    if(!options.control.configuration.admittedImages.includes(options.defaultImage))fail('GCE_DEFAULT_IMAGE_NOT_ADMITTED');
  }
  async probe(){
    try{await this.options.nativeIdentity();await this.options.control.probe();return{available:true,providerId:this.id,detail:'Native Google control and pinned base image verified.'};}
    catch{return{available:false,providerId:this.id,detail:'Native Google runtime is unavailable.'};}
  }
  private handle(session:ProjectRuntimeSession):GceExecutionHandle {
    const value=session.providerState.gce as GceExecutionHandle|undefined;
    if(session.providerId!==this.id||!value||value.runtimeId!==session.sessionId)return fail('GCE_SESSION_REFERENCE_INVALID');
    const expected=executionBinding({runtimeId:session.sessionId,ownerReference:session.userId,scopeReference:session.projectId,
      ttlSeconds:60,memoryMb:128,diskMb:64,maxProcesses:16,cpus:1});
    if(value.ownerBinding!==expected.ownerBinding||value.projectBinding!==expected.projectBinding)return fail('GCE_SESSION_REFERENCE_INVALID');
    const configuration=this.options.control.configuration;
    if(session.providerState.project!==configuration.project||session.providerState.zone!==configuration.zone
      ||session.providerState.baseImageId!==configuration.imageId||!session.image
      ||!configuration.admittedImages.includes(session.image))return fail('GCE_SESSION_CONFIGURATION_CHANGED');
    return structuredClone(value);
  }
  private admission(session:ProjectRuntimeSession,action:GoogleRuntimeAction){
    return ()=>this.options.admit({userId:session.userId,projectId:session.projectId,session,action});
  }
  private async call<T>(session:ProjectRuntimeSession,action:GoogleRuntimeAction,operation:Record<string,unknown>,timeout=30000):Promise<T>{
    const captured=structuredClone(session);const handle=this.handle(captured);
    const payload=structuredClone(operation);
    const admit=()=>this.options.admit({userId:captured.userId,projectId:captured.projectId,session:captured,action,
      sourceFiles:payload.operation==='write_files'?payload.files as ProjectFile[]:undefined,
      deletePaths:payload.operation==='delete_files'?payload.paths as string[]:undefined});
    await admit();
    return this.options.transport.run<T>(handle,payload,timeout,admit);
  }
  async create(value:ProviderRuntimeCreateInput):Promise<ProjectRuntimeSession>{
    const input=structuredClone(value);const batches=googleWorkspaceFiles(input.files);
    if(Object.keys(input.secretEnvironment).length)fail('GCE_SESSION_ENVIRONMENT_MUST_BE_OPERATION_SCOPED');
    const publicEnvironment=buildSandboxEnvironment(input.environment);
    const creationNames=new Set([...SANDBOX_ALLOWED_PASSTHROUGH,...Object.keys(buildSandboxEnvironment({},{})),'XROGA_PREVIEW']);
    if(Object.keys(publicEnvironment).some(name=>!creationNames.has(name)))fail('GCE_SESSION_ENVIRONMENT_MUST_BE_OPERATION_SCOPED');
    const image=input.image??this.options.defaultImage;
    if(!this.options.control.configuration.admittedImages.includes(image))fail('GCE_IMAGE_NOT_ADMITTED');
    const limits={...DEFAULT_SANDBOX_LIMITS,...input.limits};
    if(!Number.isInteger(limits.cpuSeconds)||limits.cpuSeconds<1||limits.cpuSeconds>7200)fail('INVALID_GCE_EXECUTION_BOUNDS');
    const creation={runtimeId:randomUUID(),ownerReference:input.userId,scopeReference:input.projectId,
      ttlSeconds:input.ttlSeconds,memoryMb:limits.memoryMb,diskMb:limits.diskMb,maxProcesses:limits.maxProcesses,
      cpus:Math.min(2,Math.max(1,Math.ceil(limits.cpuSeconds/60)))};
    executionBinding(creation);
    const admit=()=>this.options.admit({userId:input.userId,projectId:input.projectId,action:'create',sourceFiles:input.files});
    await admit();
    let handle:GceExecutionHandle|undefined;
    let session:ProjectRuntimeSession|undefined;
    try{
      const allocated=await this.options.control.create(creation,async value=>{
      handle=structuredClone(value);await admit();
      const now=new Date().toISOString();
      const pending:ProjectRuntimeSession={schemaVersion:PROJECT_RUNTIME_SCHEMA_VERSION,sessionId:handle.runtimeId,
        userId:input.userId,projectId:input.projectId,providerId:this.id,runtimeClass:input.runtimeClass,status:'creating',image,
        workspaceRevision:0,knownFiles:batches.flat().map(file=>file.path),processes:[],ports:[],
        providerState:{gce:handle,project:this.options.control.configuration.project,zone:this.options.control.configuration.zone,
          baseImageId:this.options.control.configuration.imageId},createdAt:now,updatedAt:now,
        expiresAt:new Date(handle.expiresAtEpoch*1000).toISOString()};
      await this.options.persistAllocation(structuredClone(pending));session=pending;
      });
      handle=allocated;
      const saved=session as ProjectRuntimeSession|undefined;
      if(!saved||JSON.stringify(saved.providerState.gce)!==JSON.stringify(allocated))fail('GCE_ALLOCATION_RECEIPT_MISSING');
      for(const files of batches){
        const result=await this.options.transport.run<{written?:unknown}>(handle,{operation:'write_files',files},30000,admit);
        if(JSON.stringify(result.written)!==JSON.stringify(files.map(file=>file.path)))fail('GCE_WORKSPACE_WRITE_RECEIPT_INVALID');
      }
      return {...saved!,status:'running',workspaceRevision:1,updatedAt:new Date().toISOString()};
    }catch(error){
      if(handle){try{await this.options.control.destroy(handle);}catch{fail('GCE_ALLOCATION_CLEANUP_PENDING');}}
      if(error instanceof GceControlError || error instanceof TenantAccessError)throw error;
      return fail('GCE_RUNTIME_CREATION_FAILED');
    }
  }
  async restore(value:ProjectRuntimeSession):Promise<ProjectRuntimeSession>{
    const session=structuredClone(value);await this.admission(session,'restore')();
    await this.options.control.resolve(this.handle(session));
    return {...session,status:'running',updatedAt:new Date().toISOString()};
  }
  async destroy(value:ProjectRuntimeSession):Promise<void>{
    const session=structuredClone(value);await this.admission(session,'destroy')();
    await this.options.control.destroy(this.handle(session));
  }
  async writeFiles(session:ProjectRuntimeSession,files:readonly ProjectFile[]):Promise<void>{
    for(const batch of googleWorkspaceFiles(files)){
      const result=await this.call<{written?:unknown}>(session,'write',{operation:'write_files',files:batch});
      if(JSON.stringify(result.written)!==JSON.stringify(batch.map(file=>file.path)))fail('GCE_WORKSPACE_WRITE_RECEIPT_INVALID');
    }
  }
  async deleteFiles(session:ProjectRuntimeSession,values:readonly string[]):Promise<void>{
    const paths=values.map(googleWorkspacePath);
    if(new Set(paths).size!==paths.length)fail('INVALID_WORKSPACE_FILES');
    for(let index=0;index<paths.length;index+=1000){
      const selected=paths.slice(index,index+1000);
      const result=await this.call<{deleted?:unknown}>(session,'write',{operation:'delete_files',paths:selected});
      if(!Array.isArray(result.deleted)||result.deleted.some(path=>typeof path!=='string'||!selected.includes(path))
        ||new Set(result.deleted).size!==result.deleted.length)fail('GCE_WORKSPACE_DELETE_RECEIPT_INVALID');
    }
  }
  async readFile(session:ProjectRuntimeSession,path:string):Promise<string|null>{
    const result=await this.call<{content?:unknown}>(session,'read',{operation:'read_file',path:googleWorkspacePath(path)});
    if(result.content!==null&&typeof result.content!=='string')return fail('GCE_WORKSPACE_READ_RECEIPT_INVALID');
    return result.content;
  }
  private command(session:ProjectRuntimeSession,input:ProviderRuntimeCommand|ProviderRuntimeProcessStartInput,timeoutMs:number){
    if(!['none','registry-only','preview'].includes(input.networkPolicy??'none'))fail('GCE_NETWORK_POLICY_NOT_ADMITTED');
    const cwd=input.cwd&&input.cwd!=='.'?googleWorkspacePath(input.cwd):'';
    const command=[input.command,...(input.args??[])];
    if(command.some(value=>typeof value!=='string'||value.includes('\0'))||!command[0])fail('INVALID_COMMAND');
    return {image:session.image,networkPolicy:input.networkPolicy??'none',
      command:cwd?['/bin/sh','-c','cd -- "$1" && shift && exec "$@"','xroga-cwd','/work/'+cwd,...command]:command,
      environment:{...buildSandboxEnvironment({...(session.runtimeClass==='interactive'?{XROGA_PREVIEW:'1'}:{}),...input.environment}),...input.secretEnvironment},
      timeoutMs};
  }
  async exec(session:ProjectRuntimeSession,input:ProviderRuntimeCommand){
    const payload=this.command(session,input,input.timeoutMs??120000);
    const result=await this.call<{exitCode:unknown;stdout:unknown;stderr:unknown;timedOut:unknown;killedForLimit:unknown;durationMs:unknown}>(session,'exec',{operation:'exec',...payload},payload.timeoutMs);
    if((result.exitCode!==null&&!Number.isInteger(result.exitCode))||typeof result.stdout!=='string'
      ||typeof result.stderr!=='string'||typeof result.timedOut!=='boolean'||typeof result.killedForLimit!=='boolean'||typeof result.durationMs!=='number'
      ||!Number.isFinite(result.durationMs)||result.durationMs<0)fail('GCE_EXECUTION_RECEIPT_INVALID');
    return {exitCode:result.exitCode as number|null,stdout:result.stdout as string,stderr:result.stderr as string,
      timedOut:result.timedOut as boolean,killedForLimit:result.killedForLimit as boolean,durationMs:result.durationMs as number};
  }
  async probeProcess(session:ProjectRuntimeSession,process:ProjectRuntimeProcessRecord):Promise<boolean>{
    const captured=structuredClone(session);const handle=this.handle(captured);
    const saved=captured.processes.find(item=>item.processId===process.processId);
    if(captured.status!=='running'||!saved||saved.status!=='running'||saved.port!==3000
      ||saved.pid!==process.pid||saved.logPath!==process.logPath||process.port!==3000)fail('GCE_PREVIEW_PROCESS_NOT_ADMITTED');
    const admit=this.admission(captured,'read');await admit();
    const target=await this.options.control.resolve(handle);
    if(!/^10\.90\.0\.(?:[2-9]|[1-5][0-9]|6[0-2])$/.test(target.privateIp))fail('GCE_PREVIEW_ADDRESS_NOT_ADMITTED');
    await admit();
    // A separate command container has a different localhost namespace. Probe
    // the same fixed private endpoint used by the signed Preview gateway.
    let ready=false;
    try{
      const response=await (this.options.request??fetch)(`http://${target.privateIp}:3000/`,
        {redirect:'error',signal:AbortSignal.timeout(5000)});
      ready=response.status<500;await response.body?.cancel();
    }catch{ready=false;}
    await admit();return ready;
  }
  async startProcess(session:ProjectRuntimeSession,input:ProviderRuntimeProcessStartInput){
    const payload=this.command(session,input,600000);
    const result=await this.call<{pid:unknown;logPath:unknown}>(session,'start',{operation:'start',...payload,
      port:input.port??null,restartPolicy:input.restartPolicy??'never'});
    if(!Number.isInteger(result.pid)||Number(result.pid)<1||typeof result.logPath!=='string'
      ||!/^docker:xroga-process-[a-f0-9]{32}$/.test(result.logPath))fail('GCE_PROCESS_RECEIPT_INVALID');
    return {pid:result.pid as number,logPath:result.logPath as string};
  }
  async stopProcess(session:ProjectRuntimeSession,process:ProjectRuntimeProcessRecord):Promise<void>{
    const result=await this.call<{stopped?:unknown}>(session,'stop',{operation:'stop',pid:process.pid,processReference:process.logPath});
    if(result.stopped!==true)fail('GCE_PROCESS_STOP_NOT_CONFIRMED');
  }
  async processLogs(session:ProjectRuntimeSession,process:ProjectRuntimeProcessRecord):Promise<string>{
    const result=await this.call<{logs?:unknown}>(session,'logs',{operation:'logs',pid:process.pid,processReference:process.logPath});
    if(typeof result.logs!=='string')return fail('GCE_PROCESS_LOG_RECEIPT_INVALID');return result.logs;
  }
  async snapshot(session:ProjectRuntimeSession):Promise<RuntimeSnapshot>{
    const paths=session.knownFiles.map(googleWorkspacePath);const files:ProjectFile[]=[];
    for(let offset=0;offset<paths.length;offset+=1000){
      const selected=paths.slice(offset,offset+1000);
      const stat=await this.call<{files:{path:string;size:number|null}[]}>(session,'read',{operation:'stat_files',paths:selected});
      if(!Array.isArray(stat.files)||stat.files.length!==selected.length||stat.files.some((value,index)=>value.path!==selected[index]
        ||(value.size!==null&&(!Number.isInteger(value.size)||value.size<0||value.size>MAX_BYTES))))fail('GCE_WORKSPACE_STAT_RECEIPT_INVALID');
      let batch:string[]=[];let size=0;
      const read=async()=>{
        if(!batch.length)return;
        const result=await this.call<{files:{path:string;content:string|null}[]}>(session,'read',{operation:'read_files',paths:batch});
        if(!Array.isArray(result.files)||result.files.length!==batch.length||result.files.some((file,index)=>file.path!==batch[index]
          ||(file.content!==null&&typeof file.content!=='string')))fail('GCE_WORKSPACE_READ_RECEIPT_INVALID');
        for(const file of result.files)if(file.content!==null)files.push({path:file.path,content:file.content});
        batch=[];size=0;
      };
      for(const info of stat.files){
        if(info.size===null)continue;
        if(batch.length&&(size+info.size>1024*1024||batch.length===100))await read();
        batch.push(info.path);size+=info.size;
      }
      await read();
    }
    return {files,createdAt:new Date().toISOString()};
  }
  async exposePort(){return null;}
}
