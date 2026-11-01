import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {requireTenantContext,requireResourceOwner} from '../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../security/serviceRoleGuard.js';
import {AuthorityError,consumeAuthorityPermit} from '../security/authority/enforce.js';
import type {AuthorityPermit} from '../security/authority/types.js';
import {preparedActionDigest} from '../security/authority/digest.js';
import {classifyOutboundData} from '../security/egress/dataClassification.js';
import {enforceEgress,EgressDenied} from '../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../security/egress/securityDecision.js';
import {runtimeCredentialVault} from '../services/integrations/credentialVaultRuntime.js';
import {createBusinessActionConfirmation} from '../services/integrations/businessActionConfirmations.js';
import {actionPlanDigest,type BusinessActionPlan} from '../services/integrations/businessAction.js';
import {nativeReleaseActor} from '../services/publish/nativeReleaseAdmission.js';
import {requireModelProjectBinding,type TenantModelScope} from './tenantModelDispatch.js';
import {requireAdmittedRunAttempt} from './runStore.js';
import {boundedPublicGet,publicHttpsUrl} from '../security/egress/urlPolicy.js';
import {redactSecrets} from '../lib/truthfulExecution.js';
import {createRequire} from 'node:module';

const pdfParse=createRequire(import.meta.url)('pdf-parse/lib/pdf-parse.js') as (data:Buffer,options:{max:number})=>Promise<{text:string}>;
function extractUrls(body:Record<string,unknown>):string[]{
 if(typeof body.objective!=='string'||body.objective.length>4000||!Array.isArray(body.urls)||body.urls.length<1||body.urls.length>4||Object.keys(body).some(k=>!['urls','objective'].includes(k)))throw denied();
 return body.urls.map(url=>{if(typeof url!=='string')throw denied();return publicHttpsUrl(url).href;});
}

