import{isTerminalModelFailure}from'../../ai/providerRuntime.js';
import{randomUUID,createHash}from'node:crypto';import{isDeepStrictEqual}from'node:util';
import{requireTenantContext,type TenantContext}from'../../security/tenantContext.js';
import{AuthorityError,consumeAuthorityPermit}from'../../security/authority/enforce.js';import type{AuthorityPermit}from'../../security/authority/types.js';
import{getTenantSupabaseAdmin}from'../../security/serviceRoleGuard.js';import{preparedActionDigest}from'../../security/authority/digest.js';
import{enforceEgress}from'../../security/egress/egressPolicy.js';import{persistSecurityDecision}from'../../security/egress/securityDecision.js';import{containsCredentialSecretText}from'../../security/egress/dataClassification.js';
import{runtimeCredentialVault}from'../integrations/credentialVaultRuntime.js';import{actionPlanDigest,type BusinessActionPlan}from'../integrations/businessAction.js';import{createBusinessActionConfirmation}from'../integrations/businessActionConfirmations.js';
import{nativeReleaseActor,nativeReleaseConnection}from'./nativeReleaseAdmission.js';import{requireNativeArtifactProject}from'./nativeArtifact.js';

const toolkit='xroga-native-desktop-workflow',operation='XROGA_DESKTOP_RELEASE_TAG',useCase='Create one exact immutable desktop release tag';
const denied=()=>new AuthorityError('DESKTOP_WORKFLOW_ADMISSION_DENIED'),hash=(text:string)=>createHash('sha256').update(text).digest('hex'),digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const unsigned=(plan:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=plan;const{planDigest:_digest,...value}=rest as BusinessActionPlan;return value;};
const identity=(context:TenantContext,nonce:string,value:unknown)=>({tenant:context.tenantId,owner:context.userId,provider:'desktop-workflow-plan',account:'github',credentialType:'prepared-workflow',recordId:nonce,revision:digest(value),scope:'desktop-workflow'});
export interface DesktopWorkflowInput{userId:string;tenantContext?:TenantContext;signal?:AbortSignal;repoFullName:string;commitSha?:string;version?:string;projectId?:string;plan?:BusinessActionPlan;authorityPermit?:AuthorityPermit}
export interface DesktopWorkflowTransport{token:string;check:()=>Promise<void>;request:(path:string,init?:RequestInit)=>Promise<Response>;sourceRequest:(token:string,path:string,init?:RequestInit)=>Promise<Response>}
type AccessFor=(input:DesktopWorkflowInput)=>Promise<DesktopWorkflowTransport>;
async function tagReceipt(response:Response){let value:unknown;try{value=await response.json();}catch{throw denied();}if(!value||typeof value!=='object'||Array.isArray(value))throw denied();return value as{ref?:unknown;object?:{sha?:unknown;type?:unknown}};}


