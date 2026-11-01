import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {AuthorityError,consumeAuthorityPermit} from '../../security/authority/enforce.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {requireTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {enforceEgress} from '../../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../../security/egress/securityDecision.js';
import {runtimeCredentialVault} from '../integrations/credentialVaultRuntime.js';
import {actionPlanDigest,type BusinessActionPlan} from '../integrations/businessAction.js';
import {createBusinessActionConfirmation} from '../integrations/businessActionConfirmations.js';
import {inspectNativeArtifactSource,readNativeArtifact,type NativeArtifactReference} from './nativeArtifact.js';
import type {nativeReleaseActor} from './nativeReleaseAdmission.js';
import type {CwsCredentials} from './chromeWebStore.js';

const toolkit='xroga-native-cws',toolSlug='XROGA_PUBLISH_CHROME_WEB_STORE',useCase='Submit an owned extension for Chrome Web Store review';
const denied=()=>new AuthorityError('CWS_PUBLICATION_ADMISSION_DENIED');
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const identity=(context:TenantContext,nonce:string,value:unknown)=>({tenant:context.tenantId,owner:context.userId,provider:'cws-publication-plan',account:'chrome-web-store',credentialType:'artifact-admission',recordId:nonce,revision:digest(value),scope:'cws-publication'});
const proofInput=(plan:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=plan;const{planDigest:_digest,...value}=rest as BusinessActionPlan;return value;};
const held=(creds:CwsCredentials)=>[creds.clientId,creds.clientSecret,creds.refreshToken];
export const cwsPublicationTarget=(creds:CwsCredentials)=>({account:`cws:${creds.publisherId}:${creds.extensionId}`,destination:`https://chromewebstore.googleapis.com/upload/v2/publishers/${creds.publisherId}/items/${creds.extensionId}:upload`,publishDestination:`https://chromewebstore.googleapis.com/v2/publishers/${creds.publisherId}/items/${creds.extensionId}:publish`});
export async function cwsConnection(context:TenantContext):Promise<string>{
 const actor=requireTenantContext(context);
 const{data,error}=await getTenantSupabaseAdmin(actor).from('user_integrations').select('user_id,provider,access_token,credential_revision,metadata').eq('user_id',actor.userId).eq('provider','apikey_cws_oauth').maybeSingle();
 if(error||!data||data.user_id!==actor.userId||data.provider!=='apikey_cws_oauth'||typeof data.access_token!=='string'||!data.access_token||data.metadata?.revoked===true)throw denied();
 return digest([data.user_id,data.provider,data.access_token,data.credential_revision,data.metadata??{}]);
}
export async function prepareCwsPublication(input:{context:TenantContext;repository:string;artifact:NativeArtifactReference;creds:CwsCredentials;connection:string;check:()=>Promise<void>;verifyAccount:(guard:()=>Promise<void>)=>Promise<string>}){
 const artifact={...input.artifact};if(artifact.flavor!=='chrome')throw denied();
 const source=await readNativeArtifact(input.context,input.repository,artifact,held(input.creds));source.zip.fill(0);
 const guard=async()=>{await input.check();await source.check();};
 const accessToken=await input.verifyAccount(guard);
 inspectNativeArtifactSource(source.files,[...held(input.creds),accessToken]);
 const nonce=randomUUID(),issuedAt=new Date().toISOString(),target=cwsPublicationTarget(input.creds);
 const unsigned:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:`trs_native_cws_${nonce}`,useCase,toolkit,toolSlug,
  arguments:{repository:input.repository,artifact,connection:input.connection,...target,publishType:'DEFAULT_PUBLISH'},risk:'write',requiresConfirmation:true,forceConfirmation:true,
  summary:`Upload the approved extension artifact from ${input.repository} and submit ${input.creds.extensionId} under publisher ${input.creds.publisherId} for Google review. Google decides whether and when the listing becomes public.`,requiredScopes:['xroga:cws-publication'],
  authority:{version:'1',userId:input.context.userId,tenantId:input.context.tenantId,connectedAccountId:target.account,actionClass:'PUBLISH',projectId:artifact.projectId,runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:null,currency:null}};
 const value=proofInput(unsigned),nativeCwsProof=await runtimeCredentialVault().seal(input.context,identity(input.context,nonce,value),digest(value));
 await input.check();await source.check();
 unsigned.scopeRequirements={nativeCwsProof};
 const confirmation=await createBusinessActionConfirmation(input.context.userId,{...unsigned,planDigest:actionPlanDigest(unsigned)});
 return{ok:false,submitted:false,needsConfirmation:true,confirmation,reviewUrl:`/dashboard/actions/confirm/${confirmation.id}`,message:'Review the exact extension artifact and Chrome Web Store destination before upload and submission.'};
}
export async function admitCwsPublication(input:{actor:ReturnType<typeof nativeReleaseActor>;permit?:AuthorityPermit;repository:string;creds:CwsCredentials;connection:string;check:()=>Promise<void>}){
 const{context,plan,scope,binding}=input.actor,target=cwsPublicationTarget(input.creds);
 if(!plan||!scope||!binding||plan.toolkit!==toolkit||plan.toolSlug!==toolSlug||plan.useCase!==useCase||plan.risk!=='write'||plan.requiresConfirmation!==true||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,['xroga:cws-publication'])
  ||scope.connectedAccountId!==target.account||scope.actionClass!=='PUBLISH'||scope.runId!==null||scope.maxSpendMicroUsd!==null||scope.currency!==null||plan.sessionId!==`trs_native_cws_${scope.nonce}`||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000)throw denied();
 const args=plan.arguments,artifact=args.artifact as NativeArtifactReference;
 if(!artifact||artifact.flavor!=='chrome'||artifact.projectId!==scope.projectId||!isDeepStrictEqual(args,{repository:input.repository,artifact,connection:input.connection,...target,publishType:'DEFAULT_PUBLISH'}))throw denied();
 const proof=plan.scopeRequirements as{nativeCwsProof?:unknown}|undefined,value=proofInput(plan);
 if(!proof||!isDeepStrictEqual(Object.keys(proof),['nativeCwsProof'])||typeof proof.nativeCwsProof!=='string')throw denied();
 try{if(await runtimeCredentialVault().open(context,identity(context,scope.nonce,value),proof.nativeCwsProof)!==digest(value))throw denied();}catch{throw denied();}
 const source=await readNativeArtifact(context,input.repository,artifact,held(input.creds));
 let consumed=false,uploaded=false,verified=false,published=false;
 const check=async()=>{
  await input.check();await source.check();
  if(Date.parse(scope.expiresAt)<=Date.now())throw denied();
  const{data,error}=await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',input.permit!.grantId).eq('user_id',context.userId).maybeSingle();
  if(error||data?.id!==input.permit!.grantId||data.user_id!==context.userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||!Number.isFinite(Date.parse(data.claimed_at))||consumed&&!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();
  await input.check();
 };
 return{zip:source.zip,close:()=>source.zip.fill(0),check,
  async beforeUpload(accessToken:string){
   if(uploaded)throw denied();uploaded=true;
   inspectNativeArtifactSource(source.files,[...held(input.creds),accessToken]);await check();
   await enforceEgress({context,actionClass:scope.actionClass,destination:target.destination,recipient:target.account,purpose:'chrome-web-store-publication',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:args},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:input.permit},r=>persistSecurityDecision(context,r));
   await consumeAuthorityPermit(input.permit,binding);consumed=true;await check();
  },
  async uploadVerified(){if(!consumed||!uploaded||verified)throw denied();await check();verified=true;},
  async beforePublish(){if(!consumed||!verified||published)throw denied();published=true;await check();},
 };
}
