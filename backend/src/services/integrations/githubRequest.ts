import {requireTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {AuthorityError,authorityContextForPermit} from '../../security/authority/enforce.js';
import type {AuthorityPermit,AuthorityDispatchBinding} from '../../security/authority/types.js';
import {EgressDenied} from '../../security/egress/egressPolicy.js';
import {containsCredentialSecretText} from '../../security/egress/dataClassification.js';
import {publicHttpsUrl} from '../../security/egress/urlPolicy.js';
import {getGitHubToken} from './githubAuth.js';
import {nativeReleaseConnection} from '../publish/nativeReleaseAdmission.js';

export interface GitHubRequestScope {readonly marker:'github-request-scope'}
export interface GitHubCall {readonly method:string;readonly path:string;readonly body:Record<string,unknown>|undefined}
type Guard={check?:()=>Promise<void>;before:(call:GitHubCall)=>Promise<void>;after?:(call:GitHubCall,status:number,result:unknown)=>Promise<void>};
type State={context:TenantContext;token:string;repository:string|null;fingerprint:string;active:boolean;invalid:boolean;controller:AbortController;signal:AbortSignal;check:()=>Promise<void>;guard?:Guard};
const issued=new WeakMap<object,State>(),denied=()=>new AuthorityError('GITHUB_REQUEST_ADMISSION_DENIED');
export function validGitHubRepository(value:string){return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/.test(value)&&!/^\.+$/.test(value.split('/')[1]!);}
function stateFor(scope:GitHubRequestScope|undefined){const state=scope&&issued.get(scope);if(!state?.active||state.invalid)throw denied();return state;}

/** Read lifetime only. Exact consequential admission is installed separately by
 * the existing canonical native permit. A raw token or owner ID issues neither. */
export async function createGitHubRequestScope(supplied:TenantContext,token:string,repository:string|null,signal?:AbortSignal){
 const context=requireTenantContext(supplied);signal?.throwIfAborted();
 if(repository!==null&&!validGitHubRepository(repository)||!token||token.length>16384||/[\x00-\x20\x7f]/.test(token))throw denied();
 const fingerprint=await nativeReleaseConnection(context),controller=new AbortController(),combined=AbortSignal.any([controller.signal,...(signal?[signal]:[])]),scope:GitHubRequestScope=Object.freeze({marker:'github-request-scope'});
 let state:State;
 const check=async()=>{if(!state.active||state.invalid)throw denied();requireTenantContext(context);combined.throwIfAborted();if(await getGitHubToken(context.userId)!==token||await nativeReleaseConnection(context)!==fingerprint){state.invalid=true;controller.abort();throw denied();}combined.throwIfAborted();if(!state.active||state.invalid)throw denied();};
 state={context,token,repository,fingerprint,active:true,invalid:false,controller,signal:combined,check};issued.set(scope,state);
 try{await check();}catch(error){state.active=false;issued.delete(scope);throw error;}
 return{scope,context,fingerprint,check,close(){state.active=false;controller.abort();issued.delete(scope);}};
}

export function installGitHubWriteGuard(scope:GitHubRequestScope,permit:AuthorityPermit|undefined,binding:AuthorityDispatchBinding,guard:Guard){
 const state=stateFor(scope);
 if(!state.repository||state.guard||binding.provider!=='xroga-native-github'||!['XROGA_GITHUB_PUSH','XROGA_GITHUB_RESTORE','XROGA_GITHUB_TEMPLATE'].includes(binding.operation)||authorityContextForPermit(permit,binding)!==state.context)throw denied();
 state.guard=guard;
}

/** Fixed GitHub REST routing, original actor and current credential are required
 * for every wait. It does not infer authority from branch names or booleans. */
export async function admitGitHubRequest(scope:GitHubRequestScope|undefined,token:string,path:string,init?:RequestInit){
 const state=stateFor(scope),method=(init?.method??'GET').toUpperCase(),body=init?.body===undefined?undefined:String(init.body),signal=AbortSignal.any([state.signal,...(init?.signal?[init.signal]:[])]);
 const fail=(error:unknown):never=>{if(error instanceof AuthorityError||error instanceof EgressDenied){state.invalid=true;state.controller.abort();}throw error;};
 try{
  if(token!==state.token||typeof path!=='string'||path.length>8192||!path.startsWith('/')||path.startsWith('//')||/[\\\x00-\x20\x7f#]/.test(path)||body!==undefined&&(typeof init?.body!=='string'||Buffer.byteLength(body)>48*1024*1024))throw denied();
  const url=publicHttpsUrl('https://api.github.com'+path),decoded=decodeURIComponent(url.pathname),base='/repos/'+state.repository;
  if(url.href!=='https://api.github.com'+path||url.origin!=='https://api.github.com'||decoded.split('/').some(part=>part==='.'||part==='..')||decoded.includes('//')||/[\\\x00-\x20\x7f]/.test(decoded)||!(decoded==='/user'||decoded==='/user/repos'||decoded==='/user/orgs'||state.repository&&decoded==='/orgs/'+state.repository.split('/')[0]+'/repos'||state.repository!==null&&(decoded===base||decoded.startsWith(base+'/'))))throw new EgressDenied('UNSAFE_DESTINATION');
  if(containsCredentialSecretText(path)||containsCredentialSecretText(decoded)||[token,encodeURIComponent(token),Buffer.from(token).toString('base64'),Buffer.from(token).toString('base64url')].some(value=>value.length>=8&&(path.includes(value)||decoded.includes(value))))throw new EgressDenied('SECRET_EGRESS_DENIED');
  const relative=decoded.startsWith(base)?decoded.slice(base.length):decoded;
  const read=method==='GET'&&body===undefined&&(relative==='/user'||relative==='/user/orgs'||relative===''||relative==='/languages'||relative==='/commits'||/^\/(?:git\/ref\/heads|branches)\/[A-Za-z0-9_.\/-]{1,200}$/.test(relative)||/^\/git\/(?:trees|blobs|commits)\/[a-f0-9]{40}$/.test(relative)||/^\/contents\/.{1,1000}$/.test(relative));
  const write=method==='POST'&&state.repository!==null&&decoded==='/orgs/'+state.repository.split('/')[0]+'/repos'||method==='POST'&&['/user/repos','/git/refs','/git/blobs','/git/trees','/git/commits','/pulls'].includes(relative)||method==='PATCH'&&/^\/git\/refs\/heads\/[A-Za-z0-9_.\/-]{1,200}$/.test(relative)||method==='PUT'&&relative==='/contents/.xroga/bootstrap';
  if(!read&&!write||write&&!state.guard)throw denied();
  for(const[key,value]of url.searchParams){if(url.searchParams.getAll(key).length!==1||!(read&&relative.startsWith('/contents/')&&key==='ref'&&/^[A-Za-z0-9_.\/-]{1,200}$/.test(value)||read&&relative.startsWith('/git/trees/')&&key==='recursive'&&value==='1'||read&&relative==='/commits'&&key==='per_page'&&value==='1'||read&&relative==='/user/orgs'&&key==='per_page'&&value==='100'))throw new EgressDenied('UNSAFE_DESTINATION');}
  let parsed:Record<string,unknown>|undefined;
  if(write){try{parsed=JSON.parse(body??'');}catch{throw denied();}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw denied();}
  const call:GitHubCall=Object.freeze({method,path,body:parsed});await state.check();await state.guard?.check?.();signal.throwIfAborted();if(write)await state.guard!.before(call);await state.check();await state.guard?.check?.();signal.throwIfAborted();
  return{method,body,signal,call,async check(){try{await state.check();await state.guard?.check?.();signal.throwIfAborted();}catch(error){return fail(error);}},async after(status:number,result:unknown){try{await state.guard?.after?.(call,status,result);await state.check();await state.guard?.check?.();signal.throwIfAborted();}catch(error){return fail(error);}},fail};
 }catch(error){return fail(error);}
}
