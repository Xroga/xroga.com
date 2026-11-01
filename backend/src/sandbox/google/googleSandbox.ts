import {attachedGceIdentity,GceMachineControl,GceControlError} from './gceMachineControl.js';
import {GceSshTransport} from './gceSshTransport.js';
import {googleExecutionConfiguration,verifyAttachedGoogleIdentity} from '../../synthesis/projectRuntime/googleFactory.js';
import {GoogleProjectRuntimeProvider} from '../../synthesis/projectRuntime/googleProvider.js';
import {SupabaseProjectRuntimeStore,type ProjectRuntimeStore} from '../../synthesis/projectRuntime/store.js';
import type {ProjectRuntimeSession} from '../../synthesis/projectRuntime/types.js';
import {requireSandboxExecutionBinding,withSandboxAdmissionDeadline,type SandboxExecutionBinding} from './executionBinding.js';
import {SandboxAdmissionError,SandboxUnavailableError,type SandboxExecutionRequest,type SandboxExecutionResult,type SandboxRuntime} from '../sandboxTypes.js';

const deniedCodes=new Set(['GCE_EXECUTION_CAPACITY_RESERVED','GCE_CONTROL_PERMISSION_DENIED',
  'GCE_RUNTIME_IDENTITY_OR_OWNER_MISMATCH','GCE_BOOT_DISK_IDENTITY_MISMATCH','GCE_RUNTIME_NETWORK_MISMATCH',
  'GCE_RUNTIME_PRIVATE_ADDRESS_MISMATCH','GCE_RUNTIME_EXPIRED_OR_INVALID','GCE_SESSION_REFERENCE_INVALID',
  'GCE_SESSION_CONFIGURATION_CHANGED','GCE_IMAGE_NOT_ADMITTED','NATIVE_OS_LOGIN_ADMISSION_DENIED',
  'NATIVE_SSH_TARGET_CHANGED_DURING_ADMISSION','NATIVE_SSH_HOST_KEY_REJECTED','NATIVE_SSH_PUBLIC_KEY_NOT_ADMITTED',
  'NATIVE_SSH_REMOTE_ADMIN_DENIED','NATIVE_EXECUTION_RUNTIME_BINDING_MISMATCH','NATIVE_EXECUTION_RUNTIME_EXPIRED',
  'NATIVE_EXECUTION_IMAGE_NOT_ADMITTED']);
const admissionDenied=(error:unknown)=>error instanceof GceControlError&&deniedCodes.has(error.code);

export function snapshotSandboxRequest(request:SandboxExecutionRequest):SandboxExecutionRequest {
  return {...request,files:request.files.map(file=>({...file})),sourceFiles:request.sourceFiles?.map(file=>({...file})),
    args:[...request.args],environment:{...request.environment},limits:{...request.limits},
    stages:request.stages?.map(stage=>({...stage,args:[...stage.args]}))};
}

interface SandboxDependencies {
  admissionTimeoutMs?:number;
  provider:(binding:SandboxExecutionBinding,store:ProjectRuntimeStore,
    admit:ConstructorParameters<typeof GoogleProjectRuntimeProvider>[0]['admit'],
    allocated:(session:ProjectRuntimeSession)=>Promise<void>)=>Pick<GoogleProjectRuntimeProvider,'create'|'exec'|'destroy'>;
  store:()=>ProjectRuntimeStore;
  authority:typeof requireSandboxExecutionBinding;
  probe:()=>Promise<void>;
}

export class GoogleSandboxCleanupPendingError extends SandboxUnavailableError {
  readonly cleanupCode='GCE_ALLOCATION_CLEANUP_PENDING';
  constructor(){super({available:false,runtime:'google-gce',reason:'runtime_unhealthy',detail:'Native allocation cleanup is not yet verified.'});}
}

/** One disposable VM per existing sandbox execution, with optional sequential
 * container stages sharing its quota-bound workspace. Never a task scheduler. */
