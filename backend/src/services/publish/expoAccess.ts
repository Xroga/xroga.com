import {preparedActionDigest} from '../../security/authority/digest.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import {requireTenantContext,requireResourceOwner,type TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';
import {getUserProviderKey} from '../integrations/userProviderKeys.js';
import {EgressDenied} from '../../security/egress/egressPolicy.js';

type Source='expo'|'expo_project_id'|'google_play'|'apple_asc_api';
const sources=new Set<Source>(['expo','expo_project_id','google_play','apple_asc_api']);
const denied=()=>new AuthorityError('EXPO_ACCOUNT_ADMISSION_DENIED');
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
export const validExpoId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const validName=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value);
interface PinnedSource {fingerprint:string|null;value:string|null}
interface AccessState {context:TenantContext;token:string;signal?:AbortSignal;check:()=>Promise<void>}
const issued=new WeakMap<object,AccessState>();
export interface ExpoAccess {
 readonly context:TenantContext;readonly token:string;
 check:()=>Promise<void>;
 pin:(provider:Source)=>Promise<string|null>;
 bindings:()=>Record<string,string|null>;
 close:()=>void;
}
async function rowFingerprint(context:TenantContext,provider:Source):Promise<string|null>{
 const actor=requireTenantContext(context);
 if(!sources.has(provider))throw denied();
 const{data,error}=await getTenantSupabaseAdmin(actor).from('user_integrations').select('user_id,provider,access_token,credential_revision,metadata').eq('user_id',actor.userId).eq('provider','apikey_'+provider).maybeSingle();
 if(error)throw denied();if(!data)return null;
 if(data.user_id!==actor.userId||data.provider!=='apikey_'+provider||typeof data.access_token!=='string'&&data.access_token!==null)throw denied();
 return digest([data.user_id,data.provider,data.access_token,data.credential_revision,data.metadata??{}]);
}
/** One original actor and credential epoch for the whole operation or poll.
 * Reconnecting after revocation requires a new request, not a hidden retry. */
