import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {requireTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {AuthorityError,consumeAuthorityPermit} from '../../security/authority/enforce.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import {classifyOutboundData} from '../../security/egress/dataClassification.js';
import {enforceEgress,EgressDenied} from '../../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../../security/egress/securityDecision.js';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {runtimeCredentialVault} from './credentialVaultRuntime.js';
import {createBusinessActionConfirmation} from './businessActionConfirmations.js';
import {actionPlanDigest,type BusinessActionPlan} from './businessAction.js';
import {nativeReleaseActor} from '../publish/nativeReleaseAdmission.js';

export type ComposioControlOperation='CREATE_CUSTOM_MCP'|'SYNC_CUSTOM_MCP'|'DELETE_CUSTOM_MCP'|'CREATE_AUTOMATION_TRIGGER';
export interface ComposioControlPending {needsConfirmation:true;reviewUrl:string;message:string}
export interface ComposioControlAdmission {readonly marker:'native-connect-control'}
const toolkit='xroga-native-connect-control',useCase='Manage exact owned connected-app configuration';
const denied=()=>new AuthorityError('COMPOSIO_CONTROL_ADMISSION_DENIED');
const unsigned=(plan:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=plan;const{planDigest:_digest,...value}=rest as BusinessActionPlan;return value;};
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const identity=(context:TenantContext,nonce:string,value:unknown)=>({tenant:context.tenantId,owner:context.userId,provider:'connect-control-plan',account:'composio',credentialType:'prepared-action',recordId:nonce,revision:digest(value),scope:'connect-control'});
type State={context:TenantContext;operation:ComposioControlOperation;parameters:Record<string,unknown>;active:boolean;check:()=>Promise<void>;beforeDispatch:()=>Promise<void>};
const issued=new WeakMap<object,State>();
export async function prepareComposioControl(context:TenantContext,operation:ComposioControlOperation,parameters:Record<string,unknown>,summary:string):Promise<ComposioControlPending>{
 context=requireTenantContext(context);
 if(typeof parameters.resource!=='string'||!parameters.resource||classifyOutboundData(parameters,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
 const nonce=randomUUID(),issuedAt=new Date().toISOString(),value:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:`trs_native_connect_${nonce}`,useCase,toolkit,toolSlug:'XROGA_'+operation,arguments:structuredClone(parameters),risk:'write',requiresConfirmation:true,forceConfirmation:true,summary,requiredScopes:['xroga:connect-control'],authority:{version:'1',userId:context.userId,tenantId:context.tenantId,connectedAccountId:'composio:'+parameters.resource,actionClass:operation==='DELETE_CUSTOM_MCP'?'DELETE':'CREDENTIAL_OR_PERMISSION_CHANGE',projectId:null,runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:null,currency:null}};
 const nativeConnectProof=await runtimeCredentialVault().seal(context,identity(context,nonce,unsigned(value)),digest(unsigned(value)));value.scopeRequirements={nativeConnectProof};
 const confirmation=await createBusinessActionConfirmation(context.userId,{...value,planDigest:actionPlanDigest(value)});
 return{needsConfirmation:true,reviewUrl:`/dashboard/actions/confirm/${confirmation.id}`,message:'Review this exact connection configuration change. No provider configuration has changed.'};
}
export function requireComposioControl(access:ComposioControlAdmission|undefined,context:TenantContext,operation:ComposioControlOperation,parameters:Record<string,unknown>){
 const state=access&&issued.get(access);if(!state?.active||state.context!==requireTenantContext(context)||state.operation!==operation||!isDeepStrictEqual(state.parameters,parameters))throw denied();return{beforeDispatch:state.beforeDispatch,check:state.check};
}
/** Adapter over the existing durable claim and managed vault, not a new issuer. */
export async function executeComposioControl(userId:string,plan:BusinessActionPlan,permit?:AuthorityPermit){
 const{context,scope,binding}=nativeReleaseActor(userId,undefined,plan,permit),operation=plan.toolSlug.slice('XROGA_'.length) as ComposioControlOperation;
 if(!scope||!binding||!['CREATE_CUSTOM_MCP','SYNC_CUSTOM_MCP','DELETE_CUSTOM_MCP','CREATE_AUTOMATION_TRIGGER'].includes(operation)||plan.toolkit!==toolkit||plan.useCase!==useCase||plan.toolSlug!=='XROGA_'+operation||plan.risk!=='write'||!plan.requiresConfirmation||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,['xroga:connect-control'])||scope.connectedAccountId!=='composio:'+plan.arguments.resource||scope.actionClass!==(operation==='DELETE_CUSTOM_MCP'?'DELETE':'CREDENTIAL_OR_PERMISSION_CHANGE')||scope.projectId!==null||scope.runId!==null||scope.maxSpendMicroUsd!==null||scope.currency!==null||plan.sessionId!==`trs_native_connect_${scope.nonce}`||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000)throw denied();
 const proof=plan.scopeRequirements as{nativeConnectProof?:unknown}|undefined,value=unsigned(plan);if(!proof||!isDeepStrictEqual(Object.keys(proof),['nativeConnectProof'])||typeof proof.nativeConnectProof!=='string')throw denied();
 try{if(await runtimeCredentialVault().open(context,identity(context,scope.nonce,value),proof.nativeConnectProof)!==digest(value))throw denied();}catch{throw denied();}
 let consumed=false,writes=0;const check=async()=>{const{data,error}=await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',permit!.grantId).eq('user_id',userId).maybeSingle();if(error||data?.id!==permit!.grantId||data.user_id!==userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||Date.parse(scope.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(data.claimed_at))||consumed&&!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();};
 const access:ComposioControlAdmission=Object.freeze({marker:'native-connect-control'}),state:State={context,operation,parameters:structuredClone(plan.arguments),active:true,check:async()=>{if(!state.active)throw denied();await check();},beforeDispatch:async()=>{
  if(!state.active||++writes>(operation==='CREATE_CUSTOM_MCP'?2:1))throw denied();await check();
  if(!consumed){await enforceEgress({context,actionClass:scope.actionClass,destination:'https://backend.composio.dev/api/v3.1',recipient:scope.connectedAccountId,purpose:'owned-connection-configuration',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:plan.arguments},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:permit},receipt=>persistSecurityDecision(context,receipt));await consumeAuthorityPermit(permit,binding);consumed=true;}
  await check();if(!state.active)throw denied();
 }};issued.set(access,state);
 try{
  const client=await import('./composioClient.js'),input=plan.arguments.input;
  let result:unknown;
  if(operation==='CREATE_CUSTOM_MCP')result=await client.createUserCustomMcpToolkit(userId,input as import('./composioClient.js').XrogaCustomMcpCreateInput,context,access);
  else if(operation==='SYNC_CUSTOM_MCP')result=await client.syncUserCustomMcpToolkit(userId,input as{toolkit:string;connectedAccountId?:string},context,access);
  else if(operation==='DELETE_CUSTOM_MCP')result=await client.deleteUserCustomMcpToolkit(userId,String((input as{toolkit:string}).toolkit),context,access);
  else{const automation=await import('./businessAutomations.js');result=await automation.createBusinessAutomationRule(userId,input as Parameters<typeof automation.createBusinessAutomationRule>[1],context,access);}
  if(!consumed||!result||typeof result!=='object'||(result as{needsConfirmation?:boolean}).needsConfirmation)throw denied();await check();return{ok:true,operation,result:JSON.parse(JSON.stringify(result)) as Record<string,unknown>};
 }finally{state.active=false;issued.delete(access);}
}
