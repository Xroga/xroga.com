/**
 * Vercel "Sign in with Vercel" Apps OAuth (PKCE).
 * Client IDs look like cl_… — token endpoint is /login/oauth/token (not /v2/oauth/access_token).
 */

import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { ensureGithubSchema, githubSchemaAutoBootstrapEnabled } from '../../db/ensureGithubSchema.js';
import { isMissingTableError } from './githubTokenStore.js';
import {
  clearPkceSession,
  loadPkceSession,
  storePkceSession,
} from './oauthPkceStore.js';

const PKCE_PROVIDER = 'vercel_oauth_pkce';
const CALLBACK_PATH = '/dashboard/integrations/vercel/callback';
const TOKEN_BUCKET = 'xroga-github-tokens';
const TOKEN_REFRESH_SKEW_MS = 60_000;
const REFRESH_LEASE_PREFIX = 'xroga-refresh-lease:';
const REFRESH_LEASE_MS = 30_000;
const REFRESH_WAIT_MS = 20_000;

// A Vercel refresh token is rotated when it is used. Deduplicate refreshes in
// this process, then claim the stored refresh token atomically before crossing
// Fly machines. A DB reload remains the recovery path for a waiting machine
// after the lease owner stores the rotated pair.
const vercelRefreshInFlight = new Map<string, Promise<string>>();

type VercelRefreshLease = {
  claimId: string;
  expiresAt: number;
  refreshToken: string;
};

function encodeVercelRefreshLease(refreshToken: string): string {
  const lease: VercelRefreshLease = {
    claimId: randomBytes(16).toString('hex'),
    expiresAt: Date.now() + REFRESH_LEASE_MS,
    refreshToken,
  };
  return `${REFRESH_LEASE_PREFIX}${Buffer.from(JSON.stringify(lease), 'utf8').toString('base64url')}`;
}

export function parseVercelRefreshLease(value: string | null | undefined): VercelRefreshLease | null {
  if (!value?.startsWith(REFRESH_LEASE_PREFIX)) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(value.slice(REFRESH_LEASE_PREFIX.length), 'base64url').toString('utf8'),
    ) as Partial<VercelRefreshLease>;
    if (
      typeof decoded.claimId !== 'string' ||
      !decoded.claimId ||
      typeof decoded.expiresAt !== 'number' ||
      !Number.isFinite(decoded.expiresAt) ||
      typeof decoded.refreshToken !== 'string' ||
      !decoded.refreshToken
    ) {
      return null;
    }
    return decoded as VercelRefreshLease;
  } catch {
    return null;
  }
}

const ALLOWED_CALLBACK_ORIGINS = [
  'https://xroga.com',
  'https://www.xroga.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

type StoredVercelAuth = {
  access_token: string;
  username: string;
  auth_kind?: VercelAuthKind;
  provider_user_id?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: string;
  updated_at: string;
};

export type VercelAuthKind =
  | 'sign_in_with_vercel'
  | 'personal_token'
  | 'integration_oauth';

function vercelStoragePath(userId: string): string {
  return `${userId}/vercel.json`;
}

async function ensureTokenBucket(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (!listErr && buckets?.some((b) => b.id === TOKEN_BUCKET || b.name === TOKEN_BUCKET)) {
    return true;
  }
  const { error: createErr } = await supabase.storage.createBucket(TOKEN_BUCKET, {
    public: false,
    fileSizeLimit: 8192,
  });
  if (!createErr) return true;
  if (/already exists|duplicate/i.test(createErr.message)) return true;
  console.warn('[vercelAuth] createBucket:', createErr.message);
  return false;
}

async function saveVercelTokenToStorage(userId: string, data: StoredVercelAuth): Promise<boolean> {
  try {
    if (!(await ensureTokenBucket())) return false;
    const supabase = getSupabaseAdmin();
    const body = JSON.stringify(data);
    const { error } = await supabase.storage.from(TOKEN_BUCKET).upload(vercelStoragePath(userId), body, {
      upsert: true,
      contentType: 'application/json',
    });
    if (error) {
      console.warn('[vercelAuth] storage upload:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[vercelAuth] storage save:', (err as Error).message);
    return false;
  }
}

async function getVercelTokenFromStorage(userId: string): Promise<StoredVercelAuth | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(TOKEN_BUCKET).download(vercelStoragePath(userId));
    if (error || !data) return null;
    const parsed = JSON.parse(await data.text()) as StoredVercelAuth;
    if (!parsed?.access_token?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function deleteVercelTokenFromStorage(userId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.storage.from(TOKEN_BUCKET).remove([vercelStoragePath(userId)]);
  } catch {
    /* ignore */
  }
}

export function vercelOAuthConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

function clientId(): string {
  return (process.env.VERCEL_CLIENT_ID ?? process.env.VERCEL_OAUTH_CLIENT_ID ?? '').trim();
}

function clientSecret(): string {
  return (process.env.VERCEL_CLIENT_SECRET ?? process.env.VERCEL_OAUTH_CLIENT_SECRET ?? '').trim();
}

function productionFrontendBase(): string {
  const raw = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  if (raw && !/\.vercel\.app$/i.test(raw)) return raw;
  return 'https://xroga.com';
}

function isAllowedCallbackUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      ALLOWED_CALLBACK_ORIGINS.includes(u.origin) &&
      u.pathname.replace(/\/$/, '') === CALLBACK_PATH
    );
  } catch {
    return false;
  }
}