export async function captureExpoAccess(userId:string,tenantContext?:TenantContext,signal?:AbortSignal):Promise<ExpoAccess>{
 const context=requireTenantContext(tenantContext);requireResourceOwner(context,userId);signal?.throwIfAborted();
 const pinned=new Map<Source,PinnedSource>();let closed=false;
 const check=async()=>{
  if(closed)throw denied();requireResourceOwner(context,userId);signal?.throwIfAborted();
  for(const[provider,selected]of pinned)if(await rowFingerprint(context,provider)!==selected.fingerprint)throw denied();
  signal?.throwIfAborted();if(closed)throw denied();
 };
 const pin=async(provider:Source)=>{
  if(!sources.has(provider))throw denied();await check();
  if(pinned.has(provider))return pinned.get(provider)!.value;
  const fingerprint=await rowFingerprint(context,provider),value=await getUserProviderKey(context.userId,provider);
  if(await rowFingerprint(context,provider)!==fingerprint||value!==null&&(typeof value!=='string'||!value||value.length>48000)||value&&fingerprint===null)throw denied();
  pinned.set(provider,{fingerprint,value});await check();return value;
 };
 const token=await pin('expo');if(!token||/[\x00-\x20\x7f]/.test(token))throw denied();
 const record={context,token,check,pin,bindings:()=>Object.fromEntries([...pinned].map(([name,source])=>[name,source.fingerprint])),close:()=>{closed=true;pinned.clear();issued.delete(access);}};
 Object.defineProperty(record,'token',{enumerable:false});const access:ExpoAccess=Object.freeze(record);
 issued.set(access,{context,token,signal,check});return access;
}
export async function beforeExpoRequest(access:ExpoAccess|undefined,token:string,path:string,init:RequestInit={}){
 const state=access&&issued.get(access);if(!state||token!==state.token)throw denied();
 await state.check();
 const method=init.method??'GET';
 if(path==='/graphql'&&method==='POST'){
  if(typeof init.body!=='string'||Buffer.byteLength(init.body)>512*1024)throw new EgressDenied('INVALID_EGRESS_INPUT');
  let body:{query?:unknown;variables?:unknown};try{body=JSON.parse(init.body);}catch{throw new EgressDenied('INVALID_EGRESS_INPUT');}
  if(!body||typeof body.query!=='string'||!/^\s*(?:query|mutation)\b/.test(body.query)||Object.keys(body).some(key=>!['query','variables'].includes(key)))throw new EgressDenied('INVALID_EGRESS_INPUT');
  if(/^\s*mutation\b/.test(body.query))throw denied();
 }else if(!(method==='GET'&&/^\/v2\/projects\/[A-Za-z0-9_-]{1,128}\/builds\?limit=(?:[1-9]|[1-9][0-9]|100)&offset=0$/.test(path)))throw new EgressDenied('UNSAFE_DESTINATION');
 await state.check();init.signal?.throwIfAborted();
 return AbortSignal.any([AbortSignal.timeout(30000),...(state.signal?[state.signal]:[]),...(init.signal?[init.signal]:[])]);
}
export async function readExpoResponse(access:ExpoAccess,response:Response):Promise<{ok:boolean;status:number;json:unknown;text:string}>{
 const state=issued.get(access);if(!state)throw denied();
 if(response.redirected||response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw new EgressDenied('UNSAFE_DESTINATION');}
 if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);throw new AuthorityError('EXPO_PROVIDER_AUTHORIZATION_DENIED');}
 if(!response.ok){await response.body?.cancel().catch(()=>undefined);await state.check();return{ok:false,status:response.status,json:{message:'Expo request unavailable.'},text:'Expo request unavailable.'};}
 const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
 try{if(reader)for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>2*1024*1024)throw new EgressDenied('INVALID_EGRESS_INPUT');chunks.push(item.value);}}
 finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
 await state.check();let json:unknown;try{json=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new EgressDenied('INVALID_EGRESS_INPUT');}
 const errors=(json as{errors?:unknown}|null)?.errors;
 if(Array.isArray(errors)&&errors.length)throw new AuthorityError('EXPO_GRAPHQL_NOT_ADMITTED');
 return{ok:true,status:response.status,json,text:''};
}
export interface ExpoOwnedProject {id:string;accountId:string;accountName:string;slug:string;repository:string|null}
export function requireExpoAccess(access:ExpoAccess,context:TenantContext){if(issued.get(access)?.context!==requireTenantContext(context))throw denied();return access;}
export type ExpoQuery=<T>(query:string,variables?:Record<string,unknown>)=>Promise<T>;
export async function verifyExpoProject(access:ExpoAccess,query:ExpoQuery,projectId:string,supplied?:{id?:unknown;name?:unknown;slug?:unknown;ownerAccount?:{id?:unknown;name?:unknown};githubRepository?:{metadata?:{githubRepoOwnerName?:unknown;githubRepoName?:unknown}}}):Promise<ExpoOwnedProject>{
 if(!issued.has(access)||!validExpoId(projectId))throw denied();await access.check();
 const accounts=await query<{me?:{accounts?:Array<{id:unknown;name:unknown}>}}>('query XrogaExpoAccountsAdmission { me { accounts { id name } } }');
 const list=accounts.me?.accounts;
 if(!Array.isArray(list)||!list.length||list.length>100||list.some(row=>!row||!validExpoId(row.id)||!validName(row.name))||new Set(list.map(row=>row.id)).size!==list.length)throw denied();
 const app=supplied??(await query<{app?:{byId?:typeof supplied}}>('query XrogaExpoProjectAdmission($appId: String!) { app { byId(appId: $appId) { id name slug ownerAccount { id name } githubRepository { metadata { githubRepoOwnerName githubRepoName } } } } }',{appId:projectId})).app?.byId;
 const account=list.find(row=>row.id===app?.ownerAccount?.id);
 if(!app||app.id!==projectId||!account||app.ownerAccount?.name!==account.name||!validName(app.slug))throw denied();
 const repo=app.githubRepository?.metadata;let repository:string|null=null;
 if(repo){if(typeof repo.githubRepoOwnerName!=='string'||typeof repo.githubRepoName!=='string'||!/^[A-Za-z0-9-]{1,39}$/.test(repo.githubRepoOwnerName)||!/^[A-Za-z0-9_.-]{1,100}$/.test(repo.githubRepoName)||/^\.+$/.test(repo.githubRepoName))throw denied();repository=repo.githubRepoOwnerName+'/'+repo.githubRepoName;}
 await access.check();return{id:projectId,accountId:String(account.id),accountName:String(account.name),slug:app.slug,repository};
}
