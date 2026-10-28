import {randomUUID,createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {requireTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {requireOwnedProject} from '../../security/ownership.js';import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {AuthorityError,consumeAuthorityPermit} from '../../security/authority/enforce.js';import type {AuthorityPermit} from '../../security/authority/types.js';
import {preparedActionDigest} from '../../security/authority/digest.js';import {enforceEgress,EgressDenied} from '../../security/egress/egressPolicy.js';import {persistSecurityDecision} from '../../security/egress/securityDecision.js';import {classifyOutboundData} from '../../security/egress/dataClassification.js';
import {runtimeCredentialVault} from './credentialVaultRuntime.js';import {createBusinessActionConfirmation} from './businessActionConfirmations.js';import {actionPlanDigest,type BusinessActionPlan} from './businessAction.js';import {nativeReleaseActor} from '../publish/nativeReleaseAdmission.js';
import {inspectNativeArtifactSource} from '../publish/nativeArtifact.js';import {storeProjectFile} from '../storage/projectFiles.js';import {ownedFile,downloadPrivateFile} from '../storage/privateFileDelivery.js';import {fileFingerprint} from '../storage/fileDeliveryPolicy.js';
import type {ProjectFile} from './githubDeploy.js';import {createGitHubRequestScope,installGitHubWriteGuard,type GitHubCall} from './githubRequest.js';

export type GitHubNativeKind='PUSH'|'RESTORE'|'TEMPLATE';
export interface GitHubPending{needsConfirmation:true;reviewUrl:string;message:string}
const toolkit='xroga-native-github',useCase='Apply one exact owned GitHub publication',denied=()=>new AuthorityError('GITHUB_NATIVE_ADMISSION_DENIED'),hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const unsigned=(plan:BusinessActionPlan|Omit<BusinessActionPlan,'planDigest'>)=>{const{scopeRequirements:_proof,...rest}=plan;const{planDigest:_digest,...value}=rest as BusinessActionPlan;return value;};
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
const identity=(context:TenantContext,nonce:string,value:unknown)=>({tenant:context.tenantId,owner:context.userId,provider:'github-native-plan',account:'github',credentialType:'prepared-publication',recordId:nonce,revision:digest(value),scope:'github-native'});
type TemplateSource={templateId:string;projectName:string;userPrompt?:string;targetDirectory:string;paths:string[]};
type SourceReference={kind:'template';sha256:string;build:TemplateSource}|{kind:'sealed';sha256:string}|{kind:'project_file';sha256:string;projectId:string;fileId:string;fingerprint:string};

async function prepareSource(context:TenantContext,token:string,files:ProjectFile[]|undefined,projectId?:string){
 if(!files)return{reference:null,inline:null};
 const snapshot=inspectNativeArtifactSource(files,[token]),text=JSON.stringify(snapshot),sha256=hash(text);
 if(!projectId){if(Buffer.byteLength(text)>48000)throw new AuthorityError('OWNED_PROJECT_SOURCE_REQUIRED');return{reference:{kind:'sealed',sha256} as SourceReference,inline:snapshot};}
 await requireOwnedProject(context,projectId);const file=await storeProjectFile(context,projectId,'xroga-github-publication-source.json',text,'application/json','code'),row=await ownedFile(context,projectId,file.id);
 return{reference:{kind:'project_file',sha256,projectId,fileId:file.id,fingerprint:fileFingerprint(row)} as SourceReference,inline:null};
}

export async function prepareGitHubAction(input:{context:TenantContext;kind:GitHubNativeKind;parameters:Record<string,unknown>;token:string;files?:ProjectFile[];projectId?:string;rebuildTemplate?:TemplateSource;summary:string;check:()=>Promise<void>}){
 const context=requireTenantContext(input.context);if(input.projectId)await requireOwnedProject(context,input.projectId);await input.check();
 if(typeof input.parameters.repository!=='string'||classifyOutboundData(input.parameters,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
 const source=input.rebuildTemplate?{reference:{kind:'template' as const,sha256:hash(JSON.stringify(inspectNativeArtifactSource(input.files??[],[input.token]))),build:JSON.parse(JSON.stringify(input.rebuildTemplate)) as TemplateSource},inline:null}:await prepareSource(context,input.token,input.files,input.projectId),nonce=randomUUID(),issuedAt=new Date().toISOString();
 const value:Omit<BusinessActionPlan,'planDigest'>={version:'1.0',sessionId:'trs_native_github_'+nonce,useCase,toolkit,toolSlug:'XROGA_GITHUB_'+input.kind,arguments:{...structuredClone(input.parameters),source:source.reference},risk:input.kind==='RESTORE'?'destructive':'write',requiresConfirmation:true,forceConfirmation:true,summary:input.summary,requiredScopes:['xroga:github-native'],authority:{version:'1',userId:context.userId,tenantId:context.tenantId,connectedAccountId:'github:'+input.parameters.repository,actionClass:input.kind==='RESTORE'?'UPDATE':'PUBLISH',projectId:input.projectId??null,runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce,maxSpendMicroUsd:null,currency:null}};
 const nativeGitHubProof=await runtimeCredentialVault().seal(context,identity(context,nonce,unsigned(value)),JSON.stringify({digest:digest(unsigned(value)),files:source.inline}));await input.check();value.scopeRequirements={nativeGitHubProof};
 const confirmation=await createBusinessActionConfirmation(context.userId,{...value,planDigest:actionPlanDigest(value)});
 return{needsConfirmation:true as const,reviewUrl:'/dashboard/actions/confirm/'+confirmation.id,message:'Review the exact GitHub action. No repository mutation has been dispatched.'};
}

/** The existing canonical permit and managed producer proof are the only write
 * admission. Source bytes remain private and immutable across review/restarts. */
export async function readGitHubAction(userId:string,original:BusinessActionPlan,permit?:AuthorityPermit){
 const actor=nativeReleaseActor(userId,undefined,original,permit),{context,plan,scope,binding}=actor;
 if(!plan||!scope||!binding||!['XROGA_GITHUB_PUSH','XROGA_GITHUB_RESTORE','XROGA_GITHUB_TEMPLATE'].includes(plan.toolSlug)||plan.toolkit!==toolkit||plan.useCase!==useCase||!plan.requiresConfirmation||plan.forceConfirmation!==true||!isDeepStrictEqual(plan.requiredScopes,['xroga:github-native'])||scope.connectedAccountId!=='github:'+plan.arguments.repository||scope.actionClass!==(plan.toolSlug==='XROGA_GITHUB_RESTORE'?'UPDATE':'PUBLISH')||plan.risk!==(plan.toolSlug==='XROGA_GITHUB_RESTORE'?'destructive':'write')||scope.runId!==null||scope.maxSpendMicroUsd!==null||scope.currency!==null||plan.sessionId!=='trs_native_github_'+scope.nonce||Date.parse(scope.expiresAt)-Date.parse(scope.issuedAt)>15*60000)throw denied();
 const proof=plan.scopeRequirements as{nativeGitHubProof?:unknown}|undefined;if(!proof||!isDeepStrictEqual(Object.keys(proof),['nativeGitHubProof'])||typeof proof.nativeGitHubProof!=='string')throw denied();
 let sealed:{digest?:unknown;files?:unknown};try{sealed=JSON.parse(await runtimeCredentialVault().open(context,identity(context,scope.nonce,unsigned(plan)),proof.nativeGitHubProof));if(sealed.digest!==digest(unsigned(plan)))throw denied();}catch{throw denied();}
 let consumed=false;
 const checkClaim=async()=>{const{data,error}=await getTenantSupabaseAdmin(context).from('business_action_confirmations').select('id,user_id,status,plan_digest,expires_at,claimed_at,effect_started_at').eq('id',permit!.grantId).eq('user_id',context.userId).maybeSingle();if(error||data?.id!==permit!.grantId||data.user_id!==context.userId||data.status!=='executing'||data.plan_digest!==scope.planDigest||Date.parse(data.expires_at)!==Date.parse(scope.expiresAt)||Date.parse(scope.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(data.claimed_at))||consumed&&!Number.isFinite(Date.parse(data.effect_started_at)))throw denied();};
 await checkClaim();
 const source=plan.arguments.source as SourceReference|null;let files:ProjectFile[]|undefined;
 let checkSource=async()=>{if(scope.projectId)await requireOwnedProject(context,scope.projectId);};
 if(source){
  if(!['template','sealed','project_file'].includes(source.kind)||!/^[a-f0-9]{64}$/.test(source.sha256))throw denied();
  if(source.kind==='template'){
   if(plan.toolSlug!=='XROGA_GITHUB_TEMPLATE'||scope.projectId!==null||sealed.files!==null)throw denied();const{buildTemplateFiles,isSafeRepoPath}=await import('../showcase/templateSources.js'),built=buildTemplateFiles(source.build);if(!built||!Array.isArray(source.build.paths)||new Set(source.build.paths).size!==source.build.paths.length)throw denied();
   const candidates=built.files.map(file=>({path:source.build.targetDirectory?source.build.targetDirectory+'/'+file.path:file.path,content:file.content}));if(candidates.some(file=>!isSafeRepoPath(file.path)))throw denied();files=inspectNativeArtifactSource(candidates.filter(file=>source.build.paths.includes(file.path)));if(files.length!==source.build.paths.length||hash(JSON.stringify(files))!==source.sha256)throw denied();
  }else if(source.kind==='sealed'){if(scope.projectId!==null||!Array.isArray(sealed.files))throw denied();files=inspectNativeArtifactSource(sealed.files);if(hash(JSON.stringify(files))!==source.sha256)throw denied();}
  else{
   if(sealed.files!==null||scope.projectId!==source.projectId)throw denied();await requireOwnedProject(context,source.projectId);
   const file=await downloadPrivateFile(context,source.projectId,source.fileId);
   try{if(file.contentType!=='application/json'||fileFingerprint(file.row)!==source.fingerprint||hash(file.buffer)!==source.sha256)throw denied();files=inspectNativeArtifactSource(JSON.parse(file.buffer.toString('utf8')));}finally{file.buffer.fill(0);}
   checkSource=async()=>{await requireOwnedProject(context,source.projectId);const row=await ownedFile(context,source.projectId,source.fileId);if(fileFingerprint(row)!==source.fingerprint)throw denied();};
  }
 }else if(sealed.files!==null)throw denied();
 const check=async()=>{await checkClaim();await checkSource();};await check();let beginning:Promise<void>|undefined;
 return{context,plan,scope,binding,files,check,assertParameters(parameters:Record<string,unknown>){const{source:_source,...actual}=plan.arguments;if(!isDeepStrictEqual(actual,parameters))throw denied();},install(access:Awaited<ReturnType<typeof createGitHubRequestScope>>,validate:(call:GitHubCall)=>Promise<void>,after?:(call:GitHubCall,status:number,result:unknown)=>Promise<void>){
  if(access.context!==context||access.fingerprint!==plan.arguments.connection)throw denied();
  installGitHubWriteGuard(access.scope,permit,binding,{check,before:async call=>{
   await check();await validate(call);if(!beginning)beginning=(async()=>{await enforceEgress({context,actionClass:scope.actionClass,destination:'https://api.github.com/repos/'+plan.arguments.repository,recipient:String(plan.arguments.repository),purpose:'exact-github-publication',payload:{sessionId:plan.sessionId,useCase:plan.useCase,toolSlug:plan.toolSlug,arguments:plan.arguments},declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:permit},receipt=>persistSecurityDecision(context,receipt));await consumeAuthorityPermit(permit,binding);consumed=true;await check();})();await beginning;await check();
  },after:async(call,status,result)=>{await after?.(call,status,result);await check();}});
 },async completed(){await check();if(!consumed)throw denied();}};
}

export async function executeGitHubNativeAction(userId:string,plan:BusinessActionPlan,authorityPermit?:AuthorityPermit){
 if(plan.toolSlug==='XROGA_GITHUB_PUSH'){const{executeApprovedGitHubPush}=await import('./githubDeploy.js');return executeApprovedGitHubPush(userId,plan,authorityPermit);}
 if(plan.toolSlug==='XROGA_GITHUB_RESTORE'){const{executeApprovedGitHubRestore}=await import('./githubDeploy.js');return executeApprovedGitHubRestore(userId,plan,authorityPermit);}
 if(plan.toolSlug==='XROGA_GITHUB_TEMPLATE'){const{executeApprovedTemplateExport}=await import('../showcase/templateExport.js');return executeApprovedTemplateExport(userId,plan,authorityPermit);}
 throw denied();
}
