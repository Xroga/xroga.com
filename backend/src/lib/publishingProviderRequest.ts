import {publicHttpsUrl} from '../security/egress/urlPolicy.js';
import {EgressDenied} from '../security/egress/egressPolicy.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';

const MAX_BODY=32*1024*1024,MAX_RESPONSE=16*1024*1024;
export function snapshotPublishingSource(files:Array<{path:string;content:string}>):Array<{path:string;content:string}>{
  if(!Array.isArray(files)||files.length>1000)throw new EgressDenied('INVALID_EGRESS_INPUT');
  const snapshot=files.map(file=>{
    if(!file||typeof file.path!=='string'||!file.path||file.path.length>500||/[\\\x00-\x1f]/.test(file.path)
      ||file.path.split('/').some(part=>part==='.'||part==='..')||typeof file.content!=='string')throw new EgressDenied('INVALID_EGRESS_INPUT');
    return{path:file.path,content:file.content};
  });
  const serialized=JSON.stringify(snapshot);
  if(Buffer.byteLength(serialized)>MAX_BODY)throw new EgressDenied('INVALID_EGRESS_INPUT');
  if(containsCredentialSecretText(serialized))throw new EgressDenied('SECRET_EGRESS_DENIED');
  return snapshot;
}
const segment='[A-Za-z0-9_.-]{1,100}',domain='[A-Za-z0-9.-]{1,253}';
const policies:Array<[string,string,RegExp]>=[
  ['api.vercel.com','GET',/^\/v2\/user$/],
  ['api.vercel.com','POST',/^\/v13\/deployments$/],
  ['api.vercel.com','GET',new RegExp(`^/v13/deployments/${segment}$`)],
  ['api.vercel.com','POST',/^\/v10\/projects$/],
  ['api.vercel.com','POST',/^\/v11\/projects$/],
  ['api.vercel.com','GET',new RegExp(`^/v9/projects/${segment}(?:/env|/domains(?:/${domain})?)?$`)],
  ['api.vercel.com','PATCH',new RegExp(`^/v9/projects/${segment}(?:/env/${segment})?$`)],
  ['api.vercel.com','POST',new RegExp(`^/v10/projects/${segment}/(?:env|domains)$`)],
  ['api.vercel.com','POST',new RegExp(`^/v9/projects/${segment}/domains/${domain}/verify$`)],
  ['api.vercel.com','DELETE',new RegExp(`^/v9/projects/${segment}/domains/${domain}$`)],
  ['api.netlify.com','POST',/^\/api\/v1\/sites$/],
  ['api.netlify.com','GET',/^\/api\/v1\/sites$/],
  ['api.netlify.com','POST',new RegExp(`^/api/v1/sites/${segment}/deploys$`)],
  ['api.netlify.com','PUT',new RegExp(`^/api/v1/deploys/${segment}/files/[a-f0-9]{40}$`)],
  ['api.netlify.com','GET',new RegExp(`^/api/v1/deploys/${segment}$`)],
];
/** Fixed provider transport only, never an authority or data-export grant.
 * Actual callers must retain their own tenant, target, credential revision,
 * approval and provenance checks. These endpoints cannot select an arbitrary
 * origin or follow a redirect carrying source files or credentials elsewhere.
 */
export async function publishingProviderRequest(destination:string,init:RequestInit={}):Promise<Response>{
  const assertActive=()=>{if(init.signal?.aborted)throw new DOMException('Publishing request cancelled.','AbortError');};
  assertActive();
  let url:URL;
  try{if(new URL(destination).hash)throw new Error();url=publicHttpsUrl(destination);}catch{throw new EgressDenied('UNSAFE_DESTINATION');}
  const method=(init.method??'GET').toUpperCase();
  if(!policies.some(([host,verb,path])=>host===url.hostname&&verb===method&&path.test(url.pathname))
    ||url.hash||/%|\\/.test(url.pathname)||url.pathname.split('/').some(p=>p==='.'||p==='..'))throw new EgressDenied('UNSAFE_DESTINATION');
  for(const[key,value]of url.searchParams){
    const allowed=url.hostname==='api.vercel.com'?key==='teamId'&&/^team_[A-Za-z0-9]+$/.test(value):
      url.pathname==='/api/v1/sites'&&method==='GET'&&(key==='filter'&&value==='all'||key==='name'&&/^[a-z0-9-]{1,60}$/.test(value));
    if(!allowed||url.searchParams.getAll(key).length!==1)throw new EgressDenied('UNSAFE_DESTINATION');
  }
  if(init.body&&(typeof init.body!=='string'||Buffer.byteLength(init.body)>MAX_BODY))throw new EgressDenied('INVALID_EGRESS_INPUT');
  let response:Response;
  try{response=await fetch(destination,{...init,redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(30000),...(init.signal?[init.signal]:[])])});}
  catch{assertActive();throw new Error('Publishing provider request is unavailable.');}
  if(init.signal?.aborted){await response.body?.cancel().catch(()=>undefined);assertActive();}
  if(response.redirected||response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw new EgressDenied('UNSAFE_DESTINATION');}
  if(!response.ok){await response.body?.cancel().catch(()=>undefined);return new Response([204,205,304].includes(response.status)?null:JSON.stringify({error:{message:'Publishing provider request failed.'}}),{status:response.status,headers:{'content-type':'application/json'}});}
  const chunks:Uint8Array[]=[];let bytes=0;const reader=response.body?.getReader();
  try{if(reader)for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>MAX_RESPONSE)throw new EgressDenied('INVALID_EGRESS_INPUT');chunks.push(next.value);}}
  catch(error){assertActive();if(error instanceof EgressDenied)throw error;throw new Error('Publishing provider response is unavailable.');}
  finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
  assertActive();
  return new Response(bytes?Buffer.concat(chunks):null,{status:response.status,headers:{'content-type':response.headers.get('content-type')??'application/json'}});
}