/** Remote workflow text is source data, never an issuer of execution authority. */
async function workflowSource(context:TenantContext,access:DesktopWorkflowTransport,repository:string,ref:string|undefined,projectId:string|undefined,signal?:AbortSignal,claim?:()=>Promise<void>){
 const project=await requireNativeArtifactProject(context,repository,projectId),connection=await nativeReleaseConnection(context);
 const check=async()=>{signal?.throwIfAborted();await access.check();await requireNativeArtifactProject(context,repository,project);if(await nativeReleaseConnection(context)!==connection)throw denied();if(claim)await claim();signal?.throwIfAborted();};
 const read=async(path:string)=>{await check();try{const response=await access.sourceRequest(access.token,path,{signal});await check();if(!response.ok)throw new Error();return await response.json() as Record<string,unknown>;}catch(error){await check();if(isTerminalModelFailure(error))throw denied();throw new Error('The selected desktop workflow source is unavailable. No release was requested.');}};
 const repo=await read(`/repos/${repository}`);if(repo.full_name!==repository||(repo.permissions as{push?:unknown})?.push!==true)throw denied();
 const selected=ref??repo.default_branch;if(typeof selected!=='string'||!selected||selected.length>120||/[\x00-\x20\x7f]/.test(selected)||containsCredentialSecretText(selected))throw denied();
 const commit=await read(`/repos/${repository}/commits/${encodeURIComponent(selected)}`);if(typeof commit.sha!=='string'||!/^[a-f0-9]{40}$/.test(commit.sha))throw denied();
 if(ref&&commit.sha!==ref)throw denied();
 const path='.github/workflows/release.yml',file=await read(`/repos/${repository}/contents/${path}?ref=${commit.sha}`);
 if(file.type!=='file'||file.path!==path||file.name!=='release.yml'||file.encoding!=='base64'||typeof file.content!=='string'||!Number.isSafeInteger(file.size)||Number(file.size)<1||Number(file.size)>256*1024)throw denied();
 const encoded=file.content.replace(/\s/g,''),bytes=Buffer.from(encoded,'base64'),text=bytes.toString('utf8');
 if(bytes.length!==file.size||bytes.toString('base64')!==encoded||Buffer.from(text).compare(bytes)!==0||containsCredentialSecretText(text)||[access.token,encodeURIComponent(access.token),Buffer.from(access.token).toString('base64'),Buffer.from(access.token).toString('base64url')].some(value=>value.length>=8&&text.includes(value)))throw denied();
 await check();return{value:{repository,projectId:project,connection,commitSha:commit.sha,workflowPath:path,workflowSha256:hash(text)},check};
}

