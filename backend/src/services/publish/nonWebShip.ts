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
    GET:new RegExp(prefix+'(?:releases/(?:tags/[A-Za-z0-9_.-]{1,100}|latest|[1-9][0-9]*/assets)|git/ref/heads/(?:main|master))$'),
    POST:new RegExp(prefix+'(?:releases|git/(?:tags|refs)|actions/workflows/release\\.yml/dispatches)$'),
    DELETE:new RegExp(prefix+'releases/assets/[1-9][0-9]*$'),
  };
  if(!routes[method]?.test(path)||path.includes('..'))throw new EgressDenied('UNSAFE_DESTINATION');
  return readReleaseResponse(await fetch(`https://api.github.com${path}`, {
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
  }));
}

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
  return new Response([204,205].includes(response.status)?null:Buffer.concat(chunks),{status:response.status,headers:{'Content-Type':'application/json'}});
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
  await check();return{token,request,check};
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
  ok: boolean;
  tag?: string;
  actionsUrl?: string;
  releasesUrl?: string;
  /** Set when a .zip asset is actually downloadable on the release */
  zipDownloadUrl?: string;
  error?: string;
};

/**
 * Create a v* tag (triggers Desktop release workflow) or workflow_dispatch fallback.
 * Free path: unsigned zip on GitHub Releases when Actions finishes.
 */
export async function triggerElectronDesktopRelease(opts: {
  userId: string;
  tenantContext?: TenantContext;
  signal?: AbortSignal;
  repoFullName: string;
  commitSha?: string;
  version?: string;
}): Promise<DesktopReleaseResult> {
  requireResourceOwner(requireTenantContext(opts.tenantContext),opts.userId);
  opts={...opts};
  const parsed = splitRepo(opts.repoFullName);
  if (!parsed) return { ok: false, error: 'Invalid repo name' };
  const {token,request,check}=await nativeReleaseLifetime(opts,parsed);
  const { owner, repo } = parsed;

  const tag = opts.version?.startsWith('v') ? opts.version : `v${opts.version || '1.0.0'}`;
  const releasesUrl = `https://github.com/${owner}/${repo}/releases`;
  const actionsUrl = `https://github.com/${owner}/${repo}/actions`;

  // Resolve SHA for the tag
  let sha = opts.commitSha;
  if (!sha) {
    const ref = await request(`/repos/${owner}/${repo}/git/ref/heads/main`);
    if (ref.ok) {
      const data = (await ref.json()) as { object?: { sha?: string } };
      sha = data.object?.sha;
    }
    if (!sha) {
      const master = await request(`/repos/${owner}/${repo}/git/ref/heads/master`);
      if (master.ok) {
        const data = (await master.json()) as { object?: { sha?: string } };
        sha = data.object?.sha;
      }
    }
  }
  if (!sha) return { ok: false, error: 'No commit SHA to tag', actionsUrl, releasesUrl };

  // Create annotated tag object + ref (idempotent-ish: if tag exists, try dispatch)
  const tagObj = await request(`/repos/${owner}/${repo}/git/tags`, {
    method: 'POST',
    body: JSON.stringify({
      tag,
      message: `Xroga desktop release ${tag}`,
      object: sha,
      type: 'commit',
    }),
  });

  let tagged = false;
  if (tagObj.ok) {
    const tagData = (await tagObj.json()) as { sha?: string };
    const refRes = await request(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/tags/${tag}`,
        sha: tagData.sha || sha,
      }),
    });
    if (refRes.ok || refRes.status === 422) {
      tagged = true;
    }
  }

  if (!tagged) {
    // Fallback: workflow_dispatch on release.yml
    const dispatch = await request(`/repos/${owner}/${repo}/actions/workflows/release.yml/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'main' }),
    });
    if (!(dispatch.status === 204 || dispatch.ok)) {
      const dispatchMaster = await request(
        `/repos/${owner}/${repo}/actions/workflows/release.yml/dispatches`,
        {
          method: 'POST',
          body: JSON.stringify({ ref: 'master' }),
        },
      );
      if (!(dispatchMaster.status === 204 || dispatchMaster.ok)) {
        const err = await dispatch.text().catch(() => '');
        return {
          ok: false,
          tag,
          actionsUrl,
          releasesUrl,
          error: `Could not tag or dispatch release: ${err.slice(0, 180) || 'check Actions permissions'}`,
        };
      }
    }
  }

  return { ok: true, tag, actionsUrl, releasesUrl };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll GitHub Releases until an installer asset appears (exe/AppImage/dmg/msi/zip).
 */
