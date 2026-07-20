/**
 * Vercel "Sign in with Vercel" Apps OAuth (PKCE).
 * Client IDs look like cl_… — token endpoint is /login/oauth/token (not /v2/oauth/access_token).
 */

import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { isMissingTableError } from './githubTokenStore.js';

const PKCE_PROVIDER = 'vercel_oauth_pkce';
const CALLBACK_PATH = '/dashboard/integrations/vercel/callback';

const ALLOWED_CALLBACK_ORIGINS = [
  'https://xroga.com',
  'https://www.xroga.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

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

/** OIDC scopes for Vercel Apps. API permissions are configured in the App console separately. */
export function vercelOAuthScope(): string {
  return (
    (process.env.VERCEL_OAUTH_SCOPES || 'openid email profile offline_access').trim() ||
    'openid email profile offline_access'
  );
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

  const supabase = getSupabaseAdmin();
  const { error: pkceErr } = await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider: PKCE_PROVIDER,
      access_token: verifier,
      metadata: {
        state,
        nonce,
        redirect_uri: redirectUri,
        created_at: new Date().toISOString(),
      },
    },
    { onConflict: 'user_id,provider' },
  );

  if (pkceErr) {
    console.error('[vercelAuth] PKCE store failed:', pkceErr.message);
    throw new Error(
      `Could not start Vercel authorize (session store failed): ${pkceErr.message}. Check Supabase service role + user_integrations table.`,
    );
  }

  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: vercelOAuthScope(),
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: 'S256',
  });

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

  const supabase = getSupabaseAdmin();
  const { data: pkce, error: pkceReadErr } = await supabase
    .from('user_integrations')
    .select('access_token, metadata')
    .eq('user_id', opts.userId)
    .eq('provider', PKCE_PROVIDER)
    .maybeSingle();

  if (pkceReadErr && !isMissingTableError(pkceReadErr.message)) {
    console.warn('[vercelAuth] PKCE read:', pkceReadErr.message);
  }

  const meta = (pkce?.metadata ?? {}) as { state?: string; redirect_uri?: string };
  if (!pkce?.access_token || meta.state !== opts.state) {
    throw new Error('Invalid or expired OAuth state — click Authorize Vercel again');
  }

  // Must be the exact redirect_uri used in the authorize request
  const redirectUri =
    (meta.redirect_uri && isAllowedCallbackUrl(meta.redirect_uri)
      ? meta.redirect_uri
      : opts.redirectUri
    ).replace(/\/$/, '');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId(),
    client_secret: clientSecret(),
    code: opts.code,
    redirect_uri: redirectUri,
    code_verifier: pkce.access_token,
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

  await supabase.from('user_integrations').delete().eq('user_id', opts.userId).eq('provider', PKCE_PROVIDER);

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
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'vercel')
    .maybeSingle();

  if (error && !isMissingTableError(error.message)) {
    console.warn('[vercelAuth] lookup:', error.message);
  }

  return data?.access_token?.trim() ?? null;
}

export async function getVercelUsername(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_integrations')
    .select('metadata')
    .eq('user_id', userId)
    .eq('provider', 'vercel')
    .maybeSingle();
  const meta = data?.metadata as { username?: string } | null;
  return meta?.username?.trim() ?? null;
}

export async function isVercelConnected(userId: string): Promise<boolean> {
  const token = await getVercelToken(userId);
  return Boolean(token);
}

/** Verify the stored token still talks to Vercel (catches revoked tokens). */
export async function verifyVercelTokenLive(userId: string): Promise<{
  ok: boolean;
  username?: string;
  error?: string;
}> {
  const token = await getVercelToken(userId);
  if (!token) return { ok: false, error: 'not_connected' };
  try {
    const res = await fetch('https://api.vercel.com/v2/user', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ok: false, error: `vercel_api_${res.status}` };
    }
    const u = (await res.json()) as { user?: { username?: string } };
    return { ok: true, username: u.user?.username };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveVercelConnection(
  userId: string,
  accessToken: string,
  meta: {
    username?: string;
    providerUserId?: string;
    refreshToken?: string;
    expiresIn?: number;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const row = {
    user_id: userId,
    provider: 'vercel',
    access_token: accessToken,
    refresh_token: meta.refreshToken ?? null,
    provider_user_id: meta.providerUserId ?? null,
    metadata: {
      username: meta.username ?? 'vercel-user',
      expires_in: meta.expiresIn,
      connected_at: new Date().toISOString(),
    },
  };

  const { error } = await supabase.from('user_integrations').upsert(row, {
    onConflict: 'user_id,provider',
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function clearVercelConnection(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', 'vercel');
  await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', PKCE_PROVIDER);
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
