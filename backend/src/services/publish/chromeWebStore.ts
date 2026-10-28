/**
 * Chrome Web Store Publish API (v2 upload + publish) + user Google OAuth.
 * Real submit only — Google still reviews; we never fake “live in store”.
 *
 * Prerequisites (user’s Google Cloud + CWS developer account ~$5):
 * - OAuth client (Desktop or Web) with redirect → /dashboard/publish/cws/callback
 * - Extension already created once in CWS dashboard (API cannot finish first listing metadata)
 * - Publisher ID + Extension (item) ID
 */

import { randomBytes } from 'crypto';
import {isDeepStrictEqual} from 'node:util';
import {AuthorityError} from '../../security/authority/enforce.js';
import type {AuthorityPermit} from '../../security/authority/types.js';
import {EgressDenied} from '../../security/egress/egressPolicy.js';
import type {BusinessActionPlan} from '../integrations/businessAction.js';
import type {SafeBusinessActionConfirmation} from '../integrations/businessActionConfirmations.js';
import {nativeReleaseActor} from './nativeReleaseAdmission.js';
import {requireNativeArtifactProject,type NativeArtifactReference} from './nativeArtifact.js';
import {cwsConnection,prepareCwsPublication,admitCwsPublication} from './cwsAdmission.js';
import { requireTenantContext, requireResourceOwner, type TenantContext } from '../../security/tenantContext.js';
import {
  getUserProviderKey,
  saveUserProviderKey,
  prepareUserProviderKeyWrite,
  type ProviderKeyWriteAdmission,
} from '../integrations/userProviderKeys.js';
import {
  consumePkceSession,
  storePkceSession,
} from '../integrations/oauthPkceStore.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const PKCE_PROVIDER = 'cws_oauth_pkce';
const itemStates=new Set(['PENDING_REVIEW','STAGED','PUBLISHED','PUBLISHED_TO_TESTERS','REJECTED','CANCELLED']);
const uploadStates=new Set(['UPLOAD_STATE_UNSPECIFIED','SUCCEEDED','IN_PROGRESS','FAILED','NOT_FOUND']);
function resourceIds(extensionId:string,publisherId:string):{extensionId:string;publisherId:string}{
  const item=typeof extensionId==='string'?extensionId.trim():'';
  const publisher=typeof publisherId==='string'?publisherId.trim().replace(/^publishers\//,''):'';
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(item)||!/^[A-Za-z0-9_-]{1,128}$/.test(publisher))throw new Error('Invalid Chrome Web Store item or publisher identifier.');
  return {extensionId:item,publisherId:publisher};
}
async function cwsFetch(input:string,init:RequestInit,context:TenantContext,check:()=>Promise<void>=async()=>{}):Promise<Response>{
  requireTenantContext(context);
  const url=new URL(input),method=init.method??'GET',ids='[A-Za-z0-9_-]{1,128}';
  const allowed=input===TOKEN_URL&&method==='POST'||url.origin==='https://chromewebstore.googleapis.com'&&(
    method==='POST'&&new RegExp(`^/(?:upload/v2/publishers/${ids}/items/${ids}:upload|v2/publishers/${ids}/items/${ids}:publish)$`).test(url.pathname)
    ||method==='GET'&&new RegExp(`^/v2/publishers/${ids}/items/${ids}:fetchStatus$`).test(url.pathname));
  if(!allowed||url.search||url.hash||url.username||url.password||input!==url.href||/%/.test(url.pathname))throw new EgressDenied('UNSAFE_DESTINATION');
  await check();requireTenantContext(context);init.signal?.throwIfAborted();
  let response:Response;
  try{response=await fetch(input,{...init,redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(20_000),...(init.signal?[init.signal]:[])])});}catch{throw new Error('Chrome Web Store request unavailable. Retry shortly.');}
  if(response.redirected||response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw new EgressDenied('UNSAFE_DESTINATION');}
  if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);throw new AuthorityError('CWS_PROVIDER_AUTHORIZATION_DENIED');}
  if(!response.ok){await response.body?.cancel().catch(()=>undefined);await check();return new Response('Provider request unavailable.',{status:response.status});}
  const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
  try{if(reader)for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>65536)throw new EgressDenied('INVALID_EGRESS_INPUT');chunks.push(item.value);}}
  finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
  await check();requireTenantContext(context);init.signal?.throwIfAborted();
  return new Response([204,205].includes(response.status)?null:Buffer.concat(chunks),{status:response.status,headers:{'Content-Type':'application/json'}});
}
function matchesItem(value:unknown,creds:CwsCredentials):boolean{
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const row=value as Record<string,unknown>;
  return row.name===itemName(creds)&&row.itemId===creds.extensionId&&!row.error;
}
export const CWS_CALLBACK_PATH = '/dashboard/publish/cws/callback';