type Operation='search'|'extract'|'responses';
const toolkit='xroga-native-research',useCase='Send exact research request to the external provider';
const denied=()=>new AuthorityError('PARALLEL_EGRESS_ADMISSION_DENIED');
const unsigned=(p:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=p;const{planDigest:_digest,...value}=rest as BusinessActionPlan;return value;};
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const identity=(scope:TenantModelScope,nonce:string,value:unknown)=>({tenant:scope.context.tenantId,owner:scope.context.userId,provider:'research-plan',account:'parallel',credentialType:'prepared-action',recordId:nonce,revision:digest(value),scope:'research-egress'});
interface State {scope:TenantModelScope;operation:Operation;body:Record<string,unknown>;maximumMicroUsd:number;check:()=>Promise<void>;begin:()=>Promise<void>;active:boolean}
const admitted=new WeakMap<object,State>();
export interface ParallelAdmission {readonly marker:'native-research'}
export async function prepareParallelApproval(scope:TenantModelScope,operation:Operation,body:Record<string,unknown>,signal?:AbortSignal){
 const context=requireTenantContext(scope.context);requireResourceOwner(context,scope.userId);signal?.throwIfAborted();
 if(classifyOutboundData(body,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
 await requireModelProjectBinding(scope);
 const attempt=scope.runAttempt?requireAdmittedRunAttempt(scope.runAttempt):null;
 if(operation==='extract')extractUrls(body);
 const nonce=randomUUID(),issuedAt=new Date().toISOString(),amount=operation==='responses'?(body.reasoning as {effort?:string})?.effort==='medium'?50000:10000:operation==='extract'?0:1000;
 const value:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:`trs_native_research_${nonce}`,useCase,toolkit,toolSlug:'XROGA_RESEARCH_'+operation.toUpperCase(),arguments:{operation,body:structuredClone(body),projectId:scope.projectId??null,repository:scope.repository??null,repositoryBound:scope.repository!==undefined,attempt:attempt?{...attempt}:null,maximumMicroUsd:amount},risk:'write',requiresConfirmation:true,forceConfirmation:true,summary:operation==='extract'?'Retrieve only the displayed public HTTPS URLs without authentication. DNS is pinned, redirects are refused, and no provider or model charge is made. URL query text may be private.':`Send only the displayed ${operation} request to Parallel. Research text may contain private project or user information. Maximum provider charge is $${(amount/1e6).toFixed(3)}. The canonical budget must independently admit this charge.`,requiredScopes:['xroga:research-egress'],authority:{version:'1',userId:context.userId,tenantId:context.tenantId,connectedAccountId:operation==='extract'?'public-web:credential-free':'parallel:platform',actionClass:'SENSITIVE_DATA_EXPORT',projectId:scope.projectId??null,runId:attempt?.runId??null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:String(amount),currency:'USD'}};
 const proof=await runtimeCredentialVault().seal(context,identity(scope,nonce,unsigned(value)),digest(unsigned(value)));
 await requireModelProjectBinding(scope);signal?.throwIfAborted();value.scopeRequirements={nativeResearchProof:proof};
 const confirmation=await createBusinessActionConfirmation(context.userId,{...value,planDigest:actionPlanDigest(value)});
 return{needsConfirmation:true,reviewUrl:`/dashboard/actions/confirm/${confirmation.id}`,message:'Research has not been sent. Review the exact external request before execution.'};
}
export function requireParallelAdmission(value:ParallelAdmission|undefined,scope:TenantModelScope,operation:Operation,body:Record<string,unknown>){
 const state=value&&admitted.get(value);if(!state||!state.active||state.scope.context!==requireTenantContext(scope.context)||state.scope.userId!==scope.userId||state.scope.projectId!==scope.projectId||state.scope.repository!==scope.repository||state.operation!==operation||!isDeepStrictEqual(state.body,body))throw denied();return state;
}
/** Existing confirmation/vault/permit, no user or model supplied public hint. */
export async function executeParallelNativeAction(userId:string,plan:BusinessActionPlan,permit?:AuthorityPermit){
 const actor=nativeReleaseActor(userId,undefined,plan,permit),{context,scope,binding}=actor;
 if(!scope||!binding||plan.toolkit!==toolkit||plan.useCase!==useCase||plan.risk!=='write'||plan.requiresConfirmation!==true||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,['xroga:research-egress'])||scope.actionClass!=='SENSITIVE_DATA_EXPORT'||!['parallel:platform','public-web:credential-free'].includes(scope.connectedAccountId)||plan.sessionId!==`trs_native_research_${scope.nonce}`||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000)throw denied();
 const args=plan.arguments,operation=args.operation as Operation,body=args.body as Record<string,unknown>;
 if(!['search','extract','responses'].includes(operation)||plan.toolSlug!=='XROGA_RESEARCH_'+operation.toUpperCase()||!body||typeof body!=='object'||Array.isArray(body)||args.projectId!==scope.projectId||scope.currency!=='USD'||scope.maxSpendMicroUsd!==String(args.maximumMicroUsd)||typeof args.repositoryBound!=='boolean'||!isDeepStrictEqual(Object.keys(args).sort(),['attempt','body','maximumMicroUsd','operation','projectId','repository','repositoryBound']))throw denied();
 if(scope.connectedAccountId!==(operation==='extract'?'public-web:credential-free':'parallel:platform')||operation==='extract'&&args.maximumMicroUsd!==0)throw denied();
 const modelScope:TenantModelScope={context,userId,...(scope.projectId?{projectId:scope.projectId}:{}),...(args.repositoryBound?{repository:args.repository as string|null}:{})};
 const proof=plan.scopeRequirements as{nativeResearchProof?:unknown}|undefined;
 if(!proof||!isDeepStrictEqual(Object.keys(proof),['nativeResearchProof'])||typeof proof.nativeResearchProof!=='string')throw denied();
 try{if(await runtimeCredentialVault().open(context,identity(modelScope,scope.nonce,unsigned(plan)),proof.nativeResearchProof)!==digest(unsigned(plan)))throw denied();}catch{throw denied();}
 let consumed=false,started=false;
 const check=async()=>{
  await requireModelProjectBinding(modelScope);
  const db=getTenantSupabaseAdmin(context),{data,error}=await db.from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',permit!.grantId).eq('user_id',userId).maybeSingle();
  if(error||data?.id!==permit!.grantId||data.user_id!==userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||Date.parse(scope.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(data.claimed_at))||consumed&&!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();
  const attempt=args.attempt as{runId:string;userId:string;workerId:string;generation:string}|null;
  if(attempt){if(attempt.userId!==userId||scope.runId!==attempt.runId)throw denied();const{data:run,error}=await db.from('swarm_runs').select('id,user_id,project_id,status,worker_id,lease_generation').eq('id',attempt.runId).eq('user_id',userId).maybeSingle();if(error||run?.id!==attempt.runId||run.user_id!==userId||run.project_id!==scope.projectId||run.status!=='running'||run.worker_id!==attempt.workerId||run.lease_generation!==attempt.generation)throw denied();}else if(scope.runId!==null)throw denied();
 };
 await check();const admission:ParallelAdmission=Object.freeze({marker:'native-research'}),state:State={scope:modelScope,operation,body:structuredClone(body),maximumMicroUsd:Number(args.maximumMicroUsd),active:true,check,begin:async()=>{
  if(started)throw denied();started=true;await check();
  await enforceEgress({context,actionClass:scope.actionClass,destination:operation==='extract'?extractUrls(body)[0]:`https://api.parallel.ai/v1/${operation}`,recipient:scope.connectedAccountId,purpose:'approved-exact-research',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:args},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:permit},receipt=>persistSecurityDecision(context,receipt));
  await consumeAuthorityPermit(permit,binding);consumed=true;await check();
 }};admitted.set(admission,state);
 try{
  if(operation==='extract'){
   const urls=extractUrls(body),results=[];await state.begin();
   for(const url of urls){
    await check();let page;
    try{page=await boundedPublicGet(url,{maxBytes:2*1024*1024,timeoutMs:15000,maxRedirects:0,allowHttpErrors:true,beforeRequest:check});}catch{throw new EgressDenied('UNSAFE_DESTINATION');}
    await check();let text:string;
    if(page.statusCode===401||page.statusCode===403)throw new AuthorityError('PUBLIC_RESEARCH_ACCESS_DENIED');
    if(page.statusCode<200||page.statusCode>=300)throw Object.assign(new Error('Public research document unavailable.'),{status:page.statusCode});
    if(/^application\/pdf(?:;|$)/i.test(page.contentType)){try{const parsed=await pdfParse(page.bytes,{max:5});text=parsed.text;}catch{throw new Error('Public PDF extraction unavailable.');}}
    else if(/^(?:text\/(?:plain|html)|application\/(?:json|xml|xhtml\+xml))(?:;|$)/i.test(page.contentType))text=page.bytes.toString('utf8').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ');
    else throw new EgressDenied('UNSAFE_DESTINATION');
    await check();results.push({url:page.finalUrl,title:new URL(page.finalUrl).hostname,excerpts:[redactSecrets(text).trim().slice(0,1200)],trust:'UNTRUSTED_DATA'});
   }
   return{ok:true,operation,result:{extract_id:'native-public-'+scope.nonce,results,usage:{providerMicroUsd:0},trust:'UNTRUSTED_DATA'}};
  }
  const{executeParallelRequest}=await import('./parallelDispatch.js');const response=await executeParallelRequest({scope:modelScope,userId,operation,body,admission});return{ok:true,operation,result:await response.json(),trust:'UNTRUSTED_DATA'};
 }
 finally{state.active=false;admitted.delete(admission);}
}
