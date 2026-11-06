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
import {publicHttpsUrl} from '../security/egress/urlPolicy.js';
import {redactSecrets} from '../lib/truthfulExecution.js';
import {researchAnswerRequestSchema,completeApprovedResearchAnswer,RESEARCH_ANSWER_MAXIMUM_MICRO_USD} from './researchAnswer.js';
import {saveResearchResult} from '../services/integrations/researchResult.js';
import {DEEPSEEK_SEARCH_URL,DEEPSEEK_FETCH_URL} from './researchSearchProvider.js';
import {retrievalMaximum,runApprovedRetrievalPlan,type RetrievalOperation,type RetrievalReceipt} from './researchRetrievalPlan.js';
import {readRetrievalCache,writeRetrievalCache} from './researchRetrievalCache.js';

function extractUrls(body:Record<string,unknown>):string[]{
 if(typeof body.objective!=='string'||body.objective.length>4000||!Array.isArray(body.urls)||body.urls.length<1||body.urls.length>10||Object.keys(body).some(k=>!['urls','objective','research_kind','research_run_id'].includes(k)))throw denied();
 return body.urls.map(url=>{if(typeof url!=='string')throw denied();return publicHttpsUrl(url).href;});
}

type Operation='search'|'extract'|'responses';
const toolkit='xroga-native-research',useCase='Send exact research request to the external provider';
const denied=()=>new AuthorityError('PARALLEL_EGRESS_ADMISSION_DENIED');
function requireRetrievalOnly(operation:string):void{
  if(operation!=='search'&&operation!=='extract')throw Object.assign(new Error('Generative research uses the canonical Zurelay model path.'),{code:'MODEL_DESTINATION_DENIED',status:400});
}
const unsigned=(p:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=p;const{planDigest:_digest,...value}=rest as BusinessActionPlan;return value;};
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const identity=(scope:TenantModelScope,nonce:string,value:unknown)=>({tenant:scope.context.tenantId,owner:scope.context.userId,provider:'research-plan',account:'parallel',credentialType:'prepared-action',recordId:nonce,revision:digest(value),scope:'research-egress'});
interface State {scope:TenantModelScope;operation:Operation;body:Record<string,unknown>;maximumMicroUsd:number;check:()=>Promise<void>;begin:()=>Promise<void>;active:boolean}
const admitted=new WeakMap<object,State>();
export interface ParallelAdmission {readonly marker:'native-research'}
export async function prepareParallelApproval(scope:TenantModelScope,operation:Operation,body:Record<string,unknown>,signal?:AbortSignal){
 requireRetrievalOnly(operation);
 const context=requireTenantContext(scope.context);requireResourceOwner(context,scope.userId);signal?.throwIfAborted();
 if(classifyOutboundData(body,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
 await requireModelProjectBinding(scope);
 const attempt=scope.runAttempt?requireAdmittedRunAttempt(scope.runAttempt):null;
 if(operation==='extract')extractUrls(body);
 const nonce=randomUUID(),issuedAt=new Date().toISOString(),amount=retrievalMaximum(operation as RetrievalOperation,body);
 const value:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:`trs_native_research_${nonce}`,useCase,toolkit,toolSlug:'XROGA_RESEARCH_'+operation.toUpperCase(),arguments:{operation,body:structuredClone(body),projectId:scope.projectId??null,repository:scope.repository??null,repositoryBound:scope.repository!==undefined,attempt:attempt?{...attempt}:null,maximumMicroUsd:amount},risk:'write',requiresConfirmation:true,forceConfirmation:true,summary:`Send the displayed question and public URLs to the official DeepSeek Search/Fetch API for retrieval only. Maximum ${amount/750} retrieval operations at $0.00075 each. Manual research may select public pages from returned sources and refine searches with their public titles; automatic research uses at most two searches. These are untrusted data. No private URL, new provider, fallback or automatic retry is authorized. Maximum retrieval charge $${(amount/1e6).toFixed(5)}, subject to the canonical allowance and $1.25 paid monthly ceiling.`,requiredScopes:['xroga:research-egress'],authority:{version:'1',userId:context.userId,tenantId:context.tenantId,connectedAccountId:'deepseek-search:platform',actionClass:'SENSITIVE_DATA_EXPORT',projectId:scope.projectId??null,runId:attempt?.runId??null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:String(amount),currency:'USD'}};
 if(scope.researchAnswer){
  const request=researchAnswerRequestSchema.parse(scope.researchAnswer);
  if(classifyOutboundData(request,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  value.arguments.answerRequest=request;
  value.authority!.maxSpendMicroUsd=String(amount+RESEARCH_ANSWER_MAXIMUM_MICRO_USD);
  value.requiredScopes.push('xroga:research-synthesis');
  value.summary=`${value.summary} Then send the displayed original question, conversation context and retrieved evidence to Zurelay for ONE DeepSeek answer, capped at $0.005. Total maximum $${((amount+RESEARCH_ANSWER_MAXIMUM_MICRO_USD)/1e6).toFixed(3)}. No tools, external actions, further retrieval after synthesis, model fallback or automatic retry. Both charges require canonical budget admission.`;
 }
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
 const withAnswer=Object.hasOwn(plan.arguments,'answerRequest');
 if(!scope||!binding||plan.toolkit!==toolkit||plan.useCase!==useCase||plan.risk!=='write'||plan.requiresConfirmation!==true||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,withAnswer?['xroga:research-egress','xroga:research-synthesis']:['xroga:research-egress'])||scope.actionClass!=='SENSITIVE_DATA_EXPORT'||!['deepseek-search:platform','public-web:credential-free'].includes(scope.connectedAccountId)||plan.sessionId!==`trs_native_research_${scope.nonce}`||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000)throw denied();
 const args=plan.arguments,operation=args.operation as Operation,body=args.body as Record<string,unknown>;
 requireRetrievalOnly(operation);
 const answerRequest=withAnswer?researchAnswerRequestSchema.parse(args.answerRequest):undefined;
 if(!['search','extract','responses'].includes(operation)||plan.toolSlug!=='XROGA_RESEARCH_'+operation.toUpperCase()||!body||typeof body!=='object'||Array.isArray(body)||args.projectId!==scope.projectId||scope.currency!=='USD'||scope.maxSpendMicroUsd!==String(Number(args.maximumMicroUsd)+(withAnswer?RESEARCH_ANSWER_MAXIMUM_MICRO_USD:0))||typeof args.repositoryBound!=='boolean'||!isDeepStrictEqual(Object.keys(args).sort(),[...(withAnswer?['answerRequest']:[]),'attempt','body','maximumMicroUsd','operation','projectId','repository','repositoryBound']))throw denied();
 if(scope.connectedAccountId!==('deepseek-search:platform')||args.maximumMicroUsd!==retrievalMaximum(operation as RetrievalOperation,body))throw denied();
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
  await enforceEgress({context,actionClass:scope.actionClass,destination:operation==='extract'?DEEPSEEK_FETCH_URL:DEEPSEEK_SEARCH_URL,recipient:scope.connectedAccountId,purpose:'approved-exact-research',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:args},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:permit},receipt=>persistSecurityDecision(context,receipt));
  await consumeAuthorityPermit(permit,binding);consumed=true;await check();
 }};admitted.set(admission,state);
 const finish=async(raw:{ok:true;operation:Operation;result:unknown;trust:string})=>{
  if(!answerRequest)return raw;
  // Preserve the paid retrieval before starting the original answer request.
  // A crash/uncertain outcome remains under this same non-replayable claim.
  await check();await saveResearchResult(context,permit!.grantId,JSON.stringify(raw),digest(raw),scope.projectId);
  const answer=await completeApprovedResearchAnswer(modelScope,answerRequest,raw,check);
  return {...raw,...answer};
 };
 try{
  const retrievalOperation=operation as RetrievalOperation;
  await state.begin();
  const cached=await readRetrievalCache(modelScope,retrievalOperation,body);
  if(cached)return await finish({ok:true,operation,result:{...cached,cache_hit:true},trust:'UNTRUSTED_DATA'});
  let dispatched=0;
  const result=await runApprovedRetrievalPlan({operation:retrievalOperation,body,
   execute:async(childOperation,childBody)=>{
    await check();
    if(++dispatched*750>state.maximumMicroUsd)throw denied();
    const child:ParallelAdmission=Object.freeze({marker:'native-research'});
    let childStarted=false;
    const childState:State={scope:modelScope,operation:childOperation,body:structuredClone(childBody),
     maximumMicroUsd:750,active:true,check,begin:async()=>{if(childStarted)throw denied();childStarted=true;await check();}};
    admitted.set(child,childState);
    try{
     const {executeParallelRequest}=await import('./parallelDispatch.js');
     const response=await executeParallelRequest({scope:modelScope,userId,operation:childOperation,body:childBody,admission:child});
     return await response.json() as RetrievalReceipt;
    }finally{childState.active=false;admitted.delete(child);}
   },
   progress:async(partial)=>{
    await check();const raw={ok:true,operation,result:partial,trust:'UNTRUSTED_DATA'};
    await saveResearchResult(context,permit!.grantId,JSON.stringify(raw),digest(raw),scope.projectId);
   },
  });
  await writeRetrievalCache(modelScope,retrievalOperation,body,result);
  return await finish({ok:true,operation,result,trust:'UNTRUSTED_DATA'});
 }
 finally{state.active=false;admitted.delete(admission);}
}
