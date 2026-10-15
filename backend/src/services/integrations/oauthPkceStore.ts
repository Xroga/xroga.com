/**
 * PKCE / OAuth store. The database is authoritative, including revocation.
 * Legacy mirrors are readable only after a successful empty authority lookup.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';
import { ensureGithubSchema, githubSchemaAutoBootstrapEnabled } from '../../db/ensureGithubSchema.js';
import { ensurePrivateOAuthBucket } from './credentialStorageBucket.js';

const BUCKET = 'xroga-github-tokens';

function assertStorageIdentity(userId: string, provider: string): void {
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(userId) || !/^[a-zA-Z0-9_-]{1,180}$/.test(provider)) {
    throw new Error('Invalid OAuth storage identity');
  }
}

export type PkceSession = {
  verifier: string;
  state: string;
  redirect_uri: string;
  nonce?: string;
  created_at: string;
};

export type StoredProviderToken = {
  access_token: string;
  refresh_token?: string | null;
  metadata?: Record<string, unknown>;
};

function pkcePath(userId: string, provider: string): string {
  return `${userId}/pkce-${provider}.json`;
}

function tokenPath(userId: string, provider: string): string {
  return `${userId}/oauth-${provider}.json`;
}

function isBucketMissingError(message: string): boolean {
  return /bucket not found|not found|does not exist/i.test(message);
}

async function uploadJson(path: string, data: unknown): Promise<boolean> {
  try {
    if (!(await ensurePrivateOAuthBucket())) return false;
    const supabase = getSupabaseAdmin();
    const body = JSON.stringify(data);
    let { error } = await supabase.storage.from(BUCKET).upload(path, body, {
      upsert: true,
      contentType: 'application/json',
    });
    if (error && isBucketMissingError(error.message)) {
      if (!(await ensurePrivateOAuthBucket())) return false;
      ({ error } = await supabase.storage.from(BUCKET).upload(path, body, {
        upsert: true,
        contentType: 'application/json',
      }));
    }
    if (error) {
      console.warn('[oauthPkceStore] upload failed');
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[oauthPkceStore] upload failed');
    return false;
  }
}

async function downloadJson<T>(path: string): Promise<T | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

async function removePath(path: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
}

/** Persist PKCE verifier only with authoritative database success. */
export async function storePkceSession(
  userId: string,
  provider: string,
  session: PkceSession,
): Promise<void> {
  assertStorageIdentity(userId, provider);
  if (githubSchemaAutoBootstrapEnabled()) {
    await ensureGithubSchema();
  }

  const supabase = getSupabaseAdmin();
  const row = {
    user_id: userId,
    provider,
    access_token: session.verifier,
    metadata: {
      state: session.state,
      redirect_uri: session.redirect_uri,
      nonce: session.nonce,
      created_at: session.created_at,
    },
  };

  const { error } = await supabase.from('user_integrations').upsert(row, {
    onConflict: 'user_id,provider',
  });

  if (error) throw new Error('OAuth session could not be saved. Retry shortly.');
  await uploadJson(pkcePath(userId, provider), session);
}

export async function loadPkceSession(
  userId: string,
  provider: string,
  expectedState: string,
): Promise<PkceSession | null> {
  assertStorageIdentity(userId, provider);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, metadata')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  // A failed authority read or an existing rejected session must never be
  // replaced by an older mirror, even if that mirror matches the old state.
  if (error) return null;
  if (data) {
    if (!data.access_token || data.metadata?.revoked === true) return null;
    const meta = (data.metadata ?? {}) as {
      state?: string;
      redirect_uri?: string;
      nonce?: string;
      created_at?: string;
    };
    if (meta.state === expectedState) {
      return {
        verifier: data.access_token,
        state: meta.state,
        redirect_uri: meta.redirect_uri || '',
        nonce: meta.nonce,
        created_at: meta.created_at || new Date().toISOString(),
      };
    }
    return null;
  }

  const stored = await downloadJson<PkceSession>(pkcePath(userId, provider));
  if (stored?.verifier && stored.state === expectedState) {
    return stored;
  }
  return null;
}

export async function clearPkceSession(userId: string, provider: string): Promise<void> {
  assertStorageIdentity(userId, provider);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('user_integrations').upsert({ user_id: userId, provider,
    access_token: '', refresh_token: null, metadata: { revoked: true } }, { onConflict: 'user_id,provider' });
  if (error) throw new Error('OAuth session revocation could not be recorded. Retry shortly.');
  if (!(await removePath(pkcePath(userId, provider)))) throw new Error('OAuth session revoked, but legacy cleanup is pending. Retry shortly.');
}

