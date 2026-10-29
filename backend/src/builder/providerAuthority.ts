import {AsyncLocalStorage} from 'node:async_hooks';
import {isDeepStrictEqual} from 'node:util';
import {requireTenantContext,type TenantContext} from '../security/tenantContext.js';
import {AuthorityError,executeAuthorizedAction,consumeAuthorityPermit} from '../security/authority/enforce.js';
import {preparedActionDigest} from '../security/authority/digest.js';
import type {AuthorityPermit,PreparedAuthorityScope,AuthorityDispatchBinding} from '../security/authority/types.js';
import {EgressDenied,enforceEgress} from '../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../security/egress/securityDecision.js';
import type {Phase2Store} from './phase2Store.js';
import type {BuilderService} from './service.js';
import type {ExternalOperation} from './types.js';
import {digestOf} from './operations.js';
import {hashSnapshot} from './snapshot.js';

export const builderAdmissionDenied=()=>new AuthorityError('BUILDER_PROVIDER_ADMISSION_DENIED');
export function isBuilderSecurityDenial(error:unknown):boolean{return error instanceof AuthorityError||error instanceof EgressDenied||error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)||!!error&&typeof error==='object'&&'code' in error&&['SUPABASE_MANAGEMENT_DENIED','SUPABASE_TRANSPORT_DENIED','VERCEL_AUTH_TRANSPORT_DENIED','TENANT_AUTH_REQUIRED'].includes(String(error.code));}
export interface BuilderProviderAdmission {
 connectionFingerprint:()=>Promise<string>;
 withAuthority:<T>(operation:ExternalOperation,effect:()=>Promise<T>)=>Promise<T>;
}
export interface BuilderEffect {
 readonly operation:ExternalOperation;
 readonly context:TenantContext;
 readonly binding:AuthorityDispatchBinding;
 readonly permit:AuthorityPermit;
 check:()=>Promise<void>;
 begin:()=>Promise<void>;
 onClose:(cleanup:()=>void)=>void;
}
const active=new AsyncLocalStorage<BuilderEffect>();
export function currentBuilderEffect(){return active.getStore();}

/** Adapt the existing Builder exact-plan approval and database CAS to the
 * canonical authority executor. No request boolean or second approval UI. */
