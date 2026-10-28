import {setTimeout as wait} from 'node:timers/promises';
import {requestDesktopWorkflow,type DesktopWorkflowInput} from './desktopWorkflow.js';
import {requireNativeArtifactProject} from './nativeArtifact.js';
import {publicHttpsUrl} from '../../security/egress/urlPolicy.js';
import {containsCredentialSecretText} from '../../security/egress/dataClassification.js';
/**
 * Free-path ship helpers for Chrome / Electron (not store automation).
 * Uses the user's GitHub token after sticky push.
 *
 * Chrome: extension.zip on Releases (sideload / manual CWS).
 * Electron: portable desktop.zip immediately + optional Actions binary zip.
 */

import type {BusinessActionPlan} from '../integrations/businessAction.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import type {SafeBusinessActionConfirmation} from '../integrations/businessActionConfirmations.js';
import type {NativeArtifactReference} from './nativeArtifact.js';
import {nativeReleaseActor, nativeReleaseConnection, prepareNativeRelease, admitNativeRelease} from './nativeReleaseAdmission.js';
import { getGitHubToken } from '../integrations/githubAuth.js';
import type { ProjectFile } from '../integrations/githubDeploy.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import {EgressDenied} from '../../security/egress/egressPolicy.js';
import {snapshotPublishingSource} from '../../lib/publishingProviderRequest.js';
import {requireTenantContext,requireResourceOwner,type TenantContext} from '../../security/tenantContext.js';
import {createGitHubSourceReader} from '../integrations/githubSourceRead.js';

async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const method=(init?.method??'GET').toUpperCase();
  const prefix='^/repos/[A-Za-z0-9-]{1,39}/[A-Za-z0-9_.-]{1,100}/';
  const routes:Record<string,RegExp>={
    GET:new RegExp(prefix+'(?:releases/(?:tags/[A-Za-z0-9_.-]{1,100}|[1-9][0-9]*/assets)|git/ref/tags/[A-Za-z0-9_.-]{1,100})$'),
    POST:new RegExp(prefix+'(?:releases|git/refs)$'),
    DELETE:new RegExp(prefix+'releases/assets/[1-9][0-9]*$'),
  };
  if(!routes[method]?.test(path)||path.includes('..'))throw new EgressDenied('UNSAFE_DESTINATION');
  try{return await readReleaseResponse(await fetch(`https://api.github.com${path}`, {
    ...init,
    redirect:'manual',
    signal:AbortSignal.any([AbortSignal.timeout(30000),...(init?.signal?[init.signal]:[])]),
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':'application/json',
    },
  }));}catch(error){
    if(error instanceof AuthorityError||error instanceof EgressDenied)throw error;
    if(init?.signal?.aborted)throw new DOMException('Release request cancelled.','AbortError');
    throw new Error('GitHub release provider is unavailable. No automatic retry was made.');
  }
}

async function releaseJson(response:Response):Promise<unknown>{try{return await response.json();}catch{throw new AuthorityError('GITHUB_RELEASE_RECEIPT_DENIED');}}

/** Response metadata never grants a new upload origin or action authority.
 * Account ownership, exact consequential approval and source provenance remain
 * separate native-caller obligations. This is the fixed transport boundary. */
