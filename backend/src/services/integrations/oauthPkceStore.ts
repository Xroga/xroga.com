/**
 * PKCE / OAuth store. The database is authoritative, including revocation.
 * Legacy mirrors are retained for cleanup, never used as token authority.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';
import { randomUUID } from 'node:crypto';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';

const BUCKET = 'xroga-github-tokens';
const sessionProviders = new Set(['supabase_oauth_pkce', 'vercel_oauth_pkce', 'cws_oauth_pkce', 'github_oauth_pkce']);

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
  authorization_revision?: string;
};

export type StoredProviderToken = {
  access_token: string;
  refresh_token?: string | null;
  metadata?: Record<string, unknown>;
  credential_revision?: string;
};

const epochProviders = new Set(['supabase_oauth', 'vercel']);
const isPolicyProvider = (provider: string) => /^xroga_plugin_permission_policy(?:__[a-z0-9_-]{1,90})?$/.test(provider);
function requireTokenProvider(provider: string): void {
  if (!epochProviders.has(provider) && !isPolicyProvider(provider)) throw new Error('Unsupported OAuth token or policy provider.');
}
const validRevision = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Conditional credential persistence, never an upsert or automatic retry. */
export async function saveOAuthConnection(userId: string, provider: string, token: StoredProviderToken,
  revision: string | undefined, expectedRefreshToken?: string, providerUserId?: string): Promise<void> {
  assertStorageIdentity(userId, provider);
  if (!epochProviders.has(provider) || !validRevision(revision)) throw new Error('OAuth authorization revision required. Reconnect to continue.');
  const { data, error } = await getSupabaseAdmin().rpc('save_oauth_connection', {
    p_owner_id: userId, p_provider: provider, p_revision: revision,
    p_access_token: token.access_token, p_refresh_token: token.refresh_token ?? null,
    p_metadata: token.metadata ?? {}, p_provider_user_id: providerUserId ?? null,
    p_expected_refresh_token: expectedRefreshToken ?? null,
  });
  if (error || data !== true) throw new Error('OAuth connection changed during authorization or refresh. Reconnect to continue.');
}

function pkcePath(userId: string, provider: string): string {
  return `${userId}/pkce-${provider}.json`;
}

function tokenPath(userId: string, provider: string): string {
  return `${userId}/oauth-${provider}.json`;
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
  context: TenantContext,
  provider: string,
  session: PkceSession,
): Promise<void> {
  const { userId } = requireTenantContext(context);
  assertStorageIdentity(userId, provider);
  if (!sessionProviders.has(provider)) throw new Error('Unsupported OAuth session provider.');
  const supabase = getTenantSupabaseAdmin(context);
  const { data, error } = await supabase.rpc('begin_oauth_session', {
    p_owner_id: userId, p_provider: provider, p_session: session,
  });
  if (error || data !== true) throw new Error('OAuth session could not be saved. Retry shortly.');
  // All production sessions are database-only. A mirror is never admission.
}

export async function clearPkceSession(context: TenantContext, provider: string): Promise<void> {
  const { userId } = requireTenantContext(context);
  assertStorageIdentity(userId, provider);
  if (!sessionProviders.has(provider)) throw new Error('Unsupported OAuth session provider.');
  const supabase = getTenantSupabaseAdmin(context);
  const { error } = await supabase.from('user_integrations').upsert({ user_id: userId, provider,
    access_token: '', refresh_token: null, metadata: { revoked: true } }, { onConflict: 'user_id,provider' });
  if (error) throw new Error('OAuth session revocation could not be recorded. Retry shortly.');
  if (!(await removePath(pkcePath(userId, provider)))) throw new Error('OAuth session revoked, but legacy cleanup is pending. Retry shortly.');
}

