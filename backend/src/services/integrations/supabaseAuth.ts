/**
 * Supabase Management API OAuth — user clicks Authorize, no paste.
 * Tokens grant project list, API keys, and SQL via /database/query.
 */

import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';

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
  const explicit = process.env.SUPABASE_OAUTH_CALLBACK_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const path = '/dashboard/integrations/supabase/callback';
  if (requested?.includes(path)) return requested.replace(/\/$/, '');
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
  userId: string,
  redirectUri: string,
): Promise<{ url: string; state: string } | null> {
  if (!supabaseOAuthConfigured()) return null;
  const verifier = makeVerifier();
  const state = Buffer.from(
    JSON.stringify({ userId, t: Date.now(), n: randomBytes(8).toString('hex') }),
  ).toString('base64url');

  const supabase = getSupabaseAdmin();
  await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider: PKCE_PROVIDER,
      access_token: verifier,
      metadata: { state, created_at: new Date().toISOString() },
    },
    { onConflict: 'user_id,provider' },
  );

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
  userId: string;
  code: string;
  state: string;
  redirectUri: string;
}): Promise<SupabaseOAuthTokens> {
  if (!supabaseOAuthConfigured()) {
    throw new Error('Supabase OAuth not configured — set SUPABASE_OAUTH_CLIENT_ID/SECRET');
  }

  const supabase = getSupabaseAdmin();
  const { data: pkce } = await supabase
    .from('user_integrations')
    .select('access_token, metadata')
    .eq('user_id', opts.userId)
    .eq('provider', PKCE_PROVIDER)
    .maybeSingle();

  const meta = (pkce?.metadata ?? {}) as { state?: string };
  if (!pkce?.access_token || meta.state !== opts.state) {
    throw new Error('Invalid or expired OAuth state — try Connect Supabase again');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: pkce.access_token,
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

  await supabase.from('user_integrations').upsert(
    {
      user_id: opts.userId,
      provider: PROVIDER,
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? null,
      metadata: {
        connected_at: new Date().toISOString(),
        expires_at: expiresAt,
        token_type: json.token_type || 'bearer',
      },
    },
    { onConflict: 'user_id,provider' },
  );

  await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', opts.userId)
    .eq('provider', PKCE_PROVIDER);

  return json;
}

export async function getSupabaseOAuthAccessToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, metadata')
    .eq('user_id', userId)
    .eq('provider', PROVIDER)
    .maybeSingle();

  if (!data?.access_token) return null;

  const meta = (data.metadata ?? {}) as { expires_at?: string };
  const exp = meta.expires_at ? Date.parse(meta.expires_at) : 0;
  const needsRefresh = exp > 0 && exp < Date.now() + 60_000;

  if (!needsRefresh) return data.access_token.trim();
  if (!data.refresh_token) return data.access_token.trim();

  try {
    const refreshed = await refreshSupabaseOAuthToken(userId, data.refresh_token);
    return refreshed.access_token;
  } catch (err) {
    console.warn('[supabaseAuth] refresh failed:', (err as Error).message);
    return data.access_token.trim();
  }
}

export async function refreshSupabaseOAuthToken(
  userId: string,
  refreshToken: string,
): Promise<SupabaseOAuthTokens> {
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
    throw new Error(json.error_description || json.error || 'Failed to refresh Supabase token');
  }

  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;

  const supabase = getSupabaseAdmin();
  await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider: PROVIDER,
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? refreshToken,
      metadata: {
        connected_at: new Date().toISOString(),
        expires_at: expiresAt,
        refreshed_at: new Date().toISOString(),
      },
    },
    { onConflict: 'user_id,provider' },
  );

  return json;
}

export async function isSupabaseOAuthConnected(userId: string): Promise<boolean> {
  return Boolean(await getSupabaseOAuthAccessToken(userId));
}

export async function clearSupabaseOAuth(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', PROVIDER);
  await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', PKCE_PROVIDER);
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
