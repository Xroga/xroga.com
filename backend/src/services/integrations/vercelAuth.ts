/**
 * Vercel "Sign in with Vercel" Apps OAuth (PKCE).
 * Client IDs look like cl_… — token endpoint is /login/oauth/token (not /v2/oauth/access_token).
 */

import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { ensureGithubSchema, githubSchemaAutoBootstrapEnabled } from '../../db/ensureGithubSchema.js';
import { isMissingTableError } from './githubTokenStore.js';

const PKCE_PROVIDER = 'vercel_oauth_pkce';
const CALLBACK_PATH = '/dashboard/integrations/vercel/callback';
const TOKEN_BUCKET = 'xroga-github-tokens';

const ALLOWED_CALLBACK_ORIGINS = [
  'https://xroga.com',
  'https://www.xroga.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

type StoredVercelAuth = {
  access_token: string;
  username: string;
  provider_user_id?: string;
  refresh_token?: string;
  expires_in?: number;
  updated_at: string;
};

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

  // Production DBs sometimes never applied migration 020 — bootstrap before PKCE upsert
  if (githubSchemaAutoBootstrapEnabled()) {
    await ensureGithubSchema();
  }

  const supabase = getSupabaseAdmin();
  let pkceErr = (
    await supabase.from('user_integrations').upsert(
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
    )
  ).error;

  // Schema cache / missing table — retry once after bootstrap + brief wait
  if (pkceErr && isMissingTableError(pkceErr.message)) {
    await ensureGithubSchema();
    await new Promise((r) => setTimeout(r, 400));
    pkceErr = (
      await supabase.from('user_integrations').upsert(
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
      )
    ).error;
  }

  if (pkceErr) {
    console.error('[vercelAuth] PKCE store failed:', pkceErr.message);
    const missing = isMissingTableError(pkceErr.message);
    throw new Error(
      missing
        ? 'Vercel authorize needs the user_integrations table in Supabase. Open Integrations and paste a Vercel personal token (vercel.com/account/tokens), or apply migration 020_user_integrations.sql / set DATABASE_URL so the API can auto-create the table.'
        : `Could not start Vercel authorize (session store failed): ${pkceErr.message}`,
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

  if (error && isMissingTableError(error.message)) {
    const stored = await getVercelTokenFromStorage(userId);
    return stored?.access_token?.trim() ?? null;
  }

  if (error && !isMissingTableError(error.message)) {
    console.warn('[vercelAuth] lookup:', error.message);
  }

  if (data?.access_token?.trim()) return data.access_token.trim();

  const stored = await getVercelTokenFromStorage(userId);
  return stored?.access_token?.trim() ?? null;
}

export async function getVercelUsername(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('metadata')
    .eq('user_id', userId)
    .eq('provider', 'vercel')
    .maybeSingle();

  if (error && isMissingTableError(error.message)) {
    const stored = await getVercelTokenFromStorage(userId);
    return stored?.username?.trim() || null;
  }

  const meta = data?.metadata as { username?: string } | null;
  if (meta?.username?.trim()) return meta.username.trim();
  const stored = await getVercelTokenFromStorage(userId);
  return stored?.username?.trim() || null;
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
  const token = accessToken.trim();
  if (!token) throw new Error('Empty Vercel access token');

  const storagePayload: StoredVercelAuth = {
    access_token: token,
    username: meta.username ?? 'vercel-user',
    provider_user_id: meta.providerUserId,
    refresh_token: meta.refreshToken,
    expires_in: meta.expiresIn,
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
      expires_in: meta.expiresIn,
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
  await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', PKCE_PROVIDER);
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