/**
 * Must match the Vercel App → Redirect URI exactly, and be identical between
 * authorize + token exchange. Prefer an allowlisted requested URI (www vs apex,
 * localhost) so popup and full-page flows stay consistent.
 */
export function getVercelOAuthCallbackUrl(requested?: string): string {
  if (requested && isAllowedCallbackUrl(requested)) {
    return requested.replace(/\/$/, '');
  }

  const explicit = process.env.VERCEL_OAUTH_CALLBACK_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const base =
    process.env.NODE_ENV === 'production'
      ? productionFrontendBase()
      : (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  return `${base}${CALLBACK_PATH}`;
}

/**
 * OIDC scopes for Vercel Sign-in Apps only.
 * Valid: openid | email | profile | offline_access
 * API deploy permissions are NOT OAuth scopes — set them in the Vercel App console.
 * Malformed env (commas with junk, API permission names, quotes) causes:
 * "The request scope is invalid, unknown, or malformed."
 */
const VERCEL_OIDC_SCOPES = new Set(['openid', 'email', 'profile', 'offline_access']);

/** Sanitize env scopes. Returns '' to omit `scope` (Vercel then uses App-configured defaults). */
export function vercelOAuthScope(): string {
  const raw = (process.env.VERCEL_OAUTH_SCOPES ?? '').trim();
  // Empty → omit param so Vercel includes whatever is enabled on the App
  if (!raw) return '';

  const parts = raw
    .replace(/[",']/g, ' ')
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allowed = [...new Set(parts.filter((s) => VERCEL_OIDC_SCOPES.has(s)))];
  if (allowed.length === 0) {
    console.warn(
      '[vercelAuth] VERCEL_OAUTH_SCOPES had no valid OIDC scopes — omitting scope param. Valid: openid email profile offline_access',
    );
    return '';
  }
  return allowed.join(' ');
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function makeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export async function buildVercelAuthorizeUrl(
  userId: string,
  redirectUri: string,
): Promise<{ url: string; state: string } | null> {
  if (!vercelOAuthConfigured()) return null;
  const verifier = makeVerifier();
  const nonce = randomBytes(16).toString('base64url');
  const state = Buffer.from(
    JSON.stringify({ userId, t: Date.now(), n: randomBytes(8).toString('hex') }),
  ).toString('base64url');

  // DB when available; Storage fallback when user_integrations is missing
  await storePkceSession(userId, PKCE_PROVIDER, {
    verifier,
    state,
    redirect_uri: redirectUri,
    nonce,
    created_at: new Date().toISOString(),
  });

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });
  // Only send scope when sanitized + valid — omitting avoids invalid_scope from bad env
  const scope = vercelOAuthScope();
  if (scope) params.set('scope', scope);

  return { url: `https://vercel.com/oauth/authorize?${params.toString()}`, state };
}

export async function exchangeVercelOAuthCode(opts: {
  userId: string;
  code: string;
  state: string;
  redirectUri: string;
}): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  if (!vercelOAuthConfigured()) {
    throw new Error('Vercel OAuth not configured — set VERCEL_CLIENT_ID/SECRET');
  }

  const pkce = await loadPkceSession(opts.userId, PKCE_PROVIDER, opts.state);
  if (!pkce?.verifier) {
    throw new Error('Invalid or expired OAuth state — click Authorize Vercel again');
  }

  // Must be the exact redirect_uri used in the authorize request
  const redirectUri =
    (pkce.redirect_uri && isAllowedCallbackUrl(pkce.redirect_uri)
      ? pkce.redirect_uri
      : opts.redirectUri
    ).replace(/\/$/, '');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId(),
    client_secret: clientSecret(),
    code: opts.code,
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
  });

  const tokenRes = await fetch('https://api.vercel.com/login/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  await clearPkceSession(opts.userId, PKCE_PROVIDER);

  if (!tokenData.access_token) {
    throw new Error(
      tokenData.error_description ||
        tokenData.error ||
        `Vercel token exchange failed (${tokenRes.status})`,
    );
  }

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
  };
}