export type CwsCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  extensionId: string;
  /** publishers/{publisherId} or bare publisher id */
  publisherId: string;
};

type CwsOAuthPending = {
  clientId: string;
  clientSecret: string;
  extensionId: string;
  publisherId: string;
};

function productionFrontendBase(): string {
  const raw = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  if (raw && !/\.vercel\.app$/i.test(raw)) return raw;
  return 'https://xroga.com';
}

function allowedOrigins(): string[] {
  const bases = [
    productionFrontendBase(),
    'https://xroga.com',
    'https://www.xroga.com',
    'http://localhost:3000',
    (process.env.FRONTEND_URL ?? '').replace(/\/$/, ''),
  ].filter(Boolean);
  return [...new Set(bases)];
}

export function isAllowedCwsCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return allowedOrigins().includes(u.origin) && path === CWS_CALLBACK_PATH;
  } catch {
    return false;
  }
}

export function getCwsOAuthCallbackUrl(requested?: string): string {
  if (requested && isAllowedCwsCallbackUrl(requested)) {
    return requested.replace(/\/$/, '');
  }
  const base =
    process.env.NODE_ENV === 'production'
      ? productionFrontendBase()
      : (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${CWS_CALLBACK_PATH}`;
}

export async function getCwsCredentials(userId: string, tenantContext?:TenantContext): Promise<CwsCredentials | null> {
  requireResourceOwner(requireTenantContext(tenantContext),userId);
  const raw = await getUserProviderKey(userId, 'cws_oauth');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CwsCredentials>;
    if (
      !parsed.clientId?.trim() ||
      !parsed.clientSecret?.trim() ||
      !parsed.refreshToken?.trim() ||
      !parsed.extensionId?.trim() ||
      !parsed.publisherId?.trim()
    ) {
      return null;
    }
    return {
      clientId: parsed.clientId.trim(),
      clientSecret: parsed.clientSecret.trim(),
      refreshToken: parsed.refreshToken.trim(),
      ...resourceIds(parsed.extensionId,parsed.publisherId),
    };
  } catch {
    return null;
  }
}

export async function saveCwsCredentials(
  userId: string,
  creds: CwsCredentials,
  writeAdmission?: ProviderKeyWriteAdmission,
  tenantContext?:TenantContext,
): Promise<void> {
  requireResourceOwner(requireTenantContext(tenantContext),userId);
  const identity=resourceIds(creds.extensionId,creds.publisherId);
  await saveUserProviderKey(
    userId,
    'cws_oauth',
    JSON.stringify({
      clientId: creds.clientId.trim(),
      clientSecret: creds.clientSecret.trim(),
      refreshToken: creds.refreshToken.trim(),
      ...identity,
    }),
    { writeAdmission },
  );
}

async function refreshAccessToken(creds: CwsCredentials, context:TenantContext,check?:()=>Promise<void>): Promise<string> {
  resourceIds(creds.extensionId,creds.publisherId);
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await cwsFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  },context,check);
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || typeof json?.access_token!=='string' || !json.access_token || json.access_token.length>16384 || /[\x00-\x20\x7f]/.test(json.access_token) || json.error) {
    throw new Error('Chrome Web Store OAuth failed. Reconnect your Google credentials.');
  }
  return json.access_token;
}

/** Validate saved (or pasted) CWS OAuth by refreshing an access token. */
export async function validateCwsCredentials(
  creds: CwsCredentials,
  tenantContext?:TenantContext,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const context=requireTenantContext(tenantContext);
  creds={...creds};
  try {
    await refreshAccessToken(creds,context);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'Chrome Web Store credentials could not be validated.' };
  }
}

function itemName(creds: CwsCredentials): string {
  const ids=resourceIds(creds.extensionId,creds.publisherId);
  return `publishers/${encodeURIComponent(ids.publisherId)}/items/${encodeURIComponent(ids.extensionId)}`;
}

/** Authenticated provider readback, not a client-supplied publisher claim.
 * A valid new unpublished listing need not have a published revision yet. */
async function verifyCwsItemAccess(creds:CwsCredentials,accessToken:string,context:TenantContext,check:()=>Promise<void>){
  const response=await cwsFetch(`https://chromewebstore.googleapis.com/v2/${itemName(creds)}:fetchStatus`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json','x-goog-api-version':'2'}},context,check);
  const value=await response.json().catch(()=>null);
  if(!response.ok||!matchesItem(value,creds))throw new AuthorityError('CWS_ITEM_ACCESS_NOT_VERIFIED');
}

/**
 * Start Google OAuth for Chrome Web Store using the user's own OAuth client.
 * User must add the returned redirectUri on their Google Cloud OAuth client.
 */
export async function startCwsOAuth(opts: {
  tenantContext: TenantContext;
  clientId: string;
  clientSecret: string;
  extensionId: string;
  publisherId: string;
  redirectUri: string;
}): Promise<{ url: string; state: string; redirectUri: string }> {
  const context = requireTenantContext(opts.tenantContext);
  resourceIds(opts.extensionId,opts.publisherId);
  const redirectUri = getCwsOAuthCallbackUrl(opts.redirectUri);
  if (!isAllowedCwsCallbackUrl(redirectUri)) {
    throw new Error('Invalid CWS OAuth redirect URI');
  }
  const state = randomBytes(24).toString('hex');
  const pending: CwsOAuthPending = {
    clientId: opts.clientId.trim(),
    clientSecret: opts.clientSecret.trim(),
    extensionId: opts.extensionId.trim(),
    publisherId: opts.publisherId.trim().replace(/^publishers\//, ''),
  };
  if (
    !pending.clientId ||
    !pending.clientSecret ||
    !pending.extensionId ||
    !pending.publisherId
  ) {
    throw new Error('clientId, clientSecret, extensionId, and publisherId are required');
  }

  await storePkceSession(context, PKCE_PROVIDER, {
    verifier: pending.clientSecret,
    state,
    redirect_uri: redirectUri,
    nonce: JSON.stringify({
      clientId: pending.clientId,
      extensionId: pending.extensionId,
      publisherId: pending.publisherId,
    }),
    created_at: new Date().toISOString(),
  });

  const params = new URLSearchParams({
    client_id: pending.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: CWS_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return {
    url: `${AUTH_URL}?${params.toString()}`,
    state,
    redirectUri,
  };
}

/** Exchange Google auth code → refresh token and save CWS credentials. */
export async function completeCwsOAuth(opts: {
  tenantContext: TenantContext;
  code: string;
  state: string;
  redirectUri?: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  opts={...opts};
  const context = requireTenantContext(opts.tenantContext);
  const { userId } = context;
  const pkce = await consumePkceSession(context, PKCE_PROVIDER, opts.state);
  if (!pkce?.authorization_revision) {
    return {
      ok: false,
      error: 'CWS OAuth session expired — start Authorize again from Publish',
    };
  }

  const redirectUri =
    pkce.redirect_uri && isAllowedCwsCallbackUrl(pkce.redirect_uri)
      ? pkce.redirect_uri
      : getCwsOAuthCallbackUrl(opts.redirectUri);

  let meta: { clientId?: string; extensionId?: string; publisherId?: string } = {};
  try {
    meta = JSON.parse(pkce.nonce || '{}') as typeof meta;
  } catch {
    meta = {};
  }
  const clientId = String(meta.clientId || '').trim();
  const clientSecret = String(pkce.verifier || '').trim();
  const extensionId = String(meta.extensionId || '').trim();
  const publisherId = String(meta.publisherId || '').trim();
  if (!clientId || !clientSecret || !extensionId || !publisherId) {
    return { ok: false, error: 'CWS OAuth session missing client fields — start again' };
  }
  resourceIds(extensionId,publisherId);

  const writeAdmission = await prepareUserProviderKeyWrite(userId, 'cws_oauth', {
    cwsAuthorizationRevision: pkce.authorization_revision,
  });

  const body = new URLSearchParams({
    code: opts.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await cwsFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  },context);
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || typeof json?.refresh_token!=='string' || !json.refresh_token.trim() || json.error) {
    return {
      ok: false,
      error: 'Google token exchange failed or did not return a refresh token. Reauthorize with offline access.',
    };
  }

  const creds: CwsCredentials = {
    clientId,
    clientSecret,
    refreshToken: json.refresh_token,
    extensionId,
    publisherId,
  };
  await saveCwsCredentials(userId, creds, writeAdmission,context);

  return {
    ok: true,
    message:
      'Chrome Web Store OAuth connected. The next Chrome ship will prepare an upload and submission for your approval. The listing must already exist in the CWS dashboard.',
  };
}

export type CwsPublishResult = {
  ok: boolean;
  submitted: boolean;
  uploadState?: string;
  itemId?: string;
  dashboardUrl?: string;
  message: string;
  error?: string;
  needsConfirmation?:boolean;
  confirmation?:SafeBusinessActionConfirmation;
  reviewUrl?:string;
};

/**
 * Upload extension.zip then submit for CWS review (publish).
 * Does NOT mean the extension is public yet — Google review is separate.
 */
export async function publishChromeExtensionToStore(opts: {
  userId: string;
  zip?: Buffer;
  tenantContext?:TenantContext;
  repoFullName?:string;
  artifact?:NativeArtifactReference;
  plan?:BusinessActionPlan;
  authorityPermit?:AuthorityPermit;
}): Promise<CwsPublishResult> {
  const actor=nativeReleaseActor(opts.userId,opts.tenantContext,opts.plan,opts.authorityPermit);
  opts={...opts};
  // An opaque caller ZIP cannot prove source provenance, even with an actor.
  if(opts.zip!==undefined)throw new AuthorityError('CWS_INSPECTABLE_SOURCE_REQUIRED');
  const repository=actor.plan?.arguments.repository??opts.repoFullName;
  const artifact=actor.plan?.arguments.artifact??opts.artifact;
  if(typeof repository!=='string'||!artifact||typeof artifact!=='object')throw new AuthorityError('CWS_INSPECTABLE_SOURCE_REQUIRED');
  const reference={...artifact as NativeArtifactReference};
  await requireNativeArtifactProject(actor.context,repository,reference.projectId);
  const creds = await getCwsCredentials(opts.userId,actor.context);
  if (!creds) {
    return {
      ok: false,
      submitted: false,
      message:
        'Connect Chrome Web Store in Publish (Authorize Google or paste OAuth + extension ID + publisher ID). Create the listing once in the CWS dashboard first (~$5).',
      error: 'NO_CWS_CREDS',
    };
  }
  const connection=await cwsConnection(actor.context);
  const check=async()=>{if(await cwsConnection(actor.context)!==connection||!isDeepStrictEqual(await getCwsCredentials(opts.userId,actor.context),creds))throw new AuthorityError('CWS_CREDENTIAL_CHANGED');};
  await check();
  if(!actor.plan)return prepareCwsPublication({context:actor.context,repository,artifact:reference,creds,connection,check,verifyAccount:async guard=>{
    const token=await refreshAccessToken(creds,actor.context,guard);await verifyCwsItemAccess(creds,token,actor.context,guard);return token;
  }});
  const admission=await admitCwsPublication({actor,permit:opts.authorityPermit,repository,creds,connection,check});
  try{
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(creds,actor.context,admission.check);
  } catch (err) {
    if(err instanceof AuthorityError||err instanceof EgressDenied)throw err;
    return {
      ok: false,
      submitted: false,
      message: 'Chrome Web Store authorization unavailable. Reconnect your Google credentials.',
      error: 'OAUTH_FAILED',
    };
  }

  const name = itemName(creds);
  await verifyCwsItemAccess(creds,accessToken,actor.context,admission.check);
  const uploadUrl = `https://chromewebstore.googleapis.com/upload/v2/${name}:upload`;
  await admission.beforeUpload(accessToken);
  const upload = await cwsFetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip',
      'x-goog-api-version': '2',
    },
    body: admission.zip,
  },actor.context,admission.check);
  const uploadJson = (await upload.json().catch(() => ({}))) as {
    name?:string;
    uploadState?: string;
    itemId?: string;
    error?: { message?: string };
    message?: string;
  };
  if (!upload.ok || !matchesItem(uploadJson,creds) || uploadJson.uploadState!=='SUCCEEDED') {
    return {
      ok: false,
      submitted: false,
      message: upload.ok && matchesItem(uploadJson,creds) && uploadJson.uploadState==='IN_PROGRESS'
        ? 'Chrome Web Store upload is still processing. Check status or the developer dashboard before submitting.'
        : 'Chrome Web Store upload could not be verified. Check the developer dashboard before retrying.',
      error: upload.ok && matchesItem(uploadJson,creds) && uploadJson.uploadState==='IN_PROGRESS'?'UPLOAD_PENDING':'UPLOAD_FAILED',
      uploadState:uploadJson && uploadStates.has(uploadJson.uploadState??'')?uploadJson.uploadState:undefined,
      dashboardUrl: `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`,
    };
  }

  await admission.uploadVerified();
  const publishUrl = `https://chromewebstore.googleapis.com/v2/${name}:publish`;
  await admission.beforePublish();
  const publish = await cwsFetch(publishUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-api-version': '2',
    },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  },actor.context,admission.check);
  const publishJson = (await publish.json().catch(() => ({}))) as {
    name?:string;itemId?:string;state?:string;
    error?: { message?: string };
    message?: string;
    status?: string;
  };
  if (!publish.ok || !matchesItem(publishJson,creds) || !['PENDING_REVIEW','STAGED','PUBLISHED','PUBLISHED_TO_TESTERS'].includes(publishJson.state??'')) {
    return {
      ok: true,
      submitted: false,
      uploadState: uploadJson.uploadState,
      itemId: uploadJson.itemId || creds.extensionId,
      dashboardUrl: `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`,
      message: 'Zip upload succeeded, but submission could not be verified. Check the developer dashboard before retrying.',
      error: 'PUBLISH_FAILED',
    };
  }

  return {
    ok: true,
    submitted: true,
    uploadState: uploadJson.uploadState,
    itemId: uploadJson.itemId || creds.extensionId,
    dashboardUrl: `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`,
    message:
      'Submitted to Chrome Web Store for Google review. Listing goes public only after Google approves — Xroga cannot skip review.',
  };
  }finally{admission.close();}
}