/** Atomic, expiring one-use admission. Never consult a legacy mirror here. */
export async function consumePkceSession(context: TenantContext, provider: string, expectedState: string): Promise<PkceSession | null> {
  const { userId } = requireTenantContext(context);
  assertStorageIdentity(userId, provider);
  if (!sessionProviders.has(provider)
    || typeof expectedState !== 'string' || expectedState.length < 16 || expectedState.length > 512) return null;
  const { data, error } = await getTenantSupabaseAdmin(context).rpc('consume_oauth_session', {
    p_owner_id: userId, p_provider: provider, p_state: expectedState,
  });
  if (error || !data || Array.isArray(data) || typeof data !== 'object'
    || data.state !== expectedState || typeof data.verifier !== 'string' || !data.verifier
    || typeof data.redirect_uri !== 'string' || !data.redirect_uri
    || typeof data.created_at !== 'string'
    || !validRevision(data.authorization_revision)
    || (data.nonce != null && typeof data.nonce !== 'string')) return null;
  return { verifier: data.verifier, state: data.state, redirect_uri: data.redirect_uri,
    created_at: data.created_at, ...(data.nonce == null ? {} : { nonce: data.nonce }),
    authorization_revision: data.authorization_revision };
}

/** Save OAuth access tokens only after authoritative database persistence. */
export async function storeProviderToken(
  userId: string,
  provider: string,
  token: StoredProviderToken,
  expectedRefreshToken?: string,
  revision?: string,
): Promise<void> {
  assertStorageIdentity(userId, provider);
  requireTokenProvider(provider);
  if (epochProviders.has(provider)) {
    await saveOAuthConnection(userId, provider, token, revision, expectedRefreshToken);
    return;
  }
  if (expectedRefreshToken !== undefined || revision !== undefined) throw new Error('Policy preferences do not support token refresh.');
  const toolkit = provider.startsWith('xroga_plugin_permission_policy__')
    ? provider.slice('xroga_plugin_permission_policy__'.length) : undefined;
  const row = {
    user_id: userId,
    provider,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? null,
    metadata: { ...token.metadata },
  };
  if (!['always_ask','read_only','low_risk','full_access'].includes(row.access_token)
    || row.refresh_token !== null || row.metadata.mode !== row.access_token
    || row.metadata.type !== 'plugin_permission_policy'
    || row.metadata.scope !== (toolkit ? 'toolkit' : 'global')
    || row.metadata.toolkit !== toolkit) throw new Error('Invalid plugin permission preference.');
  const { data, error } = await getSupabaseAdmin().from('user_integrations')
    .upsert(row, { onConflict: 'user_id,provider' })
    .select('user_id,provider,access_token,refresh_token,metadata').single();
  if (error || !data || data.user_id !== userId || data.provider !== provider
    || data.access_token !== row.access_token || data.refresh_token !== null
    || !data.metadata || Array.isArray(data.metadata)
    || data.metadata.mode !== row.metadata.mode || data.metadata.type !== row.metadata.type
    || data.metadata.scope !== row.metadata.scope || data.metadata.toolkit !== toolkit
    || data.metadata.updated_at !== row.metadata.updated_at) {
    throw new Error('OAuth connection could not be saved. Retry shortly.');
  }
}

export async function loadProviderToken(
  userId: string,
  provider: string,
  options: { authoritativeOnly?: boolean } = {},
): Promise<StoredProviderToken | null> {
  assertStorageIdentity(userId, provider);
  requireTokenProvider(provider);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, refresh_token, metadata, credential_revision')
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
      credential_revision: data.credential_revision,
    };
  }

  // Existing mirrors remain on disk, but are not authority for any live consumer.
  return null;
}

export async function clearProviderToken(userId: string, provider: string): Promise<void> {
  assertStorageIdentity(userId, provider);
  if (!epochProviders.has(provider)) throw new Error('Unsupported OAuth token provider.');
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('user_integrations').upsert({ user_id: userId, provider,
    access_token: '', refresh_token: null, credential_revision: randomUUID(), metadata: { revoked: true } }, { onConflict: 'user_id,provider' });
  if (error) throw new Error('OAuth connection revocation could not be recorded. Retry shortly.');
  if (!(await removePath(tokenPath(userId, provider)))) throw new Error('OAuth connection revoked, but legacy cleanup is pending. Retry shortly.');
}