export function parseVercelOAuthState(state: string): { userId: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
      userId?: string;
      t?: number;
    };
    if (!parsed.userId) return null;
    // Reject states older than 30 minutes
    if (typeof parsed.t === 'number' && Date.now() - parsed.t > 30 * 60 * 1000) {
      return null;
    }
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

export async function getVercelToken(userId: string): Promise<string | null> {
  let row = await loadVercelConnection(userId);
  if (!row?.access_token?.trim()) return null;

  if (!isVercelAccessTokenExpiring(row.expires_at)) return row.access_token.trim();

  if (row.refresh_token) {
    try {
      const activeLease = parseVercelRefreshLease(row.refresh_token);
      if (activeLease && activeLease.expiresAt > Date.now()) {
        const winner = await waitForVercelRefreshWinner(userId, row.access_token);
        if (winner) return winner;
        row = (await loadVercelConnection(userId)) ?? row;
      }

      const observedRefreshToken = row.refresh_token;
      if (!observedRefreshToken) return null;
      const lease = parseVercelRefreshLease(observedRefreshToken);
      const refreshToken = lease?.refreshToken ?? observedRefreshToken;
      const refreshed = await refreshVercelOAuthTokenSingleFlight(
        userId,
        observedRefreshToken,
        refreshToken,
        row.username,
      );
      return refreshed;
    } catch (err) {
      console.warn('[vercelAuth] refresh failed:', (err as Error).message);

      // Another Fly machine may have won a simultaneous refresh and rotated
      // the token before this request reached Vercel. Re-read authoritative
      // storage and accept only a different, unexpired token.
      const latest = await loadVercelConnection(userId);
      if (
        latest?.access_token?.trim() &&
        latest.access_token.trim() !== row.access_token.trim() &&
        !isVercelAccessTokenExpiring(latest.expires_at)
      ) {
        return latest.access_token.trim();
      }
    }
  }

  // Never hand a known-expired token to deployment code. Doing so turns a
  // recoverable refresh problem into an API 401 and can incorrectly disconnect
  // a valid integration.
  return null;
}

export function isVercelAccessTokenExpiring(
  expiresAt: string | undefined,
  now = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) && parsed < now + TOKEN_REFRESH_SKEW_MS;
}

async function refreshVercelOAuthTokenSingleFlight(
  userId: string,
  observedRefreshToken: string,
  refreshToken: string,
  username?: string,
): Promise<string> {
  const existing = vercelRefreshInFlight.get(userId);
  if (existing) return existing;

  const pending = refreshVercelOAuthTokenWithLease(
    userId,
    observedRefreshToken,
    refreshToken,
    username,
  );
  vercelRefreshInFlight.set(userId, pending);
  try {
    return await pending;
  } finally {
    if (vercelRefreshInFlight.get(userId) === pending) {
      vercelRefreshInFlight.delete(userId);
    }
  }
}