async function readReleaseResponse(response:Response):Promise<Response>{
  if(response.redirected||response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw new EgressDenied('UNSAFE_DESTINATION');}
  if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);throw new AuthorityError('GITHUB_RELEASE_PROVIDER_DENIED');}
  if(!response.ok){await response.body?.cancel().catch(()=>undefined);return new Response('Release provider request failed.',{status:response.status});}
  const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
  try{if(reader)for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>256*1024)throw new EgressDenied('INVALID_EGRESS_INPUT');chunks.push(item.value);}}
  finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
  const body=Buffer.concat(chunks);
  if(![204,205].includes(response.status))try{JSON.parse(body.toString('utf8'));}catch{throw new AuthorityError('GITHUB_RELEASE_RECEIPT_DENIED');}
  return new Response([204,205].includes(response.status)?null:body,{status:response.status,headers:{'Content-Type':'application/json'}});
}
function releaseTarget(uploadUrl:string,releaseId:number,htmlUrl:string|undefined,owner:string,repo:string,tag:string,name:string):string{
  const base=`https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets`;
  if(!Number.isSafeInteger(releaseId)||releaseId<1||![base,base+'{?name,label}'].includes(uploadUrl)
    ||htmlUrl!==`https://github.com/${owner}/${repo}/releases/tag/${tag}`)throw new EgressDenied('UNSAFE_DESTINATION');
  return base+'?name='+encodeURIComponent(name);
}
function releaseAsset(value:unknown,owner:string,repo:string,tag:string,name:string,size:number):string{
  const row=value as Record<string,unknown>|null;
  const url=`https://github.com/${owner}/${repo}/releases/download/${tag}/${name}`;
  if(!row||typeof row!=='object'||!Number.isSafeInteger(row.id)||Number(row.id)<1||row.name!==name||row.size!==size||row.state!=='uploaded'||row.browser_download_url!==url)throw new EgressDenied('INVALID_EGRESS_INPUT');
  return url;
}
function oldReleaseAsset(value:unknown,name:string):number|undefined{
  if(!Array.isArray(value)||value.length>100||value.some(row=>!row||!Number.isSafeInteger(row.id)||row.id<1||typeof row.name!=='string')
    ||new Set(value.map(row=>row.id)).size!==value.length)throw new EgressDenied('INVALID_EGRESS_INPUT');
  const rows=value.filter(row=>row.name===name);if(rows.length>1)throw new EgressDenied('INVALID_EGRESS_INPUT');
  return rows[0]?.id;
}

function splitRepo(fullName: string): { owner: string; repo: string } | null {
  if(typeof fullName!=='string'||fullName!==fullName.trim())return null;
  const parts = fullName.replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '').split('/');
  if (parts.length !== 2 || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(parts[0]??'')) return null;
  const repo=(parts[1]??'').replace(/\.git$/, '');
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)||repo==='.'||repo==='..')return null;
  return { owner: parts[0]!, repo };
}

async function nativeReleaseLifetime(opts:{userId:string;tenantContext?:TenantContext;signal?:AbortSignal;files?:ProjectFile[]},repo:{owner:string;repo:string}){
  const context=requireTenantContext(opts.tenantContext);requireResourceOwner(context,opts.userId);
  const signal=opts.signal;signal?.throwIfAborted();
  const token=await getGitHubToken(context.userId);if(!token)throw new AuthorityError('GITHUB_RELEASE_CREDENTIAL_REQUIRED');
  if(opts.files){
    const source=JSON.stringify(opts.files),bytes=Buffer.from(token);
    if(token.length>=8&&[token,encodeURIComponent(token),bytes.toString('base64'),bytes.toString('base64url'),JSON.stringify(token).slice(1,-1)].some(value=>source.includes(value)))throw new EgressDenied('SECRET_EGRESS_DENIED');
  }
  // Reuse the existing vault-revision lifetime check, without using source-read
  // admission as a consequential-write grant. The exact write grant is still
  // a separate unresolved obligation for these native callers.
  const credential=await createGitHubSourceReader(context.userId,token,`${repo.owner}/${repo.repo}`,context);
  const check=async()=>{signal?.throwIfAborted();await credential.assertCurrent();signal?.throwIfAborted();};
  const request=async(path:string,init?:RequestInit)=>{await check();const response=await ghFetch(token,path,{...init,signal});await check();return response;};
  await check();return{token,request,check,sourceRequest:credential.request};
}

export type ChromeZipShipResult = {
  ok: boolean;
  downloadUrl?: string;
  releaseUrl?: string;
  tag?: string;
  error?: string;
  needsConfirmation?: boolean;
  confirmation?: SafeBusinessActionConfirmation;
  reviewUrl?: string;
  preparedArtifact?: NativeArtifactReference;
};

/**
 * Package Chrome MV3 files into a zip and attach as a GitHub Release asset.
 * Free path: user downloads zip → sideload or upload to CWS (they pay ~$5).
 */
