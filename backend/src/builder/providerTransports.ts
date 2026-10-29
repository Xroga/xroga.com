import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {requireTenantContext,type TenantContext} from '../security/tenantContext.js';
import {AuthorityError} from '../security/authority/enforce.js';
import {EgressDenied} from '../security/egress/egressPolicy.js';
import {getGitHubToken} from '../services/integrations/githubAuth.js';
import {getSupabaseOAuthAccessToken} from '../services/integrations/supabaseAuth.js';
import {nativeReleaseConnection} from '../services/publish/nativeReleaseAdmission.js';
import {captureSupabaseAccess,type SupabaseAccess} from '../services/integrations/supabaseAccess.js';
import {listSupabaseProjects} from '../services/integrations/supabaseProvision.js';
import {ghFetch} from '../services/integrations/githubDeploy.js';
import {createGitHubRequestScope,installGitHubWriteGuard,type GitHubCall} from '../services/integrations/githubRequest.js';
import {inspectNativeArtifactSource} from '../services/publish/nativeArtifact.js';
import {classifyOutboundData} from '../security/egress/dataClassification.js';
import {builderAdmissionDenied,builderProviderAdmission,currentBuilderEffect,type BuilderEffect} from './providerAuthority.js';
import type {Phase2Store} from './phase2Store.js';
import type {BuilderService} from './service.js';
import type {ExternalOperation} from './types.js';
import type {ProjectFile} from '../ai/patches.js';
import type {GitHubTransport} from './github/restPort.js';
import {CATALOG_TABLES_SQL,CATALOG_GRANTS_SQL,type SupabaseTransport} from './data/restPort.js';
import type {GitHubPlan} from './github/service.js';

const blobSha=(content:string)=>createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
const fullSha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
type Pin={token:string;fingerprint:string;check:()=>Promise<void>;access?:SupabaseAccess};

/** One route/service instance carries the original actor and credential epoch.
 * The transport is not exported as a raw-token authorization alternative. */