async function waitForVercelRefreshWinner(
  userId: string,
  previousAccessToken: string,
): Promise<string | null> {
  const deadline = Date.now() + REFRESH_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const latest = await loadVercelConnection(userId);
    if (
      latest?.access_token?.trim() &&
      latest.access_token.trim() !== previousAccessToken.trim() &&
      !isVercelAccessTokenExpiring(latest.expires_at)
    ) {
      return latest.access_token.trim();
    }
    const lease = parseVercelRefreshLease(latest?.refresh_token);
    if (!lease || lease.expiresAt <= Date.now()) return null;
  }
  return null;
}

async function refreshVercelOAuthTokenWithLease(
  userId: string,
  observedRefreshToken: string,
  refreshToken: string,
  username?: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const marker = encodeVercelRefreshLease(refreshToken);
  const { data, error } = await supabase
    .from('user_integrations')
    .update({ refresh_token: marker })
    .eq('user_id', userId)
    .eq('provider', 'vercel')
    .eq('refresh_token', observedRefreshToken)
    .select('refresh_token');

  if (error && !isMissingTableError(error.message)) {
    throw new Error(`Could not claim Vercel refresh lease: ${error.message}`);
  }

  if (!error && (!data || data.length === 0)) {
    const previous = await loadVercelConnection(userId);
    const winner = await waitForVercelRefreshWinner(userId, previous?.access_token ?? '');
    if (winner) return winner;
    throw new Error('Another Vercel token refresh is still in progress');
  }

  // Storage-only legacy installations cannot make an atomic database claim. Keep
  // the existing in-process single flight there; production uses the DB lease.
  if (error && isMissingTableError(error.message)) {
    return refreshVercelOAuthToken(userId, refreshToken, username);
  }

  try {
    return await refreshVercelOAuthToken(userId, refreshToken, username);
  } catch (refreshError) {
    // Restore the original refresh token only when this exact lease still owns the
    // row. A later successful refresh must never be overwritten by cleanup.
    await supabase
      .from('user_integrations')
      .update({ refresh_token: refreshToken })
      .eq('user_id', userId)
      .eq('provider', 'vercel')
      .eq('refresh_token', marker);
    throw refreshError;
  }
}

async function loadVercelConnection(userId: string): Promise<{
  access_token: string;
  refresh_token?: string | null;
  username?: string;
  expires_at?: string;
  auth_kind?: VercelAuthKind;
} | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, metadata')
    .eq('user_id', userId)
    .eq('provider', 'vercel')
    .maybeSingle();

  if (!error && data?.access_token?.trim()) {
    const meta = (data.metadata ?? {}) as {
      username?: string;
      expires_at?: string;
      auth_kind?: VercelAuthKind;
    };
    return {
      access_token: data.access_token.trim(),
      refresh_token: data.refresh_token,
      username: meta.username,
      expires_at: meta.expires_at,
      auth_kind:
        meta.auth_kind ?? (data.refresh_token ? 'sign_in_with_vercel' : 'personal_token'),
    };
  }

  if (error && !isMissingTableError(error.message)) {
    console.warn('[vercelAuth] lookup:', error.message);
  }

  const stored = await getVercelTokenFromStorage(userId);
  if (!stored?.access_token?.trim()) return null;
  return {
    access_token: stored.access_token.trim(),
    refresh_token: stored.refresh_token,
    username: stored.username,
    expires_at: stored.expires_at,
    auth_kind:
      stored.auth_kind ?? (stored.refresh_token ? 'sign_in_with_vercel' : 'personal_token'),
  };
}

export async function refreshVercelOAuthToken(
  userId: string,
  refreshToken: string,
  username?: string,
): Promise<string> {
  if (!vercelOAuthConfigured()) {
    throw new Error('Vercel OAuth not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
  });
  const tokenRes = await fetch('https://api.vercel.com/login/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!tokenData.access_token) {
    throw new Error(
      tokenData.error_description || tokenData.error || `Vercel refresh failed (${tokenRes.status})`,
    );
  }
  await saveVercelConnection(userId, tokenData.access_token, {
    username: username || 'vercel-user',
    refreshToken: tokenData.refresh_token || refreshToken,
    expiresIn: tokenData.expires_in,
  });
  return tokenData.access_token;
}

