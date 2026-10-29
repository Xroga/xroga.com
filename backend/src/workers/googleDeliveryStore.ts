import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createTenantContext,requireTenantContext,type TenantContext} from '../security/tenantContext.js';
import {getGlobalSupabaseAdmin,getTenantSupabaseAdmin} from '../security/serviceRoleGuard.js';
import {requireOptionalOwnedDatabaseProject} from '../security/ownership.js';
import {verifyAttachedGoogleIdentity} from '../synthesis/projectRuntime/googleFactory.js';
import {type GoogleDispatchConfiguration,GoogleDispatchError,validateGoogleDispatchConfiguration} from './googleDispatch.js';
import type {ChatAttachment} from '../ai/attachments.js';
import {QUEUED_RUN_TTL_MS} from '../ai/runReconciler.js';

export interface CanonicalQueuedInput {
  prompt:string;
  history?:Array<{role:'user'|'assistant';content:string}>;
  projectId?:string;
  clientMeta?:Record<string,unknown>;
  attachments?:ChatAttachment[];
  /** AI Product Builder project this run builds into. Ownership is re-verified by the worker before any run opens. */
  builderProjectId?:string;
  /** Existing-project change this run executes. Ownership and the change-to-run link are re-verified by the worker before anything runs. */
  existingSourceChangeId?:string;
}
export interface CanonicalDeliveryClaim {readonly deliveryId:string;readonly runId:string;readonly userId:string;readonly workerId:string;readonly generation:string;}
const issuedClaims=new WeakMap<object,{input:CanonicalQueuedInput;context:TenantContext}>();
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const denied=():never=>{throw new GoogleDispatchError('DISPATCH_RESULT_UNVERIFIED');};
export function requireCanonicalDeliveryClaim(claim:CanonicalDeliveryClaim){
  const privateState=claim&&issuedClaims.get(claim);if(!privateState)return denied();
  return{...privateState,input:structuredClone(privateState.input),claim};
}

/** The table is service-only. Browser input cannot create a worker context.
 * Actor context is issued only from an exact native Job's atomic DB claim. */