export async function shipChromeExtensionZip(opts: {
  userId: string;
  tenantContext?: TenantContext;
  signal?: AbortSignal;
  repoFullName: string;
  files: ProjectFile[];
  version?: string;
  projectId?: string;
  plan?: BusinessActionPlan;
  authorityPermit?: AuthorityPermit;
}): Promise<ChromeZipShipResult> {
  const actor=nativeReleaseActor(opts.userId,opts.tenantContext,opts.plan,opts.authorityPermit);
  opts={...opts,tenantContext:actor.context,repoFullName:actor.plan?String(actor.plan.arguments.repository):opts.repoFullName,files:actor.plan?[]:snapshotPublishingSource(opts.files)};
  if(opts.version!==undefined&&(!/^[A-Za-z0-9_.-]{1,90}$/.test(opts.version)||opts.version.includes('..')))throw new EgressDenied('INVALID_EGRESS_INPUT');
  requireResourceOwner(requireTenantContext(opts.tenantContext),opts.userId);
  opts={...opts};
  const parsed = splitRepo(opts.repoFullName);
  if (!parsed) return { ok: false, error: 'Invalid repo name' };
  const lifetime=await nativeReleaseLifetime(opts,parsed);
  const {token}=lifetime;
  const connection=await nativeReleaseConnection(actor.context);
  let admission:Awaited<ReturnType<typeof admitNativeRelease>>|undefined;
  const check=async()=>{await lifetime.check();if(await nativeReleaseConnection(actor.context)!==connection)throw new AuthorityError('NATIVE_RELEASE_ADMISSION_DENIED');};
  const request=async(path:string,init?:RequestInit)=>{if(init?.method&&init.method!=='GET'){if(!admission)throw new AuthorityError('NATIVE_RELEASE_ADMISSION_DENIED');await admission.write(path,init);}const response=await lifetime.request(path,init);await admission?.check();return response;};

  const tag=actor.plan?String(actor.plan.arguments.tag):(opts.version?.startsWith('v') ? opts.version : `v${opts.version || '1.0.0'}-extension`);
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(tag)||tag.includes('..'))throw new EgressDenied('INVALID_EGRESS_INPUT');
  const { owner, repo } = parsed;

  const createBody={
        tag_name: tag,
        name: `Chrome extension ${tag}`,
        body: 'Sideload zip packaged by Xroga. Load unpacked from the repo, or download this zip for Chrome Web Store (~$5 on your account).',
        draft: false,
        prerelease: false,
      };
  if(!actor.plan){
    const existing=await request(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
    let preparedReleaseId:number|null=null,preparedOldId:number|null=null;
    if(existing.ok){
      const row=await existing.json() as {id:number;tag_name:unknown;upload_url:string;html_url:string};
      if(row.tag_name!==tag)throw new EgressDenied('INVALID_EGRESS_INPUT');
      releaseTarget(row.upload_url,row.id,row.html_url,owner,repo,tag,"extension.zip");
      preparedReleaseId=row.id;
      const assets=await request(`/repos/${owner}/${repo}/releases/${row.id}/assets`);
      if(!assets.ok)return {ok:false,error:'Release asset lookup is unavailable.'};
      preparedOldId=oldReleaseAsset(await assets.json(),"extension.zip")??null;
    }else if(existing.status!==404)return {ok:false,error:'Release lookup is unavailable.'};
    return prepareNativeRelease({context:actor.context,repository:`${owner}/${repo}`,tag,flavor:'chrome',files:opts.files,token,connection,projectId:opts.projectId,releaseId:preparedReleaseId,oldAssetId:preparedOldId,createBody,check});
  }
  admission=await admitNativeRelease({actor,permit:opts.authorityPermit,flavor:'chrome',repository:`${owner}/${repo}`,tag,token,connection,check});
  const zip=admission.zip;
  try{

  // Create or reuse release
  let releaseId: number | null = null;
  let uploadUrl: string | null = null;
  let htmlUrl: string | undefined;

  const existing = await request(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (existing.ok) {
    const data = (await existing.json()) as {
      id: number;
      tag_name?: unknown;
      upload_url?: string;
      html_url?: string;
    };
    if(data.tag_name!==tag)throw new EgressDenied('INVALID_EGRESS_INPUT');
    admission.release(data.id,false);
    releaseId = data.id;
    uploadUrl = data.upload_url ?? null;
    htmlUrl = data.html_url;
  } else {
    if(existing.status!==404)return {ok:false,error:'Release lookup is unavailable.'};
    const created = await request(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify(createBody),
    });
    if (!created.ok) {
      const err = await created.text();
      return { ok: false, error: `Could not create release: ${err.slice(0, 200)}` };
    }
    const data = (await created.json()) as {
      id: number;
      tag_name?: unknown;
      upload_url?: string;
      html_url?: string;
    };
    if(data.tag_name!==tag)throw new EgressDenied('INVALID_EGRESS_INPUT');
    admission.release(data.id,true);
    releaseId = data.id;
    uploadUrl = data.upload_url ?? null;
    htmlUrl = data.html_url;
  }

  if (!uploadUrl || !releaseId) {
    return { ok: false, error: 'Release missing upload URL', releaseUrl: htmlUrl };
  }

  // upload_url looks like .../assets{?name,label}
  const assetUrl = releaseTarget(uploadUrl,releaseId,htmlUrl,owner,repo,tag,'extension.zip');

  // Delete existing extension.zip asset if re-shipping same tag
  const assetsRes = await request(`/repos/${owner}/${repo}/releases/${releaseId}/assets`);
  if(!assetsRes.ok)return {ok:false,error:'Release asset lookup is unavailable.',releaseUrl:htmlUrl,tag};
  const oldId=oldReleaseAsset(await assetsRes.json(),'extension.zip');
  admission.oldAsset(oldId);
  if(oldId!==undefined){
    const removed=await request(`/repos/${owner}/${repo}/releases/assets/${oldId}`,{method:'DELETE'});
    if(removed.status!==204)return {ok:false,error:'Existing release asset could not be removed.',releaseUrl:htmlUrl,tag};
  }

  await admission.beforeAssetWrite(releaseId,zip);
  const upload = await readReleaseResponse(await fetch(assetUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/zip',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: zip,
    redirect:'manual',
    signal:AbortSignal.any([AbortSignal.timeout(30000),...(opts.signal?[opts.signal]:[])]),
  }));

  await admission.check();
  if (!upload.ok) {
    const err = await upload.text();
    return {
      ok: false,
      error: `Zip upload failed: ${err.slice(0, 200)}`,
      releaseUrl: htmlUrl,
      tag,
    };
  }

  const downloadUrl=releaseAsset(await upload.json(),owner,repo,tag,'extension.zip',zip.length);
  return {
    ok: true,
    tag,
    releaseUrl: htmlUrl,
    downloadUrl,
  };
  }finally{admission.close();}
}