export async function requestDesktopWorkflow(original:DesktopWorkflowInput,accessFor:AccessFor){
 const actor=nativeReleaseActor(original.userId,original.tenantContext,original.plan,original.authorityPermit),{context,plan,scope,binding}=actor;
 const input={...original,userId:context.userId},repository=input.repoFullName,tag=input.version?.startsWith('v')?input.version:`v${input.version||'1.0.0'}`;
 if(!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/.test(repository)||/^\.+$/.test(repository.split('/')[1]!)||!/^v[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}(?:-[A-Za-z0-9][A-Za-z0-9.-]{0,40})?$/.test(tag)||input.commitSha!==undefined&&!/^[a-f0-9]{40}$/.test(input.commitSha)||containsCredentialSecretText(tag))throw denied();
 let consumed=false;
 const checkClaim=async()=>{if(!plan||!scope||!binding)throw denied();const{data,error}=await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',input.authorityPermit!.grantId).eq('user_id',context.userId).maybeSingle();if(error||data?.id!==input.authorityPermit!.grantId||data.user_id!==context.userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||Date.parse(scope.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(data.claimed_at))||consumed&&!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();};
 if(plan){
  if(!scope||!binding||plan.toolkit!==toolkit||plan.toolSlug!==operation||plan.useCase!==useCase||plan.risk!=='write'||!plan.requiresConfirmation||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,['xroga:desktop-workflow'])||scope.actionClass!=='PUBLISH'||scope.connectedAccountId!=='github:'+repository||scope.runId!==null||scope.maxSpendMicroUsd!==null||scope.currency!==null||plan.sessionId!=='trs_native_desktop_'+scope.nonce||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000)throw denied();
  const proof=plan.scopeRequirements as{nativeDesktopProof?:unknown}|undefined;if(!proof||!isDeepStrictEqual(Object.keys(proof),['nativeDesktopProof'])||typeof proof.nativeDesktopProof!=='string')throw denied();try{if(await runtimeCredentialVault().open(context,identity(context,scope.nonce,unsigned(plan)),proof.nativeDesktopProof)!==digest(unsigned(plan)))throw denied();}catch{throw denied();}await checkClaim();
 }
 input.signal?.throwIfAborted();const access=await accessFor({...input,tenantContext:context}),source=await workflowSource(context,access,repository,input.commitSha,input.projectId,input.signal,plan?checkClaim:undefined),parameters={...source.value,tag};
 const absent=async()=>{await source.check();const existing=await access.request(`/repos/${repository}/git/ref/tags/${tag}`);await source.check();if(existing.status!==404)throw new AuthorityError('DESKTOP_RELEASE_TAG_ALREADY_EXISTS_OR_UNAVAILABLE');};
 await absent();
 if(!plan){
  const nonce=randomUUID(),issuedAt=new Date().toISOString(),value:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:'trs_native_desktop_'+nonce,useCase,toolkit,toolSlug:operation,arguments:parameters,risk:'write',requiresConfirmation:true,forceConfirmation:true,summary:`Create tag ${tag} in ${repository}, pointing only to commit ${source.value.commitSha}. This can trigger the repository's configured tag workflows and external hooks, including desktop builds using its configured signing credentials. Review release.yml at this exact commit. GitHub Actions runs code and may incur charges on your GitHub account. No alternate branch or workflow dispatch fallback is allowed. Tag creation is not proof that installers finished.`,requiredScopes:['xroga:desktop-workflow'],authority:{version:'1',userId:context.userId,tenantId:context.tenantId,connectedAccountId:'github:'+repository,actionClass:'PUBLISH',projectId:source.value.projectId,runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:null,currency:null}};
  const nativeDesktopProof=await runtimeCredentialVault().seal(context,identity(context,nonce,unsigned(value)),digest(unsigned(value)));await source.check();value.scopeRequirements={nativeDesktopProof};
  const confirmation=await createBusinessActionConfirmation(context.userId,{...value,planDigest:actionPlanDigest(value)});
  return{ok:false,needsConfirmation:true,reviewUrl:'/dashboard/actions/confirm/'+confirmation.id,tag,actionsUrl:`https://github.com/${repository}/actions`,releasesUrl:`https://github.com/${repository}/releases`};
 }
 if(!scope||!binding||!isDeepStrictEqual(plan.arguments,parameters)||scope.projectId!==source.value.projectId)throw denied();
 await enforceEgress({context,actionClass:'PUBLISH',destination:`https://api.github.com/repos/${repository}/git/refs`,recipient:repository,purpose:'exact-immutable-desktop-release-tag',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:plan.arguments},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:input.authorityPermit},receipt=>persistSecurityDecision(context,receipt));
 await consumeAuthorityPermit(input.authorityPermit,binding);consumed=true;await absent();
 const response=await access.request(`/repos/${repository}/git/refs`,{method:'POST',body:JSON.stringify({ref:'refs/tags/'+tag,sha:source.value.commitSha})});await source.check();
 if(response.status!==201)throw new AuthorityError('DESKTOP_RELEASE_TAG_NOT_VERIFIED');
 const receipt=await tagReceipt(response);
 if(receipt.ref!=='refs/tags/'+tag||receipt.object?.sha!==source.value.commitSha||receipt.object.type!=='commit')throw denied();
 const readback=await access.request(`/repos/${repository}/git/ref/tags/${tag}`);if(!readback.ok)throw denied();const current=await tagReceipt(readback);await source.check();
 if(current.ref!==receipt.ref||current.object?.sha!==source.value.commitSha||current.object.type!=='commit')throw denied();
 return{ok:true,requested:true,tag,commitSha:source.value.commitSha,actionsUrl:`https://github.com/${repository}/actions`,releasesUrl:`https://github.com/${repository}/releases`};
}

export async function executeDesktopWorkflow(userId:string,plan:BusinessActionPlan,authorityPermit?:AuthorityPermit){
 const{triggerElectronDesktopRelease}=await import('./nonWebShip.js'),args=plan.arguments;
 const result=await triggerElectronDesktopRelease({userId,plan,authorityPermit,repoFullName:String(args.repository),commitSha:String(args.commitSha),version:String(args.tag),projectId:String(args.projectId)});
 if(!result.ok||!('requested'in result)||!result.requested)throw denied();return result;
}
