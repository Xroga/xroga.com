import {createHash} from 'node:crypto';
import {captureCurrentRunAttempt,assertCurrentRunAttempt,requireAdmittedRunAttempt,type AdmittedRunAttempt} from '../../ai/runStore.js';
import {SupabaseExecutionStateStore,type CanonicalExecutionState} from '../../ai/executionRuntime.js';
import {SupabaseSoftwareAgentCheckpointStore,softwareAgentBaseFingerprint,workingFilesFromCheckpoint,type SoftwareAgentCheckpoint} from '../../ai/softwareAgent/softwareAgentCheckpoint.js';
import {getSupabaseAdmin} from '../../config/supabase.js';
import {COLLECTOR_PATH,STATIC_SERVER_PATH} from '../../synthesis/inSandboxBrowser.js';
import {SandboxAdmissionError,type SandboxExecutionRequest} from '../sandboxTypes.js';
import type {ProjectFile} from '../../ai/patches.js';
import {compileDefaultConfigFile} from '../../ai/compileCommand.js';

export type SandboxCaller='compile-validator'|'universal-validation'|'software-agent-command'|'browser-verification';
export interface SandboxExecutionBinding {
  readonly runId:string;
  readonly userId:string;
  readonly projectId:string;
  readonly caller:SandboxCaller;
  readonly requestSha256:string;
}
interface IssuedBinding {attempt:AdmittedRunAttempt;state:CanonicalExecutionState;}
const issued=new WeakMap<object,IssuedBinding>();
const refuse=():never=>{throw new SandboxAdmissionError();};

export async function withSandboxAdmissionDeadline<T>(work:Promise<T>,timeoutMs=5000):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new SandboxAdmissionError()),timeoutMs);})]);}
  finally{if(timer)clearTimeout(timer);}
}

function fingerprint(request:SandboxExecutionRequest):string {
  return createHash('sha256').update(JSON.stringify({files:request.files,sourceFiles:request.sourceFiles,
    command:request.command,args:request.args,timeoutMs:request.timeoutMs,networkPolicy:request.networkPolicy,
    environment:request.environment,limits:request.limits,image:request.image,stages:request.stages})).digest('hex');
}
function subset(files:readonly ProjectFile[],canonical:readonly ProjectFile[]):boolean {
  const values=new Map(canonical.map(file=>[file.path,file.content]));
  return files.every(file=>values.has(file.path)&&values.get(file.path)===file.content);
}

/** Data provenance only. Permission still requires the issued current run and
 * fresh owner/project checks. No helper result promotes upstream audit callers. */
export function sandboxSourceMatches(caller:SandboxCaller,source:readonly ProjectFile[],state:CanonicalExecutionState,
  checkpoint:SoftwareAgentCheckpoint|null):boolean {
  if(subset(source,state.currentWorkingSnapshot))return true;
  if(caller!=='software-agent-command'||!checkpoint||checkpoint.runId!==state.runId
    ||![state.projectId,state.databaseProjectId??null].includes(checkpoint.projectId)
    ||checkpoint.baseFingerprint!==softwareAgentBaseFingerprint(state.currentWorkingSnapshot))return false;
  const repository=checkpoint.repository;
  if(state.repository ? !repository||repository.owner!==state.repository.owner||repository.repo!==state.repository.name
    ||repository.branch!==state.selectedBranch||(repository.sourceCommit??null)!==state.startingCommitSha : repository!==null)return false;
  return subset(source,workingFilesFromCheckpoint(state.currentWorkingSnapshot,checkpoint));
}

async function currentState(attempt:AdmittedRunAttempt):Promise<CanonicalExecutionState> {
  await assertCurrentRunAttempt(attempt);
  const state=await new SupabaseExecutionStateStore(attempt.userId).load(attempt.runId);
  if(!state||state.runId!==attempt.runId||!state.projectId)return refuse();
  if(state.databaseProjectId){
    const {data,error}=await getSupabaseAdmin().from('projects').select('id')
      .eq('id',state.databaseProjectId).eq('user_id',attempt.userId).maybeSingle();
    if(error||data?.id!==state.databaseProjectId)return refuse();
  }
  await assertCurrentRunAttempt(attempt);return state;
}

/** Called at the four inspected first-party executor seams. Does not issue a
 * tenant identity, consume a raw user ID, or create a run. */
export async function issueSandboxExecutionBinding(caller:SandboxCaller,request:SandboxExecutionRequest):Promise<SandboxExecutionBinding> {
  try{return await withSandboxAdmissionDeadline((async()=>{
    if(!['compile-validator','universal-validation','software-agent-command','browser-verification'].includes(caller))return refuse();
    const attempt=captureCurrentRunAttempt();const state=await currentState(attempt);
    const source=request.sourceFiles??request.files;
    const checkpoint=caller==='software-agent-command'
      ? await new SupabaseSoftwareAgentCheckpointStore(attempt.userId,attempt).load(attempt.runId):null;
    if(!sandboxSourceMatches(caller,source,state,checkpoint))return refuse();
    const canonical=new Map(source.map(file=>[file.path,file.content]));
    const extras=request.files.filter(file=>!canonical.has(file.path));
    const allowedExtra=(file:ProjectFile)=>caller==='browser-verification'?[COLLECTOR_PATH,STATIC_SERVER_PATH].includes(file.path)
      :caller==='compile-validator'&&file.path===compileDefaultConfigFile().path&&file.content===compileDefaultConfigFile().content;
    if(request.files.some(file=>canonical.has(file.path)&&canonical.get(file.path)!==file.content)||extras.some(file=>!allowedExtra(file)))return refuse();
    const binding=Object.freeze({runId:attempt.runId,userId:attempt.userId,projectId:state.projectId,caller,requestSha256:fingerprint(request)});
    issued.set(binding,{attempt,state});return binding;
  })());
  }catch{return refuse();}
}

export async function requireSandboxExecutionBinding(request:SandboxExecutionRequest,cleanup=false):Promise<SandboxExecutionBinding> {
  try{return await withSandboxAdmissionDeadline((async()=>{
    const binding=request.executionBinding;
    if(!binding||!issued.has(binding)||binding.requestSha256!==fingerprint(request))return refuse();
    const original=issued.get(binding)!;requireAdmittedRunAttempt(original.attempt);
    if(!cleanup){
      const current=await currentState(original.attempt);
      if(current.projectId!==original.state.projectId||current.databaseProjectId!==original.state.databaseProjectId
        ||current.selectedBranch!==original.state.selectedBranch||current.startingCommitSha!==original.state.startingCommitSha
        ||JSON.stringify(current.repository)!==JSON.stringify(original.state.repository))return refuse();
    }
    return binding;
  })());
  }catch{return refuse();}
}
