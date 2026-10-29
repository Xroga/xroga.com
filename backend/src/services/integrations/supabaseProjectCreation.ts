import {randomBytes,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {requireTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {AuthorityError,consumeAuthorityPermit} from '../../security/authority/enforce.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {classifyOutboundData} from '../../security/egress/dataClassification.js';
import {enforceEgress,EgressDenied} from '../../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../../security/egress/securityDecision.js';
import {captureSupabaseAccess,type SupabaseAccess} from './supabaseAccess.js';
import {getSupabaseOAuthAccessToken} from './supabaseAuth.js';
import {runtimeCredentialVault} from './credentialVaultRuntime.js';
import {actionPlanDigest,type BusinessActionPlan} from './businessAction.js';
import {createBusinessActionConfirmation} from './businessActionConfirmations.js';
import {nativeReleaseActor} from '../publish/nativeReleaseAdmission.js';

const toolkit='xroga-native-supabase-create',operation='XROGA_SUPABASE_CREATE_PROJECT',useCase='Create exactly one owned Free-plan Supabase project';
const denied=()=>new AuthorityError('SUPABASE_PROJECT_CREATION_DENIED');
export const supabaseProjectCreationInput=z.object({name:z.string().trim().min(2).max(64).refine(value=>!/[\x00-\x1f\x7f]/.test(value)),organizationId:z.string().regex(/^[a-z0-9-]{2,64}$/),region:z.string().regex(/^[a-z]{2}(?:-[a-z0-9]+){1,3}-[0-9]$/).default('us-east-1')}).strict();
type Input=z.infer<typeof supabaseProjectCreationInput>;
const unsigned=(plan:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=plan;const{planDigest:_digest,...value}=rest as BusinessActionPlan;return value;};
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const identity=(context:TenantContext,nonce:string,value:unknown)=>({tenant:context.tenantId,owner:context.userId,provider:'supabase-create-plan',account:'supabase',credentialType:'prepared-creation',recordId:nonce,revision:digest(value),scope:'supabase-project-create'});

/** Fixed Management API only. No caller headers, redirects or mutation retries. */
async function projectRequest(access:SupabaseAccess,token:string,path:string,body?:Record<string,unknown>,beforeWrite?:()=>Promise<void>):Promise<unknown>{
 const write=body!==undefined;
 if(!token||token.length>16384||/[\x00-\x20\x7f]/.test(token)||!(write?path==='/projects'&&beforeWrite:path==='/organizations'||/^\/organizations\/[a-z0-9-]{2,64}$/.test(path)||/^\/projects\/[a-z0-9]{1,63}$/.test(path)))throw denied();
 await access.check();if(write)await beforeWrite!();await access.check();
 const signal=AbortSignal.timeout(30000);signal.throwIfAborted();
 try{
 const response=await fetch(`https://api.supabase.com/v1${path}`,{method:write?'POST':'GET',redirect:'manual',signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(write?{body:JSON.stringify(body)}:{})});
 if(response.redirected||response.status>=300&&response.status<400||response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);throw denied();}
 if(!response.ok){await response.body?.cancel().catch(()=>undefined);await access.check();throw new Error('Supabase did not complete this operation. No automatic retry was made. Check the selected organization before preparing another request.');}
 const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{if(reader)for(;;){const part=await reader.read();if(part.done)break;signal.throwIfAborted();bytes+=part.value.byteLength;if(bytes>128000)throw denied();chunks.push(part.value);}}
 finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
 signal.throwIfAborted();await access.check();try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw denied();}
 }catch(error){if(error instanceof AuthorityError||error instanceof EgressDenied)throw error;if(write)throw new AuthorityError('SUPABASE_CREATE_RESULT_UNCERTAIN');throw new Error('Supabase organization information is unavailable. No automatic retry was made.');}
}

async function ownedFreeOrganization(access:SupabaseAccess,token:string,input:Input){
 const orgs=z.array(z.object({id:z.string().min(1).max(128),slug:z.string().regex(/^[a-z0-9-]{2,64}$/),name:z.string().max(256)})).max(1000).safeParse(await projectRequest(access,token,'/organizations'));
 if(!orgs.success)throw denied();const matches=orgs.data.filter(row=>row.id===input.organizationId||row.slug===input.organizationId);if(matches.length!==1)throw denied();
 const selected=matches[0]!,current=z.object({id:z.string(),plan:z.string()}).safeParse(await projectRequest(access,token,'/organizations/'+selected.slug));
 if(!current.success||current.data.id!==selected.id||current.data.plan!=='free')throw denied();
 return{id:selected.id,slug:selected.slug,plan:'free' as const};
}