export async function waitForDesktopReleaseZip(opts: {
  userId: string;
  tenantContext?: TenantContext;
  signal?: AbortSignal;
  repoFullName: string;
  tag?: string;
  /** Default 12 minutes — multi-OS matrix needs longer than linux-only */
  timeoutMs?: number;
  intervalMs?: number;
  onProgress?: (msg: string) => void;
}): Promise<{
  ok: boolean;
  zipDownloadUrl?: string;
  installerUrls?: string[];
  releaseUrl?: string;
  error?: string;
}> {
  requireResourceOwner(requireTenantContext(opts.tenantContext),opts.userId);
  opts={...opts};
  const parsed = splitRepo(opts.repoFullName);
  if (!parsed) return { ok: false, error: 'Invalid repo name' };
  const {token,request,check}=await nativeReleaseLifetime(opts,parsed);
  const { owner, repo } = parsed;
  const timeoutMs = opts.timeoutMs ?? 12 * 60 * 1000;
  const intervalMs = opts.intervalMs ?? 20_000;
  const started = Date.now();
  let attempt = 0;

  const installerRe = /\.(zip|AppImage|exe|dmg|msi|blockmap)$/i;

  while (Date.now() - started < timeoutMs) {
    attempt += 1;
    opts.onProgress?.(
      `Waiting for desktop installers on GitHub Releases (check ${attempt}, ~${Math.round((Date.now() - started) / 1000)}s)…`,
    );

    const paths = opts.tag
      ? [`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(opts.tag)}`]
      : [];
    paths.push(`/repos/${owner}/${repo}/releases/latest`);

    for (const path of paths) {
      const res = await request(path);
      if (!res.ok) continue;
      const data = (await res.json()) as {
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string; state?: string }>;
      };
      const ready = (data.assets || []).filter(
        (a) =>
          a.browser_download_url &&
          installerRe.test(a.name || '') &&
          !/\.blockmap$/i.test(a.name || '') &&
          (!a.state || a.state === 'uploaded'),
      );
      // Prefer real installers over source zip
      const preferred =
        ready.find((a) => /\.(exe|AppImage|dmg|msi)$/i.test(a.name || '')) || ready[0];
      if (preferred?.browser_download_url) {
        return {
          ok: true,
          zipDownloadUrl: preferred.browser_download_url,
          installerUrls: ready.map((a) => a.browser_download_url!).filter(Boolean),
          releaseUrl: data.html_url,
        };
      }
    }

    await sleep(intervalMs);
  }

  return {
    ok: false,
    error:
      'Desktop installers not ready yet — GitHub Actions is still building. Open Actions/Releases when green.',
  };
}

/** Only the existing durable business-action executor supplies this permit. */
export async function executeNativeRelease(userId:string,plan:BusinessActionPlan,authorityPermit?:AuthorityPermit){
 const opts={userId,repoFullName:'',files:[],plan,authorityPermit};
 const result=plan.toolSlug==='XROGA_PUBLISH_CHROME_ZIP'?await shipChromeExtensionZip(opts):plan.toolSlug==='XROGA_PUBLISH_ELECTRON_ZIP'?await shipElectronPortableZip(opts):null;
 if(!result?.ok||!result.downloadUrl)throw new AuthorityError('NATIVE_RELEASE_NOT_VERIFIED');
 return result;
}
