import{randomUUID}from'node:crypto';import{isDeepStrictEqual}from'node:util';
import{preparedActionDigest}from'../../security/authority/digest.js';
import{AuthorityError,consumeAuthorityPermit}from'../../security/authority/enforce.js';
import type{AuthorityPermit}from'../../security/authority/types.js';
import{getTenantSupabaseAdmin}from'../../security/serviceRoleGuard.js';
import type{TenantContext}from'../../security/tenantContext.js';
import{enforceEgress,EgressDenied}from'../../security/egress/egressPolicy.js';
import{classifyOutboundData}from'../../security/egress/dataClassification.js';
import{persistSecurityDecision}from'../../security/egress/securityDecision.js';
import{runtimeCredentialVault}from'../integrations/credentialVaultRuntime.js';
import{actionPlanDigest,type BusinessActionPlan}from'../integrations/businessAction.js';
import{createBusinessActionConfirmation}from'../integrations/businessActionConfirmations.js';
import type{nativeReleaseActor}from'./nativeReleaseAdmission.js';
import{validExpoId}from'./expoAccess.js';

export type ExpoNativeOperation='XROGA_EXPO_CREATE_APP'|'XROGA_EXPO_WORKFLOW';
const toolkit='xroga-native-expo',useCase='Execute an exact approved Expo action';
const denied=()=>new AuthorityError('EXPO_NATIVE_ACTION_DENIED');
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const actionClass=(operation:ExpoNativeOperation)=>operation==='XROGA_EXPO_CREATE_APP'?'CREATE':'PUBLISH';
const projectFor=(operation:ExpoNativeOperation,args:Record<string,unknown>)=>operation==='XROGA_EXPO_WORKFLOW'?args.databaseProjectId as string:null;
const destination=(operation:ExpoNativeOperation)=>operation==='XROGA_EXPO_CREATE_APP'?'https://api.expo.dev/graphql':'https://api.expo.dev/v2/workflows/dispatch';
const unsignedValue=(plan:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=plan;const{planDigest:_digest,...unsigned}=rest as BusinessActionPlan;return unsigned;};
const identity=(context:TenantContext,nonce:string,value:unknown)=>({tenant:context.tenantId,owner:context.userId,provider:'expo-native-plan',account:'expo',credentialType:'prepared-action',recordId:nonce,revision:digest(value),scope:'expo-native-action'});
export async function prepareExpoNativeAction(input:{context:TenantContext;operation:ExpoNativeOperation;accountId:string;arguments:Record<string,unknown>;summary:string;check:()=>Promise<void>}){
 const parameters=JSON.parse(JSON.stringify(input.arguments)) as Record<string,unknown>;
 if(!validExpoId(input.accountId)||parameters.accountId!==input.accountId||parameters.destination!==destination(input.operation)||!['XROGA_EXPO_CREATE_APP','XROGA_EXPO_WORKFLOW'].includes(input.operation))throw denied();
 if(input.operation==='XROGA_EXPO_WORKFLOW'&&(typeof parameters.databaseProjectId!=='string'||!/^[a-f0-9-]{36}$/i.test(parameters.databaseProjectId)))throw denied();
 if(classifyOutboundData(parameters,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
 const nonce=randomUUID(),issuedAt=new Date().toISOString();
 const unsigned:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:`trs_native_expo_${nonce}`,useCase,toolkit,toolSlug:input.operation,arguments:parameters,risk:'write',requiresConfirmation:true,forceConfirmation:true,summary:input.summary,requiredScopes:['xroga:expo-native'],
  authority:{version:'1',userId:input.context.userId,tenantId:input.context.tenantId,connectedAccountId:'expo:'+input.accountId,actionClass:actionClass(input.operation),projectId:projectFor(input.operation,parameters),runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:null,currency:null}};
 const value=unsignedValue(unsigned),nativeExpoProof=await runtimeCredentialVault().seal(input.context,identity(input.context,nonce,value),digest(value));
 await input.check();unsigned.scopeRequirements={nativeExpoProof};
 const confirmation=await createBusinessActionConfirmation(input.context.userId,{...unsigned,planDigest:actionPlanDigest(unsigned)});
 return{ok:false,needsConfirmation:true,confirmation,reviewUrl:`/dashboard/actions/confirm/${confirmation.id}`,message:'Review the exact Expo account, project and operation before execution.'};
}
/** Full producer attestation and canonical claim are required before even
 * resolving metadata for a serialized native plan. No client approval token. */
export async function readExpoNativeAction(actor:ReturnType<typeof nativeReleaseActor>,operation:ExpoNativeOperation,permit?:AuthorityPermit){
 const{context,plan,scope,binding}=actor;
 if(!plan||!scope||!binding||plan.toolkit!==toolkit||plan.toolSlug!==operation||plan.useCase!==useCase||plan.risk!=='write'||plan.requiresConfirmation!==true||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,['xroga:expo-native'])
  ||scope.actionClass!==actionClass(operation)||scope.projectId!==projectFor(operation,plan.arguments)||scope.runId!==null||scope.maxSpendMicroUsd!==null||scope.currency!==null||!validExpoId(plan.arguments.accountId)||scope.connectedAccountId!=='expo:'+plan.arguments.accountId||plan.arguments.destination!==destination(operation)
  ||plan.sessionId!==`trs_native_expo_${scope.nonce}`||!/^[a-f0-9-]{36}$/i.test(scope.nonce)||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000)throw denied();
 const proof=plan.scopeRequirements as{nativeExpoProof?:unknown}|undefined,value=unsignedValue(plan);
 if(!proof||!isDeepStrictEqual(Object.keys(proof),['nativeExpoProof'])||typeof proof.nativeExpoProof!=='string')throw denied();
 try{if(await runtimeCredentialVault().open(context,identity(context,scope.nonce,value),proof.nativeExpoProof)!==digest(value))throw denied();}catch{throw denied();}
 let started=false,consumed=false;
 const checkClaim=async()=>{
  if(!permit||Date.parse(scope.expiresAt)<=Date.now())throw denied();
  const{data,error}=await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',permit.grantId).eq('user_id',context.userId).maybeSingle();
  if(error||data?.id!==permit.grantId||data.user_id!==context.userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||!Number.isFinite(Date.parse(data.claimed_at))||consumed&&!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();
 };
 await checkClaim();
 return{plan,scope,binding,checkClaim,assertArguments(expected:Record<string,unknown>){if(!isDeepStrictEqual(plan.arguments,expected))throw denied();},async begin(check:()=>Promise<void>){
  if(started)throw denied();started=true;await check();await checkClaim();
  await enforceEgress({context,actionClass:scope.actionClass,destination:destination(operation),recipient:scope.connectedAccountId,purpose:'approved-native-expo-action',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:plan.arguments},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:permit},receipt=>persistSecurityDecision(context,receipt));
  await consumeAuthorityPermit(permit,binding);consumed=true;await check();await checkClaim();
 }};
}
