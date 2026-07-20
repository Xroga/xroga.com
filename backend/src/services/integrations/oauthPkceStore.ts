/**
 * PKCE / OAuth session store with DB + Supabase Storage fallback.
 * Production often lacks public.user_integrations — OAuth must still complete.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';
import { ensureGithubSchema, githubSchemaAutoBootstrapEnabled } from '../../db/ensureGithubSchema.js';
import { isMissingTableError } from './githubTokenStore.js';

const BUCKET = 'xroga-github-tokens';

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

async function ensurePrivateBucket(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (!listErr && buckets?.some((b) => b.id === BUCKET || b.name === BUCKET)) {
    return true;
  }
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 16384,
  });
  if (!createErr) return true;
  if (/already exists|duplicate/i.test(createErr.message)) return true;
  console.warn('[oauthPkceStore] createBucket:', createErr.message);
  return false;
}

async function uploadJson(path: string, data: unknown): Promise<boolean> {
  try {
    if (!(await ensurePrivateBucket())) return false;
    const supabase = getSupabaseAdmin();
    const body = JSON.stringify(data);
    let { error } = await supabase.storage.from(BUCKET).upload(path, body, {
      upsert: true,
      contentType: 'application/json',
    });
    if (error && isBucketMissingError(error.message)) {
      await ensurePrivateBucket();
      ({ error } = await supabase.storage.from(BUCKET).upload(path, body, {
        upsert: true,
        contentType: 'application/json',
      }));
    }
    if (error) {
      console.warn('[oauthPkceStore] upload:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[oauthPkceStore] upload failed:', (err as Error).message);
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

async function removePath(path: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    /* ignore */
  }
}

/** Persist PKCE verifier for authorize → callback. Never blocks OAuth on missing table. */
export async function storePkceSession(
  userId: string,
  provider: string,
  session: PkceSession,
): Promise<void> {
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

  if (!error) {
    // Mirror to storage so callback still works if schema cache flakes
    void uploadJson(pkcePath(userId, provider), session);
    return;
  }

  if (isMissingTableError(error.message)) {
    const ok = await uploadJson(pkcePath(userId, provider), session);
    if (!ok) {
      throw new Error(
        `Could not store OAuth session for ${provider} — database table missing and storage fallback failed`,
      );
    }
    console.warn(`[oauthPkceStore] ${provider} PKCE saved via storage fallback`);
    return;
  }

  throw new Error(`Could not store OAuth session: ${error.message}`);
}

export async function loadPkceSession(
  userId: string,
  provider: string,
  expectedState: string,
): Promise<PkceSession | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, metadata')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (!error && data?.access_token) {
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
  }

  if (error && !isMissingTableError(error.message)) {
    console.warn('[oauthPkceStore] PKCE read:', error.message);
  }

  const stored = await downloadJson<PkceSession>(pkcePath(userId, provider));
  if (stored?.verifier && stored.state === expectedState) {
    return stored;
  }
  return null;
}

export async function clearPkceSession(userId: string, provider: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', provider);
  } catch {
    /* ignore */
  }
  await removePath(pkcePath(userId, provider));
}

/** Save OAuth access tokens when user_integrations is unavailable. */
export async function storeProviderToken(
  userId: string,
  provider: string,
  token: StoredProviderToken,
): Promise<void> {
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

  if (!error) {
    void uploadJson(tokenPath(userId, provider), {
      ...token,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  if (isMissingTableError(error.message)) {
    const ok = await uploadJson(tokenPath(userId, provider), {
      ...token,
      updated_at: new Date().toISOString(),
    });
    if (!ok) {
      throw new Error(
        `Could not save ${provider} token — database table missing and storage fallback failed`,
      );
    }
    console.warn(`[oauthPkceStore] ${provider} token saved via storage fallback`);
    return;
  }

  throw new Error(error.message);
}

export async function loadProviderToken(
  userId: string,
  provider: string,
): Promise<StoredProviderToken | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, metadata')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (!error && data?.access_token?.trim()) {
    return {
      access_token: data.access_token.trim(),
      refresh_token: data.refresh_token,
      metadata: (data.metadata as Record<string, unknown>) ?? {},
    };
  }

  if (error && !isMissingTableError(error.message)) {
    console.warn('[oauthPkceStore] token read:', error.message);
  }

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
  const supabase = getSupabaseAdmin();
  try {
    await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', provider);
  } catch {
    /* ignore */
  }
  await removePath(tokenPath(userId, provider));
}