export async function prepareSupabaseProjectCreation(supplied:TenantContext,input:Input,signal?:AbortSignal){
 const context=requireTenantContext(supplied);signal?.throwIfAborted();input=supabaseProjectCreationInput.parse(input);
 if(classifyOutboundData(input,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
 const token=await getSupabaseOAuthAccessToken(context.userId);if(!token)throw denied();
 const access=await captureSupabaseAccess(context,signal);
 try{
  const organization=await ownedFreeOrganization(access,token,input),nonce=randomUUID(),issuedAt=new Date().toISOString();
  const value:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:'trs_native_supabase_create_'+nonce,useCase,toolkit,toolSlug:operation,arguments:{input,organization,connection:access.fingerprint},risk:'write',requiresConfirmation:true,forceConfirmation:true,summary:`Create one Supabase project named ${input.name} in organization ${organization.slug}, region ${input.region}, only while its plan is Free. Maximum additional approved spending is $0. A quota rejection is final. No plan upgrade, SQL, existing project change, key export or Vercel deployment is included. After creation, select this project to authorize connection and schema setup separately.`,requiredScopes:['xroga:supabase-create'],authority:{version:'1',userId:context.userId,tenantId:context.tenantId,connectedAccountId:'supabase-org:'+organization.slug,actionClass:'CREATE',projectId:null,runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:'0',currency:'USD'}};
  // Durable encrypted escrow survives an uncertain external create. This is a
  // native database-auth channel, never a tool argument or generic secret export.
  const nativeCreateProof=await runtimeCredentialVault().seal(context,identity(context,nonce,unsigned(value)),JSON.stringify({digest:digest(unsigned(value)),databasePassword:randomBytes(24).toString('base64url')}));
  await access.check();value.scopeRequirements={nativeCreateProof};
  const confirmation=await createBusinessActionConfirmation(context.userId,{...value,planDigest:actionPlanDigest(value)});
  return{ok:false,needsConfirmation:true,reviewUrl:'/dashboard/actions/confirm/'+confirmation.id,message:'Review the exact Free-plan project creation. No project has been created.'};
 }finally{access.close();}
}

/** Runs only through the existing durable businessAction claim and permit. */
export async function executeSupabaseProjectCreation(userId:string,original:BusinessActionPlan,permit?:AuthorityPermit){
 const{context,plan,scope,binding}=nativeReleaseActor(userId,undefined,original,permit);
 if(!plan||!scope||!binding||plan.toolkit!==toolkit||plan.toolSlug!==operation||plan.useCase!==useCase||plan.risk!=='write'||!plan.requiresConfirmation||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,['xroga:supabase-create'])||scope.actionClass!=='CREATE'||scope.projectId!==null||scope.runId!==null||scope.maxSpendMicroUsd!=='0'||scope.currency!=='USD'||plan.sessionId!=='trs_native_supabase_create_'+scope.nonce||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000||!isDeepStrictEqual(Object.keys(plan.arguments).sort(),['connection','input','organization']))throw denied();
 const input=supabaseProjectCreationInput.parse(plan.arguments.input),proof=plan.scopeRequirements as{nativeCreateProof?:unknown}|undefined;
 if(!proof||!isDeepStrictEqual(Object.keys(proof),['nativeCreateProof'])||typeof proof.nativeCreateProof!=='string')throw denied();
 let password:string;
 try{const receipt=JSON.parse(await runtimeCredentialVault().open(context,identity(context,scope.nonce,unsigned(plan)),proof.nativeCreateProof));if(receipt.digest!==digest(unsigned(plan))||typeof receipt.databasePassword!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(receipt.databasePassword))throw denied();password=receipt.databasePassword;}catch{throw denied();}
 let consumed=false,dispatched=false;
 const checkClaim=async()=>{const{data,error}=await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',permit!.grantId).eq('user_id',userId).maybeSingle();if(error||data?.id!==permit!.grantId||data.user_id!==userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||Date.parse(scope.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(data.claimed_at))||consumed&&!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();};
 await checkClaim();const token=await getSupabaseOAuthAccessToken(userId);if(!token)throw denied();
 const access=await captureSupabaseAccess(context,undefined,checkClaim);
 try{
  if(access.fingerprint!==plan.arguments.connection)throw denied();
  const organization=await ownedFreeOrganization(access,token,input);
  if(!isDeepStrictEqual(organization,plan.arguments.organization)||scope.connectedAccountId!=='supabase-org:'+organization.slug)throw denied();
  const created=await projectRequest(access,token,'/projects',{name:input.name,organization_slug:organization.slug,region:input.region,db_pass:password},async()=>{
   if(dispatched)throw denied();dispatched=true;await access.check();
   await enforceEgress({context,actionClass:'CREATE',destination:'https://api.supabase.com/v1/projects',recipient:scope.connectedAccountId,purpose:'exact-free-project-creation',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:plan.arguments},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:permit},receipt=>persistSecurityDecision(context,receipt));
   await consumeAuthorityPermit(permit,binding);consumed=true;
   if(!isDeepStrictEqual(await ownedFreeOrganization(access,token,input),organization))throw denied();await access.check();
  });
  const receipt=z.object({id:z.string().min(1).max(128),ref:z.string().regex(/^[a-z0-9]{1,63}$/),organization_slug:z.literal(organization.slug),name:z.literal(input.name),region:z.literal(input.region),status:z.string().min(1).max(64)}).safeParse(created);
  if(!receipt.success||!consumed)throw denied();await access.check();
  const readback=z.object({ref:z.literal(receipt.data.ref),organization_slug:z.literal(organization.slug),name:z.literal(input.name),region:z.literal(input.region)}).safeParse(await projectRequest(access,token,'/projects/'+receipt.data.ref));
  if(!readback.success)throw denied();
  if(!isDeepStrictEqual(await ownedFreeOrganization(access,token,input),organization))throw denied();
  return{ok:true,projectRef:receipt.data.ref,name:receipt.data.name,organization:organization.slug,region:receipt.data.region,provisioned:false,connected:false,message:'The exact project was created. Select it in Supabase integrations to connect and review schema/private-storage setup. No existing connection was replaced.'};
 }finally{password='';access.close();}
}
