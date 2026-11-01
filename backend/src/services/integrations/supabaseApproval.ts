import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {AuthorityError,consumeAuthorityPermit} from '../../security/authority/enforce.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import type {TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {enforceEgress,EgressDenied} from '../../security/egress/egressPolicy.js';
import {classifyOutboundData} from '../../security/egress/dataClassification.js';
import {persistSecurityDecision} from '../../security/egress/securityDecision.js';
import {runtimeCredentialVault} from './credentialVaultRuntime.js';
import {actionPlanDigest,type BusinessActionPlan} from './businessAction.js';
import {createBusinessActionConfirmation} from './businessActionConfirmations.js';
import type {nativeReleaseActor} from '../publish/nativeReleaseAdmission.js';
import {requireSupabaseAccess,type SupabaseAccess} from './supabaseAccess.js';

const toolkit='xroga-native-supabase',operation='XROGA_SUPABASE_PROVISION',useCase='Apply exact owned Supabase schema and private storage';
const denied=()=>new AuthorityError('SUPABASE_PROVISION_ADMISSION_DENIED');
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const unsigned=(plan:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=plan;const{planDigest:_digest,...value}=rest as BusinessActionPlan;return value;};
const identity=(context:TenantContext,nonce:string,value:unknown)=>({tenant:context.tenantId,owner:context.userId,provider:'supabase-native-plan',account:'supabase',credentialType:'prepared-action',recordId:nonce,revision:digest(value),scope:'supabase-native-provision'});
export async function prepareSupabaseNativeAction(access:SupabaseAccess,parameters:Record<string,unknown>){
 requireSupabaseAccess(access,access.context);
 if(typeof parameters.projectRef!=='string'||!/^[a-z0-9]{1,63}$/.test(parameters.projectRef)||parameters.projectUrl!==`https://${parameters.projectRef}.supabase.co`||parameters.connection!==access.fingerprint)throw denied();
 if(classifyOutboundData(parameters,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
 const nonce=randomUUID(),issuedAt=new Date().toISOString(),context=access.context;
 const value:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:`trs_native_supabase_${nonce}`,useCase,toolkit,toolSlug:operation,arguments:JSON.parse(JSON.stringify(parameters)),risk:'write',requiresConfirmation:true,forceConfirmation:true,
  summary:`Review the exact SQL and private storage buckets for Supabase project ${parameters.projectRef}. This changes the existing connected project. No new project, subscription upgrade or Vercel credential export is included.`,requiredScopes:['xroga:supabase-native'],
  authority:{version:'1',userId:context.userId,tenantId:context.tenantId,connectedAccountId:'supabase:'+parameters.projectRef,actionClass:'UPDATE',projectId:null,runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:null,currency:null}};
 const nativeSupabaseProof=await runtimeCredentialVault().seal(context,identity(context,nonce,unsigned(value)),digest(unsigned(value)));
 await access.check();value.scopeRequirements={nativeSupabaseProof};
 const confirmation=await createBusinessActionConfirmation(context.userId,{...value,planDigest:actionPlanDigest(value)});
 return{needsConfirmation:true,reviewUrl:`/dashboard/actions/confirm/${confirmation.id}`,message:'Review the exact Supabase schema and private storage action before execution.'};
}
/** Uses the existing durable confirmation, authority permit and managed vault.
 * Serialized JSON, a raw owner string or a model assertion cannot issue a plan. */
export async function readSupabaseNativeAction(actor:ReturnType<typeof nativeReleaseActor>,permit?:AuthorityPermit){
 const{context,plan,scope,binding}=actor;
 if(!plan||!scope||!binding||plan.toolkit!==toolkit||plan.toolSlug!==operation||plan.useCase!==useCase||plan.risk!=='write'||plan.requiresConfirmation!==true||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,['xroga:supabase-native'])
  ||scope.actionClass!=='UPDATE'||scope.projectId!==null||scope.runId!==null||scope.maxSpendMicroUsd!==null||scope.currency!==null||typeof plan.arguments.projectRef!=='string'||scope.connectedAccountId!=='supabase:'+plan.arguments.projectRef||plan.sessionId!==`trs_native_supabase_${scope.nonce}`||!/^[a-f0-9-]{36}$/i.test(scope.nonce)||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000)throw denied();
 const proof=plan.scopeRequirements as{nativeSupabaseProof?:unknown}|undefined,value=unsigned(plan);
 if(!proof||!isDeepStrictEqual(Object.keys(proof),['nativeSupabaseProof'])||typeof proof.nativeSupabaseProof!=='string')throw denied();
 try{if(await runtimeCredentialVault().open(context,identity(context,scope.nonce,value),proof.nativeSupabaseProof)!==digest(value))throw denied();}catch{throw denied();}
 let consumed=false,started=false;
 const checkClaim=async()=>{
  if(!permit||Date.parse(scope.expiresAt)<=Date.now())throw denied();
  const{data,error}=await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',permit.grantId).eq('user_id',context.userId).maybeSingle();
  if(error||data?.id!==permit.grantId||data.user_id!==context.userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||!Number.isFinite(Date.parse(data.claimed_at))||consumed&&!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();
 };
 await checkClaim();return{plan,scope,binding,checkClaim,assertArguments(expected:Record<string,unknown>){if(!isDeepStrictEqual(plan.arguments,expected))throw denied();},async begin(check:()=>Promise<void>){
  if(started)throw denied();started=true;await check();await checkClaim();
  await enforceEgress({context,actionClass:scope.actionClass,destination:String(plan.arguments.projectUrl),recipient:scope.connectedAccountId,purpose:'approved-owned-supabase-provision',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:plan.arguments},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:permit},receipt=>persistSecurityDecision(context,receipt));
  await consumeAuthorityPermit(permit,binding);consumed=true;await check();await checkClaim();
 }};
}
