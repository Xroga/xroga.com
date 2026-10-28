/** Native signing material uses the existing exact business-action confirmation.
 * Only a repository-key sealed box may cross the fixed GitHub boundary. */
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {getGitHubToken} from '../integrations/githubAuth.js';
import {getUserProviderKey} from '../integrations/userProviderKeys.js';
import {runtimeCredentialVault} from '../integrations/credentialVaultRuntime.js';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {requireTenantContext,requireResourceOwner,type TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {AuthorityError,authorityContextForPermit,consumeAuthorityPermit} from '../../security/authority/enforce.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import {EgressDenied,enforceEgress} from '../../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../../security/egress/securityDecision.js';
import {actionPlanDigest,businessActionAuthorityScope,snapshotBusinessActionPlan,type BusinessActionPlan} from '../integrations/businessAction.js';
import {createBusinessActionConfirmation,type SafeBusinessActionConfirmation} from '../integrations/businessActionConfirmations.js';
const materialNames={CSC_LINK:'electron_csc_link',CSC_KEY_PASSWORD:'electron_csc_password',APPLE_ID:'electron_apple_id',APPLE_APP_SPECIFIC_PASSWORD:'electron_apple_password',APPLE_TEAM_ID:'electron_apple_team_id'} as const;
const toolkit='xroga-native-signing',toolSlug='XROGA_SET_SIGNING_MATERIAL',useCase='Configure GitHub Actions signing material';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const denied=()=>new AuthorityError('SIGNING_MATERIAL_ADMISSION_DENIED');
// Match the canonical durable-plan representation, including JSONB key order.
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const signingProofIdentity=(context:TenantContext,repository:string,nonce:string,parameters:unknown)=>({tenant:context.tenantId,owner:context.userId,provider:'github-signing-plan',account:`github:${repository}`,credentialType:'sealed-box-admission',recordId:nonce,revision:digest(parameters),scope:'native-signing-transfer'});
async function canonicalRow(context:TenantContext,provider:string){
 const {data,error}=await getTenantSupabaseAdmin(context).from('user_integrations').select('user_id,provider,access_token,credential_revision,metadata').eq('user_id',context.userId).eq('provider',provider).maybeSingle();
 if(error)throw denied();
 if(!data||data.metadata?.revoked===true||!data.access_token)return null;
 if(data.user_id!==context.userId||data.provider!==provider||typeof data.access_token!=='string')throw denied();
 return digest([data.user_id,data.provider,data.access_token,data.credential_revision,data.metadata??{}]);
}
async function sourceMaterial(context:TenantContext,provider:string){
 const selected=await canonicalRow(context,'apikey_'+provider);if(!selected)return null;
 const value=await getUserProviderKey(context.userId,provider);
 if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value.trim())>16000||await canonicalRow(context,'apikey_'+provider)!==selected)throw denied();
 return {value:value.trim(),binding:selected};
}
async function ownedProject(context:TenantContext,repository:string,expected?:string){
 const {data,error}=await getTenantSupabaseAdmin(context).from('projects').select('id,user_id,github_repo_name').eq('user_id',context.userId).ilike('github_repo_name',repository.replace(/[\\%_]/g,'\\$&')).maybeSingle();
 if(error||!data||data.user_id!==context.userId||typeof data.id!=='string'||!uuid.test(data.id)||typeof data.github_repo_name!=='string'||data.github_repo_name.toLowerCase()!==repository.toLowerCase()||expected!==undefined&&expected!==data.id)throw denied();
 return data.id as string;
}
async function checkedGitHubReceipt(response:Response){
 if(response.redirected||response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw new EgressDenied('UNSAFE_DESTINATION');}
 if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);throw new AuthorityError('SIGNING_PROVIDER_AUTHORIZATION_DENIED');}
 if(!response.ok){await response.body?.cancel().catch(()=>undefined);throw new Error('Signing configuration provider is unavailable.');}
 const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{if(reader)for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>65536)throw new EgressDenied('INVALID_EGRESS_INPUT');chunks.push(next.value);}}
 finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
 return {status:response.status,json:()=>JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown};
}
interface SigningInput {userId:string;tenantContext?:TenantContext;repoFullName?:string;name?:string;plan?:BusinessActionPlan;authorityPermit?:AuthorityPermit;signal?:AbortSignal}
async function putRepoSecret(opts:SigningInput):Promise<{plan:BusinessActionPlan}|{synced:string}>{
 const plan=opts.plan?snapshotBusinessActionPlan(opts.plan):undefined;
 const scope=plan?businessActionAuthorityScope(plan):undefined;
 const binding=scope?{userId:opts.userId,provider:scope.provider,connectedAccountId:scope.connectedAccountId,operation:scope.operation,targetDigest:scope.targetDigest,planDigest:scope.planDigest}:undefined;
 const context=binding?authorityContextForPermit(opts.authorityPermit,binding):requireTenantContext(opts.tenantContext);requireResourceOwner(context,opts.userId);
 const repoFullName=plan?.arguments.repository??opts.repoFullName,name=plan?.arguments.name??opts.name;
 if(typeof repoFullName!=='string'||typeof name!=='string'||!Object.hasOwn(materialNames,name))throw denied();
 const parsed=parseElectronSecretRepository(repoFullName);if(!parsed||repoFullName!==`${parsed.owner}/${parsed.repo}`)throw denied();
 const repository=`${parsed.owner}/${parsed.repo}`,provider=materialNames[name as keyof typeof materialNames],signal=opts.signal;
 const projectId=await ownedProject(context,repository,scope?.projectId??undefined);
 const connection=await canonicalRow(context,'github'),token=await getGitHubToken(context.userId),material=await sourceMaterial(context,provider);
 if(!connection||!token||!material||await canonicalRow(context,'github')!==connection)throw denied();
 let consumed=false;
 const check=async()=>{signal?.throwIfAborted();requireResourceOwner(context,opts.userId);await ownedProject(context,repository,projectId);
  if(await canonicalRow(context,'github')!==connection||await getGitHubToken(context.userId)!==token||await canonicalRow(context,'apikey_'+provider)!==material.binding)throw denied();
  if(consumed){
   const {data,error}=await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',opts.authorityPermit!.grantId).eq('user_id',context.userId).maybeSingle();
   if(error||!scope||data?.id!==opts.authorityPermit!.grantId||data.user_id!==context.userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||!Number.isFinite(Date.parse(data.claimed_at))||!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();
  }
  if(scope&&Date.parse(scope.expiresAt)<=Date.now())throw new AuthorityError('AUTHORITY_EXPIRED');signal?.throwIfAborted();};
 await check();
 if(plan){
  const body=plan.arguments.body as {key_id?:unknown;encrypted_value?:unknown}|null;
  if(!scope||!binding||plan.toolkit!==toolkit||plan.toolSlug!==toolSlug||plan.useCase!==useCase||plan.sessionId!==`trs_native_signing_${scope.nonce}`||!uuid.test(scope.nonce)||plan.risk!=='write'||plan.requiresConfirmation!==true||plan.forceConfirmation!==true
   ||scope.actionClass!=='CREDENTIAL_OR_PERMISSION_CHANGE'||scope.connectedAccountId!==`github:${repository}`||scope.projectId!==projectId||scope.runId!==null||scope.maxSpendMicroUsd!==null||scope.currency!==null||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000
   ||plan.summary!==`Set ${name} in GitHub Actions for ${repository}. Only repository-key encrypted signing material will be sent.`||!isDeepStrictEqual(plan.requiredScopes,['xroga:signing-material'])||!body||typeof body.encrypted_value!=='string'||typeof body.key_id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(body.key_id)||typeof plan.arguments.publicKey!=='string'
   ||!isDeepStrictEqual(body,{key_id:body.key_id,encrypted_value:body.encrypted_value})
   ||!isDeepStrictEqual(plan.arguments,{repository,name,destination:`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/actions/secrets/${name}`,projectId,connection,source:material.binding,publicKey:plan.arguments.publicKey,body}))throw denied();
  const proof=plan.scopeRequirements as {nativeSigningProof?:unknown}|null;
  if(!proof||typeof proof.nativeSigningProof!=='string'||!isDeepStrictEqual(Object.keys(proof),['nativeSigningProof']))throw denied();
  try{if(await runtimeCredentialVault().open(context,signingProofIdentity(context,repository,scope.nonce,plan.arguments),proof.nativeSigningProof)!==digest(plan.arguments))throw denied();}catch{throw denied();}
  await check();
 }
 const imported=await import('libsodium-wrappers'),sodium=imported.default??imported;await sodium.ready;await check();
 const keyRes=await checkedGitHubReceipt(await fetch(`https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/actions/secrets/public-key`,{
  method:'GET',redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(25000),...(signal?[signal]:[])]),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
 }));
 const keyData=keyRes.json() as {key?:unknown;key_id?:unknown};
 if(typeof keyData.key!=='string'||typeof keyData.key_id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(keyData.key_id))throw denied();
 let binKey:Uint8Array;try{binKey=sodium.from_base64(keyData.key,sodium.base64_variants.ORIGINAL);}catch{throw denied();}
 if(binKey.length!==sodium.crypto_box_PUBLICKEYBYTES||sodium.to_base64(binKey,sodium.base64_variants.ORIGINAL)!==keyData.key)throw denied();
 await check();
 const destination=`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/actions/secrets/${name}`;
 if(!plan){
  const encrypted=sodium.to_base64(sodium.crypto_box_seal(Buffer.from(material.value),binKey),sodium.base64_variants.ORIGINAL),nonce=randomUUID(),issuedAt=new Date().toISOString();
  const unsigned:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:`trs_native_signing_${nonce}`,toolkit,toolSlug,useCase,
   arguments:{repository,name,destination,projectId,connection,source:material.binding,publicKey:keyData.key,body:{key_id:keyData.key_id,encrypted_value:encrypted}},
   risk:'write',requiresConfirmation:true,forceConfirmation:true,summary:`Set ${name} in GitHub Actions for ${repository}. Only repository-key encrypted signing material will be sent.`,requiredScopes:['xroga:signing-material'],
   authority:{version:'1',userId:context.userId,tenantId:context.tenantId,connectedAccountId:`github:${repository}`,actionClass:'CREDENTIAL_OR_PERMISSION_CHANGE',projectId,runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:null,currency:null}};
  // Bind the exact sealed box to its trusted producer across process restarts.
  // Reuse the existing managed vault and identity binding, without a new key,
  // credential store or request-supplied signer.
  const nativeSigningProof=await runtimeCredentialVault().seal(context,signingProofIdentity(context,repository,nonce,unsigned.arguments),digest(unsigned.arguments));
  await check();unsigned.scopeRequirements={nativeSigningProof};
  return {plan:{...unsigned,planDigest:actionPlanDigest(unsigned)}};
 }
 const body=plan.arguments.body as {key_id:string;encrypted_value:string};
 if(!scope||!binding||plan.arguments.publicKey!==keyData.key||body.key_id!==keyData.key_id)throw denied();
 let encrypted:Uint8Array;try{encrypted=sodium.from_base64(body.encrypted_value,sodium.base64_variants.ORIGINAL);}catch{throw denied();}
 if(encrypted.length!==Buffer.byteLength(material.value)+sodium.crypto_box_SEALBYTES||sodium.to_base64(encrypted,sodium.base64_variants.ORIGINAL)!==body.encrypted_value)throw denied();
 // The exact ciphertext was server-prepared from the pinned owner's canonical
 // source row and this repository's current public key. Plaintext is never part
 // of the plan, model input, egress evidence, errors or HTTP upload body.
 const payload={sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:plan.arguments};
 await enforceEgress({context,actionClass:scope.actionClass,destination,recipient:repository,purpose:'github-actions-signing-material',payload,declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:opts.authorityPermit},r=>persistSecurityDecision(context,r));
 await consumeAuthorityPermit(opts.authorityPermit,binding);consumed=true;await check();
 const put=await checkedGitHubReceipt(await fetch(destination,{method:'PUT',redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(25000),...(signal?[signal]:[])]),
  headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify(body)}));
 await check();if(!(put.status === 201 || put.status === 204))throw denied();return{synced:name};
}