export async function getVercelUsername(userId: string): Promise<string | null> {
  const row = await loadVercelConnection(userId);
  return row?.username?.trim() || null;
}

export async function probeVercelApiCapabilities(token: string): Promise<{
  canListProjects: boolean;
  canReadDeployments: boolean;
}> {
  const headers = { Authorization: `Bearer ${token}` };
  const [projects, deployments] = await Promise.allSettled([
    fetch('https://api.vercel.com/v9/projects?limit=1', { headers }),
    fetch('https://api.vercel.com/v6/deployments?limit=1', { headers }),
  ]);

  return {
    canListProjects: projects.status === 'fulfilled' && projects.value.ok,
    canReadDeployments: deployments.status === 'fulfilled' && deployments.value.ok,
  };
}

export function vercelCredentialCanDeploy(
  authKind: VercelAuthKind,
  capability: { canListProjects: boolean; canReadDeployments: boolean },
): boolean {
  // Sign in with Vercel is an identity grant. Its list endpoints can return 200
  // while deployment creation still returns 403. Only credentials issued for
  // API use may pass deploy readiness.
  return (
    authKind !== 'sign_in_with_vercel' &&
    capability.canListProjects &&
    capability.canReadDeployments
  );
}

export type VercelPersonalTokenVerification =
  | {
      ok: true;
      username: string;
      providerUserId?: string;
    }
  | {
      ok: false;
      reason: 'deploy_access_required';
      capability?: {
        canListProjects: boolean;
        canReadDeployments: boolean;
      };
    };

/**
 * Prove a pasted personal token reaches the two read-only APIs required by
 * the deployment flow before storing it. Vercel's current `vcp_` personal
 * tokens can authorize account resources even when the legacy /v2/user
 * identity endpoint rejects them, so identity enrichment is best-effort.
 */
export async function verifyVercelPersonalTokenForDeploy(
  token: string,
): Promise<VercelPersonalTokenVerification> {
  const capability = await probeVercelApiCapabilities(token);
  if (!vercelCredentialCanDeploy('personal_token', capability)) {
    return {
      ok: false,
      reason: 'deploy_access_required',
      capability,
    };
  }

  let username = 'vercel-account';
  let providerUserId: string | undefined;
  try {
    const userRes = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as { user?: { username?: string; id?: string } };
      username = user.user?.username ?? username;
      providerUserId = user.user?.id;
    }
  } catch {
    // Deploy capability is the acceptance gate; owner metadata is optional.
  }

  return {
    ok: true,
    username,
    providerUserId,
  };
}

export async function isVercelConnected(userId: string): Promise<boolean> {
  const token = await getVercelToken(userId);
  return Boolean(token);
}

/**
 * Verify stored Vercel token.
 * Sign-in-with-Vercel tokens may pass userinfo but fail /v2/user without Read User API permission.
 * Identity via userinfo is enough to stay "connected"; canDeploy is reported separately.
 */
