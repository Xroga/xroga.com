/**
 * Supabase Management API OAuth — user clicks Authorize, no paste.
 * Tokens grant project list, API keys, and SQL via /database/query.
 * Database authority is required for PKCE and token persistence.
 */

import { createHash, randomBytes } from 'crypto';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import {
  clearPkceSession,
  clearProviderToken,
  consumePkceSession,
  loadProviderToken,
  storePkceSession,
  storeProviderToken,
} from './oauthPkceStore.js';

const PROVIDER = 'supabase_oauth';
const PKCE_PROVIDER = 'supabase_oauth_pkce';
const AUTHORIZE = 'https://api.supabase.com/v1/oauth/authorize';
const TOKEN = 'https://api.supabase.com/v1/oauth/token';

export function supabaseOAuthConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

function clientId(): string {
  return (process.env.SUPABASE_OAUTH_CLIENT_ID || '').trim();
}

function clientSecret(): string {
  return (process.env.SUPABASE_OAUTH_CLIENT_SECRET || '').trim();
}

function frontendBase(): string {
  const raw = (process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  if (/\.vercel\.app$/i.test(raw)) return 'https://xroga.com';
  return raw;
}

export function getSupabaseOAuthCallbackUrl(requested?: string): string {
  const path = '/dashboard/integrations/supabase/callback';
  const allowed = [
    'https://xroga.com',
    'https://www.xroga.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  if (requested) {
    try {
      const u = new URL(requested);
      if (allowed.includes(u.origin) && u.pathname.replace(/\/$/, '') === path) {
        return requested.replace(/\/$/, '');
      }
    } catch {
      /* fall through */
    }
  }
  const explicit = process.env.SUPABASE_OAUTH_CALLBACK_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return `${frontendBase()}${path}`;
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')}`;
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function makeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export async function buildSupabaseAuthorizeUrl(
  context: TenantContext,
  redirectUri: string,
): Promise<{ url: string; state: string } | null> {
  const { userId } = requireTenantContext(context);
  if (!supabaseOAuthConfigured()) return null;
  const verifier = makeVerifier();
  const state = Buffer.from(
    JSON.stringify({ userId, t: Date.now(), n: randomBytes(8).toString('hex') }),
  ).toString('base64url');

  await storePkceSession(context, PKCE_PROVIDER, {
    verifier,
    state,
    redirect_uri: redirectUri,
    created_at: new Date().toISOString(),
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: redirectUri,
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });

  return { url: `${AUTHORIZE}?${params.toString()}`, state };
}

export interface SupabaseOAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export async function exchangeSupabaseOAuthCode(opts: {
  tenantContext: TenantContext;
  code: string;
  state: string;
  redirectUri: string;
}): Promise<SupabaseOAuthTokens> {
  const context = requireTenantContext(opts.tenantContext);
  const { userId } = context;
  if (!supabaseOAuthConfigured()) {
    throw new Error('Supabase OAuth not configured — set SUPABASE_OAUTH_CLIENT_ID/SECRET');
  }

  const pkce = await consumePkceSession(context, PKCE_PROVIDER, opts.state);
  if (!pkce?.verifier) {
    throw new Error('Invalid or expired OAuth state — try Connect Supabase again');
  }

  const redirectUri = (pkce.redirect_uri || opts.redirectUri).replace(/\/$/, '');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
  });

  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: basicAuthHeader(),
    },
    body,
  });

  const json = (await res.json().catch(() => ({}))) as SupabaseOAuthTokens & {
    error?: string;
    error_description?: string;
    message?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || json.message || `OAuth token exchange failed (${res.status})`,
    );
  }

  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;

  await storeProviderToken(userId, PROVIDER, {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? null,
    metadata: {
      connected_at: new Date().toISOString(),
      expires_at: expiresAt,
      token_type: json.token_type || 'bearer',
    },
  }, undefined, pkce.authorization_revision);

  return json;
}

export async function getSupabaseOAuthAccessToken(userId: string): Promise<string | null> {
  const data = await loadProviderToken(userId, PROVIDER);
  if (!data?.access_token) return null;

  const meta = (data.metadata ?? {}) as { expires_at?: string };
  const exp = meta.expires_at ? Date.parse(meta.expires_at) : 0;
  if (meta.expires_at && !Number.isFinite(exp)) return null;
  const needsRefresh = Boolean(meta.expires_at) && exp < Date.now() + 60_000;

  if (!needsRefresh) return data.access_token.trim();
  if (!data.refresh_token) return null;

  try {
    const refreshed = await refreshSupabaseOAuthToken(userId, data.refresh_token);
    return refreshed.access_token;
  } catch {
    console.warn('[supabaseAuth] refresh failed');
    return null;
  }
}

export async function refreshSupabaseOAuthToken(
  userId: string,
  refreshToken: string,
): Promise<SupabaseOAuthTokens> {
  // Capture the durable revision before external I/O. Reused refresh-token values
  // cannot let an older response replace a newer connection or refresh winner.
  const observed = await loadProviderToken(userId, PROVIDER, { authoritativeOnly: true });
  if (!observed?.credential_revision || observed.refresh_token !== refreshToken) {
    throw new Error('Supabase connection changed before refresh. Reconnect to continue.');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: basicAuthHeader(),
    },
    body,
  });

  const json = (await res.json().catch(() => ({}))) as SupabaseOAuthTokens & {
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error('Failed to refresh Supabase token');
  }

  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;

  await storeProviderToken(userId, PROVIDER, {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? refreshToken,
    metadata: {
      connected_at: new Date().toISOString(),
      expires_at: expiresAt,
      refreshed_at: new Date().toISOString(),
    },
  }, refreshToken, observed.credential_revision);

  return json;
}

export async function isSupabaseOAuthConnected(userId: string): Promise<boolean> {
  return Boolean(await getSupabaseOAuthAccessToken(userId));
}

export async function clearSupabaseOAuth(context: TenantContext): Promise<void> {
  const { userId } = requireTenantContext(context);
  const results = await Promise.allSettled([
    clearProviderToken(userId, PROVIDER), clearPkceSession(context, PKCE_PROVIDER),
  ]);
  if (results.some(result => result.status === 'rejected')) {
    throw new Error('Supabase OAuth disconnect is incomplete. Retry shortly.');
  }
}

export function parseOAuthState(state: string): { userId: string } | null {
  try {
    const raw = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
      userId?: string;
    };
    if (!raw.userId) return null;
    return { userId: raw.userId };
  } catch {
    return null;
  }
}