export function parseElectronSecretRepository(fullName: string): { owner: string; repo: string } | null {
  if (typeof fullName !== 'string' || fullName !== fullName.trim()) return null;
  const parts = fullName.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').split('/');
  if (parts.length !== 2) return null;
  const owner = parts[0]!, repo = parts[1]!.replace(/\.git$/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)
    || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo };
}


/** Preparation never transfers signing material. Each exact write uses the same
 * canonical durable approval as other consequential business actions. */
export async function syncElectronSigningSecretsToGitHub(opts:{userId:string;repoFullName:string;tenantContext?:TenantContext;signal?:AbortSignal}):Promise<{ok:boolean;synced:string[];message:string;needsConfirmation?:boolean;confirmations?:SafeBusinessActionConfirmation[]}>{
 const parsed=parseElectronSecretRepository(opts.repoFullName);if(!parsed)return{ok:false,synced:[],message:'Invalid repo'};
 const context=requireTenantContext(opts.tenantContext);requireResourceOwner(context,opts.userId);
 const repository=`${parsed.owner}/${parsed.repo}`,plans:BusinessActionPlan[]=[];
 await ownedProject(context,repository);
 for(const[name,provider]of Object.entries(materialNames)){
  if(!await canonicalRow(context,'apikey_'+provider))continue;
  const prepared=await putRepoSecret({userId:context.userId,tenantContext:context,repoFullName:repository,name,signal:opts.signal});
  if(!('plan'in prepared))throw denied();plans.push(prepared.plan);
 }
 if(!plans.length)return{ok:true,synced:[],message:'No signing material is configured. No GitHub secret was changed.'};
 const confirmations:SafeBusinessActionConfirmation[]=[];
 for(const plan of plans){
  const current=await createBusinessActionConfirmation(context.userId,plan);
  const {id,status,summary,toolkit,risk,createdAt,expiresAt,toolSlug}=current;
  confirmations.push({id,status,summary,toolkit,risk,createdAt,expiresAt,toolSlug});
 }
 return{ok:false,synced:[],needsConfirmation:true,confirmations,message:'Review each signing-material transfer before changing GitHub Actions secrets.'};
}
export async function executeElectronSigningMaterial(userId:string,plan:BusinessActionPlan,authorityPermit?:AuthorityPermit){
 const result=await putRepoSecret({userId,plan,authorityPermit});if(!('synced'in result))throw denied();return{ok:true,synced:[result.synced],message:'The approved repository signing material was updated.'};
}