export async function verifyVercelTokenLive(userId: string): Promise<{
  ok: boolean;
  username?: string;
  canDeploy?: boolean;
  error?: string;
}> {
  const token = await getVercelToken(userId);
  if (!token) return { ok: false, error: 'not_connected' };
  const connection = await loadVercelConnection(userId);
  const authKind =
    connection?.auth_kind ??
    (connection?.refresh_token ? 'sign_in_with_vercel' : 'personal_token');

  let canDeploy = false;
  try {
    const capability = await probeVercelApiCapabilities(token);
    canDeploy = vercelCredentialCanDeploy(authKind, capability);
  } catch {
    canDeploy = false;
  }

  let username: string | undefined;
  let identityOk = false;

  try {
    const infoRes = await fetch('https://api.vercel.com/login/oauth/userinfo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (infoRes.ok) {
      const info = (await infoRes.json()) as {
        preferred_username?: string;
        name?: string;
        email?: string;
      };
      username = info.preferred_username || info.name || undefined;
      identityOk = true;
    }
  } catch {
    /* try REST next */
  }

  if (!identityOk) {
    try {
      const res = await fetch('https://api.vercel.com/v2/user', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const u = (await res.json()) as { user?: { username?: string } };
        username = u.user?.username || username;
        identityOk = true;
      }
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  if (!identityOk) {
    // Modern personal (`vcp_`) and integration credentials can authorize the
    // project/deployment APIs without access to either identity endpoint.
    // For those credentials the capability proof is stronger and more relevant
    // than owner-profile lookup. Sign-in tokens still require identity proof.
    if (authKind !== 'sign_in_with_vercel' && canDeploy) {
      return {
        ok: true,
        username: connection?.username?.trim() || undefined,
        canDeploy: true,
      };
    }
    return { ok: false, canDeploy, error: 'vercel_token_invalid' };
  }

  return { ok: true, username, canDeploy };
}

export async function saveVercelConnection(
  userId: string,
  accessToken: string,
  meta: {
    username?: string;
    providerUserId?: string;
    refreshToken?: string;
    expiresIn?: number;
    authKind?: VercelAuthKind;
  },
): Promise<void> {
  const token = accessToken.trim();
  if (!token) throw new Error('Empty Vercel access token');

  const expiresAt =
    typeof meta.expiresIn === 'number' && meta.expiresIn > 0
      ? new Date(Date.now() + meta.expiresIn * 1000).toISOString()
      : undefined;

  const storagePayload: StoredVercelAuth = {
    access_token: token,
    username: meta.username ?? 'vercel-user',
    auth_kind:
      meta.authKind ?? (meta.refreshToken ? 'sign_in_with_vercel' : 'personal_token'),
    provider_user_id: meta.providerUserId,
    refresh_token: meta.refreshToken,
    expires_in: meta.expiresIn,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };

  if (githubSchemaAutoBootstrapEnabled()) {
    await ensureGithubSchema();
  }

  const supabase = getSupabaseAdmin();
  const row = {
    user_id: userId,
    provider: 'vercel',
    access_token: token,
    refresh_token: meta.refreshToken ?? null,
    provider_user_id: meta.providerUserId ?? null,
    metadata: {
      username: meta.username ?? 'vercel-user',
      auth_kind:
        meta.authKind ?? (meta.refreshToken ? 'sign_in_with_vercel' : 'personal_token'),
      expires_in: meta.expiresIn,
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    },
  };

  let { error } = await supabase.from('user_integrations').upsert(row, {
    onConflict: 'user_id,provider',
  });

  if (error && isMissingTableError(error.message)) {
    await ensureGithubSchema();
    await new Promise((r) => setTimeout(r, 400));
    ({ error } = await supabase.from('user_integrations').upsert(row, {
      onConflict: 'user_id,provider',
    }));
  }

  if (error && isMissingTableError(error.message)) {
    const ok = await saveVercelTokenToStorage(userId, storagePayload);
    if (!ok) {
      throw new Error(
        'Could not save Vercel token — user_integrations table missing and storage fallback failed. Apply migration 036 or set DATABASE_URL on the API.',
      );
    }
    console.warn('[vercelAuth] saved via storage fallback (user_integrations missing)');
    return;
  }

  if (error) {
    throw new Error(error.message);
  }

  void saveVercelTokenToStorage(userId, storagePayload).catch(() => {
    /* DB is primary; storage mirror is best-effort */
  });
}

export async function clearVercelConnection(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', 'vercel');
  await clearPkceSession(userId, PKCE_PROVIDER);
  await deleteVercelTokenFromStorage(userId);
}

/**
 * Pick a Vercel project to receive vault env (Supabase keys, etc.).
 * Prefer an explicit slug; otherwise the newest `xroga*` project, else newest project.
 */
export async function resolveVercelProjectForEnvSync(
  userId: string,
  preferred?: string | null,
): Promise<string | null> {
  if (preferred?.trim()) return preferred.trim();
  const token = await getVercelToken(userId);
  if (!token) return null;
  try {
    const res = await fetch('https://api.vercel.com/v9/projects?limit=20', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      projects?: Array<{ name?: string; updatedAt?: number }>;
    };
    const projects = data.projects ?? [];
    if (!projects.length) return null;
    const xroga = projects.filter((p) => /^xroga/i.test(String(p.name || '')));
    const pool = (xroga.length ? xroga : projects).slice();
    pool.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return pool[0]?.name?.trim() || null;
  } catch {
    return null;
  }
}