export function createBuilderProviderBoundary(context:TenantContext,deps:{phase2:Phase2Store;builder:BuilderService;githubFiles:(operation:ExternalOperation)=>Promise<ProjectFile[]>}){
 context=requireTenantContext(context);
 const pins=new Map<string,Pin>();let invalid=false;
 const pin=async(provider:'github'|'supabase'):Promise<Pin|null>=>{
  requireTenantContext(context);if(invalid)throw builderAdmissionDenied();const previous=pins.get(provider);if(previous){await previous.check();return previous;}
  const token=await (provider==='github'?getGitHubToken(context.userId):getSupabaseOAuthAccessToken(context.userId));if(!token)return null;
  const access=provider==='supabase'?await captureSupabaseAccess(context):undefined;
  const fingerprint=access?.fingerprint??await nativeReleaseConnection(context);
  const check=async()=>{try{if(invalid)throw builderAdmissionDenied();requireTenantContext(context);await access?.check();if((provider==='github'?await nativeReleaseConnection(context):access!.fingerprint)!==fingerprint||(provider==='github'?await getGitHubToken(context.userId):await getSupabaseOAuthAccessToken(context.userId))!==token)throw builderAdmissionDenied();if(invalid)throw builderAdmissionDenied();}catch(error){invalid=true;access?.close();throw error;}};
  const value={token,fingerprint,check,access};pins.set(provider,value);await check();return value;
 };
 const tokenFor=(provider:'github'|'supabase')=>async(userId:string)=>{if(userId!==context.userId)throw builderAdmissionDenied();return(await pin(provider))?.token??null;};
 const requirePin=async(provider:'github'|'supabase',token?:string)=>{const value=await pin(provider);if(!value||token!==undefined&&value.token!==token)throw builderAdmissionDenied();return value;};
 const admission=(provider:'github'|'supabase')=>builderProviderAdmission({context,provider,phase2:deps.phase2,builder:deps.builder,fingerprint:async()=> (await requirePin(provider)).fingerprint,checkConnection:async()=>{await(await requirePin(provider)).check();},...(provider==='github'?{sourcePayload:async(op:ExternalOperation)=>{const files=inspectNativeArtifactSource(await deps.githubFiles(op),[(await requirePin(provider)).token]),sha256=createHash('sha256').update(JSON.stringify(files)).digest('hex');if(op.plan.sourceDigest!==sha256)throw builderAdmissionDenied();return{fileCount:files.length,sha256};}}:{})});
 const githubAdmission=admission('github'),supabaseAdmission=admission('supabase');
 const scopes=new WeakMap<BuilderEffect,Awaited<ReturnType<typeof createGitHubRequestScope>>>();
 const github:GitHubTransport=async(token,path,init)=>{
  const connection=await requirePin('github',token),effect=currentBuilderEffect();
  if(effect&&(effect.context!==context||effect.operation.provider!=='github'))throw builderAdmissionDenied();
  const match=/^\/repos\/([^/?]+\/[^/?]+)/.exec(path),repository=effect?String((effect.operation.plan.owner as {login:string}).login)+'/'+String((effect.operation.plan.repository as {name:string}).name):match?decodeURIComponent(match[1]!):null;
  let access=effect?scopes.get(effect):undefined;
  if(!access){
   access=await createGitHubRequestScope(context,token,repository);
   if(effect){const guard=await githubGuard(effect,deps.githubFiles);installGitHubWriteGuard(access.scope,effect.permit,effect.binding,{check:async()=>{await connection.check();await effect.check();},before:async call=>{await guard.before(call);await effect.begin();},after:guard.after});scopes.set(effect,access);effect.onClose(()=>access!.close());}
  }
  try{await connection.check();return await ghFetch(token,path,init,access.scope);}
  catch(error){if(error instanceof AuthorityError||error instanceof EgressDenied)invalid=true;throw error;}
  finally{if(!effect)access.close();}
 };
 const supabase:SupabaseTransport=async(token,path,init)=>{
  const connection=await requirePin('supabase',token),method=init?.method??'GET',effect=currentBuilderEffect();let payload:unknown;
  const read=method==='GET'&&init?.body===undefined&&(path==='/projects'||/^\/projects\/[a-z0-9]{20}\/api-keys\?reveal=false$/.test(path));
  const project=/^\/projects\/([a-z0-9]{20})\/(?:api-keys\?reveal=false|database\/query)$/.exec(path)?.[1];
  if(method==='POST'&&project&&path.endsWith('/database/query')&&typeof init?.body==='string'&&Buffer.byteLength(init.body)<=512*1024){try{payload=JSON.parse(init.body);}catch{throw builderAdmissionDenied();}}
  const query=payload as {query?:unknown}|undefined,catalog=!!query&&Object.keys(query).join()==='query'&&[CATALOG_TABLES_SQL,CATALOG_GRANTS_SQL].includes(String(query.query));
  if(!read&&!catalog){
   if(!effect||effect.context!==context||effect.operation.provider!=='supabase'||effect.operation.action!=='apply_migration'||effect.operation.plan.projectRef!==project||!query||Object.keys(query).join()!=='query'||query.query!==`begin;\n${effect.operation.plan.sql}\ncommit;`)throw builderAdmissionDenied();
  }
  if(classifyOutboundData({path,payload:payload??null},'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  if(project){const projects=await listSupabaseProjects(token,context,connection.access);if(!projects.some(p=>p.ref===project))throw builderAdmissionDenied();}
  await connection.check();await effect?.check();if(!read&&!catalog)await effect!.begin();await connection.check();await effect?.check();
  const signal=AbortSignal.any([AbortSignal.timeout(20_000),...(init?.signal?[init.signal]:[])]);
  const response=await fetch('https://api.supabase.com/v1'+path,{method,body:init?.body,redirect:'manual',signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'}});
  if(response.redirected||response.status>=300&&response.status<400||response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);invalid=true;throw builderAdmissionDenied();}
  const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try{if(reader)for(;;){const next=await reader.read();if(next.done)break;signal.throwIfAborted();bytes+=next.value.length;if(bytes>2*1024*1024)throw builderAdmissionDenied();chunks.push(next.value);}}finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
  await connection.check();await effect?.check();signal.throwIfAborted();
  if(!response.ok)return new Response(null,{status:response.status});
  let result:unknown;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw builderAdmissionDenied();}if(!Array.isArray(result))throw builderAdmissionDenied();
  return Response.json(result,{status:response.status});
 };
 return{github,supabase,githubTokenFor:tokenFor('github'),supabaseTokenFor:tokenFor('supabase'),githubAdmission,supabaseAdmission};
}

async function githubGuard(effect:BuilderEffect,filesFor:(op:ExternalOperation)=>Promise<ProjectFile[]>){
 const p=effect.operation.plan as GitHubPlan,repository=p.owner.login+'/'+p.repository.name,base='/repos/'+repository;
 const files=inspectNativeArtifactSource(await filesFor(effect.operation));
 const blobs=new Map(files.map(file=>[Buffer.from(file.content).toString('base64'),blobSha(file.content)]));
 const expectedTree=files.map(file=>({path:file.path,mode:'100644',type:'blob',sha:blobSha(file.content)}));
 let head:string|null|undefined,tree:string|undefined,commit:string|undefined,created=false,refStarted=false;
 if(!['create_repository','push_revision'].includes(effect.operation.action)||p.action!==effect.operation.action||p.revision.id!==effect.operation.revisionId||p.revision.fileCount!==files.length)throw builderAdmissionDenied();
 return {async before(call:GitHubCall){
  await effect.check();const b=call.body;
  if(call.method==='GET')return;
  if(call.path==='/user/repos'||call.path===`/orgs/${p.owner.login}/repos`){if(p.action!=='create_repository'||created||!isDeepStrictEqual(b,{name:p.repository.name,description:`Generated with Xroga. ${p.marker}`.slice(0,200),private:p.repository.visibility==='private',auto_init:true,has_issues:true})||call.path!==(p.owner.type==='User'?'/user/repos':`/orgs/${p.owner.login}/repos`))throw builderAdmissionDenied();created=true;}
  else if(call.path===base+'/git/blobs'){if(tree||!b||Object.keys(b).sort().join()!=='content,encoding'||b.encoding!=='base64'||!blobs.has(String(b.content)))throw builderAdmissionDenied();}
  else if(call.path===base+'/git/trees'){if(tree||!isDeepStrictEqual(b,{tree:expectedTree}))throw builderAdmissionDenied();}
  else if(call.path===base+'/git/commits'){if(commit||head===undefined||!tree||!isDeepStrictEqual(b,{message:`Xroga: revision ${p.revision.number}`,tree,parents:head?[head]:[]}))throw builderAdmissionDenied();}
  else if(call.path===base+'/git/refs'||call.path===base+'/git/refs/heads/'+p.repository.branch){if(refStarted||!commit||!isDeepStrictEqual(b,call.method==='PATCH'?{sha:commit,force:false}:{ref:'refs/heads/'+p.repository.branch,sha:commit}))throw builderAdmissionDenied();refStarted=true;}
  else throw builderAdmissionDenied();
 },async after(call:GitHubCall,status:number,result:unknown){
  await effect.check();const d=result as {sha?:unknown;ref?:unknown;id?:unknown;private?:unknown;name?:unknown;login?:unknown;owner?:{id?:unknown;login?:unknown};tree?:{sha?:unknown};object?:{sha?:unknown;type?:unknown};parents?:{sha?:unknown}[]};
  if(call.method==='GET'){
   if(call.path==='/user'&&(d.id!==p.viewer.id||d.login!==p.viewer.login))throw builderAdmissionDenied();
   if(call.path===base&&status===200&&(d.owner?.id!==p.owner.id||d.private!==(p.repository.visibility==='private')||p.repository.id!==undefined&&d.id!==p.repository.id))throw builderAdmissionDenied();
   if(call.path===base+'/git/ref/heads/'+p.repository.branch){head=status===404||status===409?null:fullSha(d.object?.sha)?d.object.sha:undefined;if(head===undefined||p.action==='push_revision'&&head!==(p.expectedRemoteHead??null))throw builderAdmissionDenied();}
   return;
  }
  if(status<200||status>=300)return;
  if(call.path.endsWith('/repos')){if(status!==201||d.owner?.id!==p.owner.id||d.owner?.login!==p.owner.login||d.name!==p.repository.name||d.private!==(p.repository.visibility==='private'))throw builderAdmissionDenied();}
  else if(call.path.endsWith('/git/blobs')){if(d.sha!==blobs.get(String(call.body!.content)))throw builderAdmissionDenied();}
  else if(call.path.endsWith('/git/trees')){if(!fullSha(d.sha))throw builderAdmissionDenied();tree=d.sha;}
  else if(call.path.endsWith('/git/commits')){if(!fullSha(d.sha)||d.tree?.sha!==tree||!isDeepStrictEqual(d.parents?.map(p=>p.sha),head?[head]:[]))throw builderAdmissionDenied();commit=d.sha;}
  else if(d.ref!=='refs/heads/'+p.repository.branch||d.object?.sha!==commit||d.object?.type!=='commit')throw builderAdmissionDenied();
 }};
}