/**
 * Package Electron project as portable desktop.zip on GitHub Releases (immediate).
 * User can npm install && npm start — does not wait for Actions electron-builder.
 */
export async function shipElectronPortableZip(opts: {
  userId: string;
  tenantContext?: TenantContext;
  signal?: AbortSignal;
  repoFullName: string;
  files: ProjectFile[];
  version?: string;
  projectId?: string;
  plan?: BusinessActionPlan;
  authorityPermit?: AuthorityPermit;
}): Promise<ChromeZipShipResult> {
  const actor=nativeReleaseActor(opts.userId,opts.tenantContext,opts.plan,opts.authorityPermit);
  opts={...opts,tenantContext:actor.context,repoFullName:actor.plan?String(actor.plan.arguments.repository):opts.repoFullName,files:actor.plan?[]:snapshotPublishingSource(opts.files)};
  if(opts.version!==undefined&&(!/^[A-Za-z0-9_.-]{1,90}$/.test(opts.version)||opts.version.includes('..')))throw new EgressDenied('INVALID_EGRESS_INPUT');
  requireResourceOwner(requireTenantContext(opts.tenantContext),opts.userId);
  opts={...opts};
  const parsed = splitRepo(opts.repoFullName);
  if (!parsed) return { ok: false, error: 'Invalid repo name' };
  const lifetime=await nativeReleaseLifetime(opts,parsed);
  const {token}=lifetime;
  const connection=await nativeReleaseConnection(actor.context);
  let admission:Awaited<ReturnType<typeof admitNativeRelease>>|undefined;
  const check=async()=>{await lifetime.check();if(await nativeReleaseConnection(actor.context)!==connection)throw new AuthorityError('NATIVE_RELEASE_ADMISSION_DENIED');};
  const request=async(path:string,init?:RequestInit)=>{if(init?.method&&init.method!=='GET'){if(!admission)throw new AuthorityError('NATIVE_RELEASE_ADMISSION_DENIED');await admission.write(path,init);}const response=await lifetime.request(path,init);await admission?.check();return response;};

  const tag=actor.plan?String(actor.plan.arguments.tag):(opts.version?.startsWith('v') ? `${opts.version}-portable` : `v${opts.version || '1.0.0'}-portable`);
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(tag)||tag.includes('..'))throw new EgressDenied('INVALID_EGRESS_INPUT');
  const { owner, repo } = parsed;

  const createBody={
        tag_name: tag,
        name: `Desktop portable ${tag}`,
        body: [
          'Portable Electron project packaged by Xroga.',
          '',
          '1. Download `desktop.zip` and unzip',
          '2. `npm install && npm start`',
          '',
          'Optional: GitHub Actions can also build an unsigned Linux binary zip on a `v*` tag.',
          'Code signing / Mac App Store / Microsoft Store are not included.',
        ].join('\n'),
        draft: false,
        prerelease: false,
      };
  if(!actor.plan){
    const existing=await request(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
    let preparedReleaseId:number|null=null,preparedOldId:number|null=null;
    if(existing.ok){
      const row=await existing.json() as {id:number;tag_name:unknown;upload_url:string;html_url:string};
      if(row.tag_name!==tag)throw new EgressDenied('INVALID_EGRESS_INPUT');
      releaseTarget(row.upload_url,row.id,row.html_url,owner,repo,tag,"desktop.zip");
      preparedReleaseId=row.id;
      const assets=await request(`/repos/${owner}/${repo}/releases/${row.id}/assets`);
      if(!assets.ok)return {ok:false,error:'Release asset lookup is unavailable.'};
      preparedOldId=oldReleaseAsset(await assets.json(),"desktop.zip")??null;
    }else if(existing.status!==404)return {ok:false,error:'Release lookup is unavailable.'};
    return prepareNativeRelease({context:actor.context,repository:`${owner}/${repo}`,tag,flavor:'electron',files:opts.files,token,connection,projectId:opts.projectId,releaseId:preparedReleaseId,oldAssetId:preparedOldId,createBody,check});
  }
  admission=await admitNativeRelease({actor,permit:opts.authorityPermit,flavor:'electron',repository:`${owner}/${repo}`,tag,token,connection,check});
  const zip=admission.zip;
  try{

  let releaseId: number | null = null;
  let uploadUrl: string | null = null;
  let htmlUrl: string | undefined;

  const existing = await request(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (existing.ok) {
    const data = (await existing.json()) as {
      id: number;
      tag_name?: unknown;
      upload_url?: string;
      html_url?: string;
    };
    if(data.tag_name!==tag)throw new EgressDenied('INVALID_EGRESS_INPUT');
    admission.release(data.id,false);
    releaseId = data.id;
    uploadUrl = data.upload_url ?? null;
    htmlUrl = data.html_url;
  } else {
    if(existing.status!==404)return {ok:false,error:'Release lookup is unavailable.'};
    const created = await request(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify(createBody),
    });
    if (!created.ok) {
      const err = await created.text();
      return { ok: false, error: `Could not create release: ${err.slice(0, 200)}` };
    }
    const data = (await created.json()) as {
      id: number;
      tag_name?: unknown;
      upload_url?: string;
      html_url?: string;
    };
    if(data.tag_name!==tag)throw new EgressDenied('INVALID_EGRESS_INPUT');
    admission.release(data.id,true);
    releaseId = data.id;
    uploadUrl = data.upload_url ?? null;
    htmlUrl = data.html_url;
  }

  if (!uploadUrl || !releaseId) {
    return { ok: false, error: 'Release missing upload URL', releaseUrl: htmlUrl };
  }

  const assetUrl = releaseTarget(uploadUrl,releaseId,htmlUrl,owner,repo,tag,'desktop.zip');

  const assetsRes = await request(`/repos/${owner}/${repo}/releases/${releaseId}/assets`);
  if(!assetsRes.ok)return {ok:false,error:'Release asset lookup is unavailable.',releaseUrl:htmlUrl,tag};
  const oldId=oldReleaseAsset(await assetsRes.json(),'desktop.zip');
  admission.oldAsset(oldId);
  if(oldId!==undefined){
    const removed=await request(`/repos/${owner}/${repo}/releases/assets/${oldId}`,{method:'DELETE'});
    if(removed.status!==204)return {ok:false,error:'Existing release asset could not be removed.',releaseUrl:htmlUrl,tag};
  }

  await admission.beforeAssetWrite(releaseId,zip);
  const upload = await readReleaseResponse(await fetch(assetUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/zip',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: zip,
    redirect:'manual',
    signal:AbortSignal.any([AbortSignal.timeout(30000),...(opts.signal?[opts.signal]:[])]),
  }));

  await admission.check();
  if (!upload.ok) {
    const err = await upload.text();
    return {
      ok: false,
      error: `desktop.zip upload failed: ${err.slice(0, 200)}`,
      releaseUrl: htmlUrl,
      tag,
    };
  }

  const downloadUrl=releaseAsset(await upload.json(),owner,repo,tag,'desktop.zip',zip.length);
  return {
    ok: true,
    tag,
    releaseUrl: htmlUrl,
    downloadUrl,
  };
  }finally{admission.close();}
}