/** Fetch listing status after submit (best-effort; never invents “approved”). */
export async function fetchCwsItemStatus(userId: string,tenantContext?:TenantContext): Promise<{
  ok: boolean;
  status?: string;
  dashboardUrl?: string;
  message: string;
  error?: string;
}> {
  const context=requireTenantContext(tenantContext);requireResourceOwner(context,userId);
  const creds = await getCwsCredentials(userId,context);
  if (!creds) {
    return {
      ok: false,
      message: 'No CWS credentials connected',
      error: 'NO_CWS_CREDS',
    };
  }
  const connection=await cwsConnection(context);
  const check=async()=>{if(await cwsConnection(context)!==connection||!isDeepStrictEqual(await getCwsCredentials(userId,context),creds))throw new AuthorityError('CWS_CREDENTIAL_CHANGED');};
  await check();
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(creds,context,check);
  } catch (err) {
    if(err instanceof AuthorityError||err instanceof EgressDenied)throw err;
    return { ok: false, message: (err as Error).message, error: 'OAUTH_FAILED' };
  }

  const name = itemName(creds);
  const res = await cwsFetch(`https://chromewebstore.googleapis.com/v2/${name}:fetchStatus`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'x-goog-api-version': '2',
    },
  },context,check);
  const json = (await res.json().catch(() => ({}))) as {
    name?: string;
    publishedItemRevisionStatus?: {state?:string};
    submittedItemRevisionStatus?: {state?:string};
    lastAsyncUploadState?: string;
    takenDown?: boolean;
    itemId?: string;
    error?: { message?: string };
    message?: string;
  };
  const dashboardUrl = `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`;
  const state=json?.takenDown===true?'TAKEN_DOWN':json?.submittedItemRevisionStatus?.state??json?.publishedItemRevisionStatus?.state;
  if (!res.ok || !matchesItem(json,creds) || (json.takenDown!==undefined && typeof json.takenDown!=='boolean') || !state || (state!=='TAKEN_DOWN'&&!itemStates.has(state))) {
    return {
      ok: false,
      dashboardUrl,
      message: 'Chrome Web Store status could not be verified. Check the developer dashboard.',
      error: 'STATUS_FAILED',
    };
  }
  return {
    ok: true,
    status: state,
    dashboardUrl,
    message: `CWS item status: ${state}. Review the developer dashboard for release details.`,
  };
}

export { CWS_SCOPE };

export async function executeCwsPublication(userId:string,plan:BusinessActionPlan,authorityPermit?:AuthorityPermit){
 const result=await publishChromeExtensionToStore({userId,plan,authorityPermit});
 if(!result.ok||!result.submitted)throw new AuthorityError('CWS_PUBLICATION_NOT_VERIFIED');
 return result;
}