/** Atomic, expiring one-use admission. Never consult a legacy mirror here. */
export async function consumePkceSession(userId: string, provider: string, expectedState: string): Promise<PkceSession | null> {
  assertStorageIdentity(userId, provider);
  if (!['vercel_oauth_pkce', 'supabase_oauth_pkce', 'cws_oauth_pkce'].includes(provider)
    || typeof expectedState !== 'string' || expectedState.length < 16 || expectedState.length > 512) return null;
  const { data, error } = await getSupabaseAdmin().rpc('consume_oauth_session', {
    p_owner_id: userId, p_provider: provider, p_state: expectedState,
  });
  if (error || !data || Array.isArray(data) || typeof data !== 'object'
    || data.state !== expectedState || typeof data.verifier !== 'string' || !data.verifier
    || typeof data.redirect_uri !== 'string' || !data.redirect_uri
    || typeof data.created_at !== 'string'
    || (data.nonce != null && typeof data.nonce !== 'string')) return null;
  return { verifier: data.verifier, state: data.state, redirect_uri: data.redirect_uri,
    created_at: data.created_at, ...(data.nonce == null ? {} : { nonce: data.nonce }) };
}

/** Save OAuth access tokens only after authoritative database persistence. */
export async function storeProviderToken(
  userId: string,
  provider: string,
  token: StoredProviderToken,
  expectedRefreshToken?: string,
): Promise<void> {
  assertStorageIdentity(userId, provider);
  if (githubSchemaAutoBootstrapEnabled()) {
    await ensureGithubSchema();
  }

  const supabase = getSupabaseAdmin();
  const row = {
    user_id: userId,
    provider,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    metadata: token.metadata ?? {},
  };

  if (expectedRefreshToken !== undefined) {
    // A refresh can replace only the credential it observed. A disconnect or
    // reconnect changes that predicate and must never be undone by a late reply.
    const { data, error } = await supabase.from('user_integrations').update(row)
      .eq('user_id', userId).eq('provider', provider).eq('refresh_token', expectedRefreshToken)
      .select('user_id').maybeSingle();
    if (error || !data) throw new Error('OAuth connection changed during refresh. Reconnect to continue.');
  } else {
    const { error } = await supabase.from('user_integrations').upsert(row, {
      onConflict: 'user_id,provider',
    });
    if (error) throw new Error('OAuth connection could not be saved. Retry shortly.');
  }
  await uploadJson(tokenPath(userId, provider), { ...token, updated_at: new Date().toISOString() });
}

export async function loadProviderToken(
  userId: string,
  provider: string,
  options: { authoritativeOnly?: boolean } = {},
): Promise<StoredProviderToken | null> {
  assertStorageIdentity(userId, provider);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, metadata')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error && options.authoritativeOnly) throw new Error('OAuth authority unavailable');
  if (error || (data && (data.metadata?.revoked === true || !data.access_token?.trim()))) {
    if (data && options.authoritativeOnly) throw new Error('OAuth authority rejected the stored value');
    return null;
  }
  if (data?.access_token?.trim()) {
    return {
      access_token: data.access_token.trim(),
      refresh_token: data.refresh_token,
      metadata: (data.metadata as Record<string, unknown>) ?? {},
    };
  }

  if (options.authoritativeOnly) return null;
  const stored = await downloadJson<StoredProviderToken & { updated_at?: string }>(
    tokenPath(userId, provider),
  );
  if (!stored?.access_token?.trim()) return null;
  return {
    access_token: stored.access_token.trim(),
    refresh_token: stored.refresh_token,
    metadata: stored.metadata ?? {},
  };
}

export async function clearProviderToken(userId: string, provider: string): Promise<void> {
  assertStorageIdentity(userId, provider);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('user_integrations').upsert({ user_id: userId, provider,
    access_token: '', refresh_token: null, metadata: { revoked: true } }, { onConflict: 'user_id,provider' });
  if (error) throw new Error('OAuth connection revocation could not be recorded. Retry shortly.');
  if (!(await removePath(tokenPath(userId, provider)))) throw new Error('OAuth connection revoked, but legacy cleanup is pending. Retry shortly.');
}