export class GoogleSandboxRuntime implements SandboxRuntime {
  readonly name='google-gce';
  private readonly dependencies:SandboxDependencies;
  constructor(env:Readonly<NodeJS.ProcessEnv>=process.env,fixtures?:SandboxDependencies){
    if(fixtures){this.dependencies=fixtures;return;}
    const configuration=googleExecutionConfiguration(env);const identity=attachedGceIdentity(env);
    const control=new GceMachineControl(configuration,identity);const transport=new GceSshTransport(control,identity);
    const nativeIdentity=()=>verifyAttachedGoogleIdentity(configuration.serviceAccount);
    this.dependencies={authority:requireSandboxExecutionBinding,store:()=>new SupabaseProjectRuntimeStore(),
      probe:async()=>{await nativeIdentity();await control.probe();},
      provider:(_binding,_store,admit,allocated)=>new GoogleProjectRuntimeProvider({control,transport,
        defaultImage:env.XROGA_GCE_DEFAULT_IMAGE??'',admit:async scope=>{await admit(scope);await nativeIdentity();},
        nativeIdentity,persistAllocation:allocated})};
  }
  async probe(){
    try{await this.dependencies.probe();return{available:true,runtime:this.name,networkIsolation:true};}
    catch{return{available:false,runtime:this.name,networkIsolation:true,reason:'runtime_unavailable' as const,detail:'Native Google sandbox is unavailable.'};}
  }
  async execute(value:SandboxExecutionRequest):Promise<SandboxExecutionResult>{
    const request=snapshotSandboxRequest(value);const started=Date.now();
    const authorize=(cleanup=false)=>withSandboxAdmissionDeadline(this.dependencies.authority(request,cleanup),this.dependencies.admissionTimeoutMs??5000);
    const binding=await authorize();
    if(request.signal?.aborted)throw new SandboxAdmissionError();
    if(!Number.isInteger(request.timeoutMs)||request.timeoutMs<1||request.timeoutMs>600000)throw new SandboxAdmissionError();
    const stages=request.stages??[{id:'command',command:request.command,args:request.args,networkPolicy:request.networkPolicy,timeoutMs:request.timeoutMs}];
    if(!stages.length||stages.length>10||new Set(stages.map(stage=>stage.id)).size!==stages.length
      ||stages.some(stage=>!stage.id||!Number.isInteger(stage.timeoutMs)||stage.timeoutMs<1||stage.timeoutMs>request.timeoutMs
        ||!['none','registry-only','preview'].includes(stage.networkPolicy))
      ||stages.reduce((sum,stage)=>sum+stage.timeoutMs,0)>request.timeoutMs)throw new SandboxAdmissionError();
    const store=this.dependencies.store();let allocation:ProjectRuntimeSession|undefined;let revoked=false;let checking=false;
    let cleanupPromise:Promise<void>|undefined;let timer:ReturnType<typeof setInterval>|undefined;
    let authorityDeadline:ReturnType<typeof setTimeout>|undefined;
    let terminalDenial:SandboxAdmissionError|undefined;
    const provider=this.dependencies.provider(binding,store,async scope=>{
      const current=await authorize(scope.action==='destroy');
      if(current!==binding||scope.userId!==binding.userId||scope.projectId!==binding.projectId
        ||(scope.action!=='destroy'&&(revoked||request.signal?.aborted)))throw new SandboxAdmissionError();
      if(allocation&&scope.action!=='destroy'){
        const persisted=await withSandboxAdmissionDeadline(store.loadSession(binding.userId,allocation.sessionId),this.dependencies.admissionTimeoutMs??5000);
        if(!persisted||persisted.projectId!==binding.projectId||persisted.userId!==binding.userId
          ||JSON.stringify(persisted.providerState)!==JSON.stringify(allocation.providerState)
          ||['failed','destroyed'].includes(persisted.status))throw new SandboxAdmissionError();
      }
    },async session=>{
      await store.saveSession(session);allocation=structuredClone(session);
      await store.appendEvent({userId:binding.userId,projectId:binding.projectId,sessionId:session.sessionId,eventType:'sandbox.allocated',
        payload:{runId:binding.runId,caller:binding.caller,requestSha256:binding.requestSha256,image:session.image}});
    });
    const cleanup=():Promise<void>=>cleanupPromise??=(async()=>{
      if(!allocation)return;await provider.destroy(allocation);
      await store.saveSession({...allocation,status:'destroyed',updatedAt:new Date().toISOString()});
      await store.appendEvent({userId:binding.userId,projectId:binding.projectId,sessionId:allocation.sessionId,eventType:'sandbox.destroyed',
        payload:{runId:binding.runId,requestSha256:binding.requestSha256}});
    })();
    const cancel=()=>{revoked=true;void cleanup().catch(()=>{});};
    const records:(SandboxExecutionResult&{id:string;networkPolicy:typeof request.networkPolicy})[]=[];
    try{
      const session=await provider.create({userId:binding.userId,projectId:binding.projectId,runtimeClass:'verification',
        files:request.files,image:request.image??null,environment:{},secretEnvironment:{},limits:request.limits,
        ttlSeconds:Math.ceil(request.timeoutMs/1000)+240});
      allocation=session;await store.saveSession(session);
      request.signal?.addEventListener('abort',cancel,{once:true});
      timer=setInterval(()=>{
        if(checking||revoked)return;checking=true;
        authorityDeadline=setTimeout(cancel,5000);
        void authorize().catch(cancel).finally(()=>{
          if(authorityDeadline)clearTimeout(authorityDeadline);checking=false;
        });
      },1500);timer.unref();
      const deadline=Date.now()+request.timeoutMs;
      for(const stage of stages){
        await authorize();
        if(revoked||request.signal?.aborted)throw new SandboxAdmissionError();
        const remaining=deadline-Date.now();
        if(remaining<=0)return{exitCode:null,stdout:'',stderr:'Sandbox execution deadline reached.',timedOut:true,killedForLimit:false,durationMs:Date.now()-started,stages:records};
        const result=await provider.exec(session,{command:stage.command,args:[...stage.args],cwd:stage.cwd,
          timeoutMs:Math.min(stage.timeoutMs,remaining),networkPolicy:stage.networkPolicy,environment:request.environment,secretEnvironment:{}});
        if(revoked||request.signal?.aborted)throw new SandboxAdmissionError();
        await authorize();
        records.push({...result,id:stage.id,networkPolicy:stage.networkPolicy});
        await store.appendEvent({userId:binding.userId,projectId:binding.projectId,sessionId:session.sessionId,eventType:'sandbox.stage_completed',
          payload:{runId:binding.runId,requestSha256:binding.requestSha256,stageId:stage.id,networkPolicy:stage.networkPolicy,
            exitCode:result.exitCode,timedOut:result.timedOut,killedForLimit:result.killedForLimit,durationMs:result.durationMs}});
        await authorize();
        if(result.killedForLimit)throw new SandboxUnavailableError({available:false,runtime:this.name,reason:'runtime_unhealthy',detail:'Sandbox verification stopped at its execution limit.'});
        if(result.exitCode!==0||result.timedOut)break;
      }
      const last=records.at(-1)!;
      return{...last,stdout:records.map(record=>record.stdout).join('\n'),stderr:records.map(record=>record.stderr).join('\n'),
        durationMs:Date.now()-started,stages:records};
    }catch(error){
      if(error instanceof GceControlError&&error.code==='GCE_ALLOCATION_CLEANUP_PENDING'){
        if(revoked||request.signal?.aborted){
          terminalDenial=new SandboxAdmissionError();terminalDenial.cleanupPending=true;throw terminalDenial;
        }
        throw new GoogleSandboxCleanupPendingError();
      }
      if(error instanceof SandboxAdmissionError||revoked||request.signal?.aborted||admissionDenied(error)){
        terminalDenial=error instanceof SandboxAdmissionError?error:new SandboxAdmissionError();throw terminalDenial;
      }
      if(error instanceof SandboxUnavailableError)throw error;
      throw new SandboxUnavailableError({available:false,runtime:this.name,reason:'runtime_unhealthy',detail:'Native Google execution did not produce verified completion.'});
    }finally{
      if(timer)clearInterval(timer);if(authorityDeadline)clearTimeout(authorityDeadline);request.signal?.removeEventListener('abort',cancel);
      try{await cleanup();}catch(error){
        if(terminalDenial||admissionDenied(error)){
          const denial=terminalDenial??new SandboxAdmissionError();denial.cleanupPending=true;throw denial;
        }
        throw new GoogleSandboxCleanupPendingError();
      }
    }
  }
}