export function builderProviderAdmission(input:{context:TenantContext;provider:'github'|'supabase'|'vercel';phase2:Phase2Store;builder:BuilderService;fingerprint:()=>Promise<string>;checkConnection:()=>Promise<void>;sourcePayload?:(operation:ExternalOperation)=>Promise<unknown>;persist?:typeof persistSecurityDecision}):BuilderProviderAdmission {
 const context=requireTenantContext(input.context);
 return {connectionFingerprint:input.fingerprint,async withAuthority<T>(claimed:ExternalOperation,effect:()=>Promise<T>):Promise<T>{
  const op=structuredClone(claimed);
  if(op.userId!==context.userId||op.provider!==input.provider||op.status!=='executing'||!op.approvedAt||!op.approvalExpiresAt||!Number.isFinite(Date.parse(op.updatedAt))||!Number.isFinite(Date.parse(op.approvedAt))||Date.parse(op.approvalExpiresAt)-Date.parse(op.approvedAt)>15*60_000||digestOf(op.plan)!==op.planDigest)throw builderAdmissionDenied();
  const project=await input.builder.requireProject(context.userId,op.projectId),specDigest=digestOf({spec:project.spec,starter:project.starter});
  const revision=await input.builder.revisionFiles(context.userId,op.projectId,op.revisionId);
  if(!revision||revision.id!==op.revisionId||hashSnapshot(revision.files)!==revision.contentSha256||op.plan.connection!==await input.fingerprint())throw builderAdmissionDenied();
  const expectedRevision=revision.contentSha256;
  const payload={provider:op.provider,action:op.action,projectId:op.projectId,revisionId:op.revisionId,plan:op.plan,...(input.sourcePayload?{source:await input.sourcePayload(op)}:{})};
  const repository=op.plan.repository as {name?:unknown}|undefined,owner=op.plan.owner as {login?:unknown}|undefined;
  const recipient=input.provider==='github'?String(owner?.login)+'/'+String(repository?.name):input.provider==='vercel'?String((op.plan.scope as {id:string|null})?.id??(op.plan.viewer as {id:string})?.id)+'/'+String(op.plan.projectName??(op.plan.project as {name:string})?.name):String(op.plan.projectRef??(op.plan.project as {ref?:unknown}|undefined)?.ref);
  const actionClass=input.provider==='github'||input.provider==='vercel'?'PUBLISH':op.action==='apply_migration'?'UPDATE':'READ';
  const scope:PreparedAuthorityScope={version:'1',userId:context.userId,tenantId:context.tenantId,provider:input.provider==='github'?'xroga-native-github':input.provider==='vercel'?'xroga-native-vercel':'xroga-native-supabase',connectedAccountId:input.provider+':'+recipient,operation:input.provider==='github'?'XROGA_GITHUB_PUSH':input.provider==='vercel'?'XROGA_BUILDER_'+op.action.toUpperCase():'XROGA_SUPABASE_PROVISION',targetDigest:preparedActionDigest(payload),planDigest:op.planDigest,actionClass,risk:'write',projectId:op.projectId,runId:null,issuedAt:op.approvedAt,expiresAt:op.approvalExpiresAt,nonce:op.id,maxSpendMicroUsd:null,currency:null};
  const binding:AuthorityDispatchBinding={userId:context.userId,provider:scope.provider,connectedAccountId:scope.connectedAccountId,operation:scope.operation,targetDigest:scope.targetDigest,planDigest:scope.planDigest};
  const claim={id:op.id,userId:context.userId,scopeDigest:preparedActionDigest(scope),expiresAt:scope.expiresAt,claimedAt:op.updatedAt};
  const check=async()=>{
   requireTenantContext(context);await input.checkConnection();
   const current=await input.phase2.getOperation(context.userId,op.projectId,op.id);
   const owned=await input.builder.requireProject(context.userId,op.projectId),saved=await input.builder.revisionFiles(context.userId,op.projectId,op.revisionId);
   if(!current||current.status!=='executing'||current.userId!==context.userId||current.projectId!==op.projectId||current.provider!==op.provider||current.action!==op.action||current.updatedAt!==op.updatedAt||current.approvedAt!==op.approvedAt||current.approvalExpiresAt!==op.approvalExpiresAt||Date.parse(scope.expiresAt)<=Date.now()||current.planDigest!==op.planDigest||digestOf(current.plan)!==op.planDigest||!isDeepStrictEqual(current.plan,op.plan)||digestOf({spec:owned.spec,starter:owned.starter})!==specDigest||!saved||saved.contentSha256!==expectedRevision||hashSnapshot(saved.files)!==expectedRevision)throw builderAdmissionDenied();
   if(input.sourcePayload&&!isDeepStrictEqual(await input.sourcePayload(op),payload.source))throw builderAdmissionDenied();
   await input.checkConnection();
  };
  await check();
  return executeAuthorizedAction({context,scope,claim,revalidateBeforeEffect:async()=>{await check();return claim;}},async permit=>{
   let beginning:Promise<void>|undefined;
   const begin=async()=>{if(!beginning)beginning=(async()=>{
    await check();await enforceEgress({context,actionClass,destination:input.provider==='github'?'https://api.github.com/repos/'+recipient:input.provider==='vercel'?'https://api.vercel.com':'https://api.supabase.com/v1/projects/'+recipient,recipient,purpose:'approved-builder-'+op.action,payload,declaredClass:'USER_PRIVATE',toolTrust:'SERVER_REGISTERED',binding,authorityPermit:permit},receipt=>(input.persist??persistSecurityDecision)(context,receipt));
    await consumeAuthorityPermit(permit,binding);await check();
   })();await beginning;await check();};
   const cleanup:Array<()=>void>=[];
   try{return await active.run({operation:op,context,binding,permit,check,begin,onClose:fn=>cleanup.push(fn)},effect);}
   finally{for(const close of cleanup)close();}
  });
 }};
}
