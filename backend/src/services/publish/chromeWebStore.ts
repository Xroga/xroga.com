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
import {
  getUserProviderKey,
  saveUserProviderKey,
} from '../integrations/userProviderKeys.js';
import {
  clearPkceSession,
  loadPkceSession,
  storePkceSession,
} from '../integrations/oauthPkceStore.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CWS_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const PKCE_PROVIDER = 'cws_oauth_pkce';
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

export async function getCwsCredentials(userId: string): Promise<CwsCredentials | null> {
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
      extensionId: parsed.extensionId.trim(),
      publisherId: parsed.publisherId.trim().replace(/^publishers\//, ''),
    };
  } catch {
    return null;
  }
}

export async function saveCwsCredentials(
  userId: string,
  creds: CwsCredentials,
): Promise<void> {
  await saveUserProviderKey(
    userId,
    'cws_oauth',
    JSON.stringify({
      clientId: creds.clientId.trim(),
      clientSecret: creds.clientSecret.trim(),
      refreshToken: creds.refreshToken.trim(),
      extensionId: creds.extensionId.trim(),
      publisherId: creds.publisherId.trim().replace(/^publishers\//, ''),
    }),
  );
}

async function refreshAccessToken(creds: CwsCredentials): Promise<string> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Chrome Web Store OAuth failed (${res.status}) — check client id/secret/refresh token`,
    );
  }
  return json.access_token;
}

/** Validate saved (or pasted) CWS OAuth by refreshing an access token. */
export async function validateCwsCredentials(
  creds: CwsCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await refreshAccessToken(creds);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function itemName(creds: CwsCredentials): string {
  return `publishers/${creds.publisherId}/items/${creds.extensionId}`;
}

/**
 * Start Google OAuth for Chrome Web Store using the user's own OAuth client.
 * User must add the returned redirectUri on their Google Cloud OAuth client.
 */
export async function startCwsOAuth(opts: {
  userId: string;
  clientId: string;
  clientSecret: string;
  extensionId: string;
  publisherId: string;
  redirectUri: string;
}): Promise<{ url: string; state: string; redirectUri: string }> {
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

  await storePkceSession(opts.userId, PKCE_PROVIDER, {
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
  userId: string;
  code: string;
  state: string;
  redirectUri?: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const pkce = await loadPkceSession(opts.userId, PKCE_PROVIDER, opts.state);
  if (!pkce) {
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
    await clearPkceSession(opts.userId, PKCE_PROVIDER);
    return { ok: false, error: 'CWS OAuth session missing client fields — start again' };
  }

  const body = new URLSearchParams({
    code: opts.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  await clearPkceSession(opts.userId, PKCE_PROVIDER);

  if (!res.ok || !json.refresh_token) {
    return {
      ok: false,
      error:
        json.error_description ||
        json.error ||
        (!json.refresh_token
          ? 'Google did not return a refresh token — ensure access_type=offline and prompt=consent, and that this OAuth client is new/unused for this Google account'
          : `Token exchange failed (${res.status})`),
    };
  }

  const creds: CwsCredentials = {
    clientId,
    clientSecret,
    refreshToken: json.refresh_token,
    extensionId,
    publisherId,
  };
  await saveCwsCredentials(opts.userId, creds);

  return {
    ok: true,
    message:
      'Chrome Web Store OAuth connected. Next Chrome ship uploads + submits for Google review (listing must already exist in the CWS dashboard).',
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
};

/**
 * Upload extension.zip then submit for CWS review (publish).
 * Does NOT mean the extension is public yet — Google review is separate.
 */
export async function publishChromeExtensionToStore(opts: {
  userId: string;
  zip: Buffer;
}): Promise<CwsPublishResult> {
  const creds = await getCwsCredentials(opts.userId);
  if (!creds) {
    return {
      ok: false,
      submitted: false,
      message:
        'Connect Chrome Web Store in Publish (Authorize Google or paste OAuth + extension ID + publisher ID). Create the listing once in the CWS dashboard first (~$5).',
      error: 'NO_CWS_CREDS',
    };
  }
  if (opts.zip.length < 64) {
    return {
      ok: false,
      submitted: false,
      message: 'extension.zip is empty',
      error: 'EMPTY_ZIP',
    };
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(creds);
  } catch (err) {
    return {
      ok: false,
      submitted: false,
      message: (err as Error).message,
      error: 'OAUTH_FAILED',
    };
  }

  const name = itemName(creds);
  const uploadUrl = `https://chromewebstore.googleapis.com/upload/v2/${name}:upload`;
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/zip',
      'x-goog-api-version': '2',
    },
    body: opts.zip,
  });
  const uploadJson = (await upload.json().catch(() => ({}))) as {
    uploadState?: string;
    itemId?: string;
    error?: { message?: string };
    message?: string;
  };
  if (!upload.ok) {
    return {
      ok: false,
      submitted: false,
      message:
        uploadJson.error?.message ||
        uploadJson.message ||
        `CWS upload failed (${upload.status})`,
      error: 'UPLOAD_FAILED',
      dashboardUrl: `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`,
    };
  }

  const publishUrl = `https://chromewebstore.googleapis.com/v2/${name}:publish`;
  const publish = await fetch(publishUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-api-version': '2',
    },
    body: JSON.stringify({ publishType: 'DEFAULT_PUBLISH' }),
  });
  const publishJson = (await publish.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
    status?: string;
  };
  if (!publish.ok) {
    return {
      ok: true,
      submitted: false,
      uploadState: uploadJson.uploadState,
      itemId: uploadJson.itemId || creds.extensionId,
      dashboardUrl: `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`,
      message:
        `Zip uploaded to CWS, but publish/submit failed: ${
          publishJson.error?.message || publishJson.message || publish.status
        }. Open the developer dashboard to finish submit.`,
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
}

/** Fetch listing status after submit (best-effort; never invents “approved”). */
export async function fetchCwsItemStatus(userId: string): Promise<{
  ok: boolean;
  status?: string;
  dashboardUrl?: string;
  message: string;
  error?: string;
}> {
  const creds = await getCwsCredentials(userId);
  if (!creds) {
    return {
      ok: false,
      message: 'No CWS credentials connected',
      error: 'NO_CWS_CREDS',
    };
  }
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(creds);
  } catch (err) {
    return { ok: false, message: (err as Error).message, error: 'OAUTH_FAILED' };
  }

  const name = itemName(creds);
  const res = await fetch(`https://chromewebstore.googleapis.com/v2/${name}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'x-goog-api-version': '2',
    },
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    itemId?: string;
    error?: { message?: string };
    message?: string;
  };
  const dashboardUrl = `https://chrome.google.com/webstore/devconsole/${creds.extensionId}`;
  if (!res.ok) {
    return {
      ok: false,
      dashboardUrl,
      message: json.error?.message || json.message || `CWS status failed (${res.status})`,
      error: 'STATUS_FAILED',
    };
  }
  return {
    ok: true,
    status: json.status || 'UNKNOWN',
    dashboardUrl,
    message: `CWS item status: ${json.status || 'UNKNOWN'} (public only after Google approval)`,
  };
}

export { CWS_SCOPE };