export type DesktopReleaseResult = {
  needsConfirmation?:boolean;
  reviewUrl?:string;
  requested?:boolean;
  commitSha?:string;
  ok: boolean;
  tag?: string;
  actionsUrl?: string;
  releasesUrl?: string;
  /** Set when a .zip asset is actually downloadable on the release */
  zipDownloadUrl?: string;
  error?: string;
};

/**
 * Prepare exact consent for one immutable release tag. The canonical executor
 * creates it only after approval. Tag creation is not an installer receipt.
 */
export async function triggerElectronDesktopRelease(opts:DesktopWorkflowInput):Promise<DesktopReleaseResult>{
 const parsed=splitRepo(opts.repoFullName);if(!parsed)throw new AuthorityError('DESKTOP_RELEASE_TARGET_REQUIRED');
 return requestDesktopWorkflow({...opts,repoFullName:`${parsed.owner}/${parsed.repo}`},input=>nativeReleaseLifetime(input,parsed));
}

/**
 * Poll GitHub Releases until an installer asset appears (exe/AppImage/dmg/msi/zip).
 */
export async function waitForDesktopReleaseZip(opts:{userId:string;tenantContext?:TenantContext;signal?:AbortSignal;repoFullName:string;tag?:string;commitSha?:string;projectId?:string;timeoutMs?:number;intervalMs?:number;onProgress?:(message:string)=>void}):Promise<{ok:boolean;zipDownloadUrl?:string;installerUrls?:string[];releaseUrl?:string;error?:string}>{
 const context=requireTenantContext(opts.tenantContext);requireResourceOwner(context,opts.userId);opts={...opts};
 const parsed=splitRepo(opts.repoFullName),tag=opts.tag,commit=opts.commitSha,timeoutMs=opts.timeoutMs??12*60000,intervalMs=opts.intervalMs??20000;
 if(!parsed||typeof tag!=='string'||!/^v[0-9]{1,8}\.[0-9]{1,8}\.[0-9]{1,8}(?:-[A-Za-z0-9][A-Za-z0-9.-]{0,40})?$/.test(tag)||typeof commit!=='string'||!/^[a-f0-9]{40}$/.test(commit)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>12*60000||!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>20000)throw new AuthorityError('DESKTOP_RELEASE_EXACT_SOURCE_REQUIRED');
 const repository=`${parsed.owner}/${parsed.repo}`,project=await requireNativeArtifactProject(context,repository,opts.projectId),signal=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(opts.signal?[opts.signal]:[])]),access=await nativeReleaseLifetime({...opts,signal},parsed);
 const check=async()=>{signal.throwIfAborted();await access.check();await requireNativeArtifactProject(context,repository,project);signal.throwIfAborted();};
 const pinnedTag=async()=>{await check();const response=await access.request(`/repos/${repository}/git/ref/tags/${tag}`);await check();if(!response.ok)throw new AuthorityError('DESKTOP_RELEASE_TAG_NOT_VERIFIED');const ref=await releaseJson(response) as{ref?:unknown;object?:{sha?:unknown;type?:unknown}};if(ref.ref!=='refs/tags/'+tag||ref.object?.sha!==commit||ref.object.type!=='commit')throw new AuthorityError('DESKTOP_RELEASE_TAG_CHANGED');};
 const started=Date.now();let attempt=0;
 while(Date.now()-started<timeoutMs){
  await pinnedTag();opts.onProgress?.(`Checking the exact desktop release ${tag}, attempt ${++attempt}.`);
  const response=await access.request(`/repos/${repository}/releases/tags/${tag}`);await check();
  if(response.ok){
   const data=await releaseJson(response) as{tag_name?:unknown;html_url?:unknown;draft?:unknown;assets?:Array<{id?:unknown;name?:unknown;state?:unknown;size?:unknown;browser_download_url?:unknown}>};
   if(data.tag_name!==tag||data.html_url!==`https://github.com/${repository}/releases/tag/${tag}`||data.draft!==false||!Array.isArray(data.assets)||data.assets.length>100)throw new AuthorityError('DESKTOP_RELEASE_RECEIPT_DENIED');
   const ready:Array<{name:string;url:string}>=[];
   for(const asset of data.assets){
    if(!asset||!Number.isSafeInteger(asset.id)||Number(asset.id)<1||typeof asset.name!=='string'||!asset.name||asset.name.length>200||/[\\/\x00-\x1f\x7f?#]/.test(asset.name)||asset.name==='.'||asset.name==='..'||typeof asset.browser_download_url!=='string'||containsCredentialSecretText(asset.name+asset.browser_download_url))throw new AuthorityError('DESKTOP_RELEASE_ASSET_DENIED');
    const selectedCredential=access.token,encoded=Buffer.from(selectedCredential),projection=asset.name+asset.browser_download_url;
    if(selectedCredential.length>=8&&[selectedCredential,encodeURIComponent(selectedCredential),encoded.toString('base64'),encoded.toString('base64url')].some(value=>projection.includes(value)))throw new AuthorityError('DESKTOP_RELEASE_ASSET_DENIED');
    let url:string;try{url=publicHttpsUrl(asset.browser_download_url).href;}catch{throw new AuthorityError('DESKTOP_RELEASE_ASSET_DENIED');}
    if(url!==`https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(asset.name)}`)throw new AuthorityError('DESKTOP_RELEASE_ASSET_DENIED');
    if(asset.state==='uploaded'&&Number.isSafeInteger(asset.size)&&Number(asset.size)>0&&/\.(zip|AppImage|exe|dmg|msi)$/i.test(asset.name))ready.push({name:asset.name,url});
   }
   const preferred=ready.find(asset=>/\.(exe|AppImage|dmg|msi)$/i.test(asset.name))??ready[0];
   if(preferred){await pinnedTag();await check();return{ok:true,zipDownloadUrl:preferred.url,installerUrls:ready.map(asset=>asset.url),releaseUrl:`https://github.com/${repository}/releases/tag/${tag}`};}
  }else if(response.status!==404)throw new Error('The exact desktop release is unavailable. No other tag was substituted.');
  await wait(Math.min(intervalMs,Math.max(1,timeoutMs-(Date.now()-started))),undefined,{signal});
 }
 return{ok:false,error:'The exact desktop release has no verified installer yet. Check its Actions run. No latest-release fallback was used.'};
}

/** Only the existing durable business-action executor supplies this permit. */
export async function executeNativeRelease(userId:string,plan:BusinessActionPlan,authorityPermit?:AuthorityPermit){
 const opts={userId,repoFullName:'',files:[],plan,authorityPermit};
 const result=plan.toolSlug==='XROGA_PUBLISH_CHROME_ZIP'?await shipChromeExtensionZip(opts):plan.toolSlug==='XROGA_PUBLISH_ELECTRON_ZIP'?await shipElectronPortableZip(opts):null;
 if(!result?.ok||!result.downloadUrl)throw new AuthorityError('NATIVE_RELEASE_NOT_VERIFIED');
 return result;
}