export class GoogleDeliveryStore {
  constructor(private readonly c:GoogleDispatchConfiguration,
    private readonly env:Readonly<NodeJS.ProcessEnv>=process.env,
    private readonly native:(account:string)=>Promise<void>=verifyAttachedGoogleIdentity,
    private readonly service:()=>SupabaseClient=()=>getGlobalSupabaseAdmin('canonical_delivery_dispatch')){validateGoogleDispatchConfiguration(c);}
  async enqueue(context:TenantContext,runId:string,value:CanonicalQueuedInput):Promise<string>{
    const actor=requireTenantContext(context);if(!uuid.test(runId)||!value.prompt.trim())return denied();
    if(value.builderProjectId!==undefined&&!uuid.test(value.builderProjectId))return denied();
    if(value.existingSourceChangeId!==undefined&&!uuid.test(value.existingSourceChangeId))return denied();
    const client=getTenantSupabaseAdmin(actor);
    const projectId=await requireOptionalOwnedDatabaseProject(actor,value.projectId,client);
    const input:CanonicalQueuedInput=structuredClone({prompt:value.prompt,history:value.history,projectId,clientMeta:value.clientMeta,attachments:value.attachments,
      builderProjectId:value.builderProjectId,existingSourceChangeId:value.existingSourceChangeId});
    // Canonical JSON omits undefined values before comparing durable requests.
    const payload=JSON.parse(JSON.stringify(input));
    if(Buffer.byteLength(JSON.stringify(payload))>500000)return denied();
    const {data,error}=await client.rpc('enqueue_google_canonical_run',{p_delivery:randomUUID(),p_run:runId,p_owner:actor.userId,
      p_project:projectId&&uuid.test(projectId)?projectId:null,p_input:payload,p_source:this.c.sourceSha});
    if(error||!data||!uuid.test(data.deliveryId)||data.runId!==runId||data.userId!==actor.userId||data.sourceSha!==this.c.sourceSha)return denied();
    return data.deliveryId;
  }
  async reserve(deliveryId:string):Promise<{state:'busy'|'acknowledged'|'absent'}|{state:'reserved';token:string}>{
    if(!uuid.test(deliveryId))return denied();const token=randomUUID();
    const {data,error}=await this.service().rpc('reserve_google_canonical_launch',{p_delivery:deliveryId,p_source:this.c.sourceSha,p_token:token});
    if(error||!data)return denied();
    if(['busy','acknowledged','absent'].includes(data.state))return{state:data.state};
    if(data.state!=='reserved'||data.deliveryId!==deliveryId||data.token!==token)return denied();
    return{state:'reserved',token};
  }
  async recordLaunch(deliveryId:string,token:string,operationName:string):Promise<void>{
    if(!uuid.test(deliveryId)||!uuid.test(token)||!operationName.startsWith(`projects/${this.c.project}/locations/${this.c.region}/operations/`))return denied();
    const {data,error}=await this.service().rpc('record_google_canonical_launch',{p_delivery:deliveryId,p_token:token,p_operation:operationName});
    if(error||data!==true)return denied();
  }
  async pendingDeliveryIds():Promise<string[]>{
    const nowMs=Date.now();
    const {data,error}=await this.service().from('google_canonical_deliveries').select('id')
      .eq('source_sha',this.c.sourceSha)
      // Keep the bounded selection aligned with the reconciler's queued-run wait. A launch whose lease expired with an unknown outcome is
      // retried under the database's own five-attempt ceiling. The dispatcher still requires the database reservation and native identity.
      .gte('created_at',new Date(nowMs-QUEUED_RUN_TTL_MS).toISOString()).lt('launch_attempts',5)
      .or(`state.eq.pending,and(state.eq.launching,launch_lease_until.lt.${new Date(nowMs).toISOString()})`)
      .order('created_at',{ascending:true}).limit(10);
    if(error||!Array.isArray(data)||data.some(row=>!uuid.test(row.id)))return denied();
    return data.map(row=>row.id);
  }
  async claim(deliveryId:string,workerId:string):Promise<CanonicalDeliveryClaim|null>{
    if(!uuid.test(deliveryId)||!uuid.test(workerId)||this.env.CLOUD_RUN_JOB!==this.c.job
      ||!this.env.CLOUD_RUN_EXECUTION?.startsWith(this.c.job+'-')||this.env.XROGA_RELEASE_SHA!==this.c.sourceSha)return denied();
    await this.native(this.c.runtimeAccount);
    const generation=randomUUID();
    const {data,error}=await this.service().rpc('claim_google_canonical_run',{p_delivery:deliveryId,p_source:this.c.sourceSha,p_worker:workerId,p_generation:generation});
    if(error)return denied();if(data===null)return null;
    if(!data||data.deliveryId!==deliveryId||data.sourceSha!==this.c.sourceSha||data.workerId!==workerId||data.generation!==generation
      ||!uuid.test(data.runId)||!uuid.test(data.userId)||typeof data.freshStart!=='boolean'||!data.input||typeof data.input.prompt!=='string')return denied();
    const claim=Object.freeze({deliveryId,runId:data.runId,userId:data.userId,workerId,generation});
    const context=createTenantContext({userId:data.userId,via:'persisted_owner'});
    if(data.input.builderProjectId!==undefined&&(typeof data.input.builderProjectId!=='string'||!uuid.test(data.input.builderProjectId)))return denied();
    if(data.input.existingSourceChangeId!==undefined&&(typeof data.input.existingSourceChangeId!=='string'||!uuid.test(data.input.existingSourceChangeId)))return denied();
    const input:CanonicalQueuedInput=structuredClone({prompt:data.input.prompt,history:data.input.history,projectId:data.input.projectId,
      clientMeta:data.input.clientMeta,attachments:data.input.attachments,builderProjectId:data.input.builderProjectId,
      existingSourceChangeId:data.input.existingSourceChangeId});
    if(data.freshStart&&input.clientMeta?.resumeRun===true)input.clientMeta={...input.clientMeta,resumeRun:false};
    issuedClaims.set(claim,{context,input});return claim;
  }
  async recordResult(claim:CanonicalDeliveryClaim,success:boolean,followUps:unknown):Promise<void>{
    requireCanonicalDeliveryClaim(claim);
    const {data,error}=await this.service().rpc('record_google_canonical_result',{p_delivery:claim.deliveryId,p_owner:claim.userId,
      p_worker:claim.workerId,p_generation:claim.generation,p_success:success,p_follow_ups:followUps??null});
    if(error||data!==true)return denied();
  }
  async loadResult(context:TenantContext,runId:string):Promise<{success:boolean;followUps:unknown}|null>{
    const actor=requireTenantContext(context);if(!uuid.test(runId))return denied();
    const {data,error}=await getTenantSupabaseAdmin(actor).from('google_canonical_deliveries')
      .select('user_id,run_id,result_success,result_follow_ups').eq('run_id',runId).eq('user_id',actor.userId)
      .eq('state','running')
      .order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(error)return denied();if(!data||data.result_success===null)return null;
    if(data.user_id!==actor.userId||data.run_id!==runId||typeof data.result_success!=='boolean')return denied();
    return{success:data.result_success,followUps:data.result_follow_ups};
  }
}
