/**
 * PKCE / OAuth store. The database is authoritative, including revocation.
 * Legacy mirrors are retained for cleanup, never used as token authority.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';
import { randomUUID } from 'node:crypto';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { openRuntimeCredential, requireLegacyCredentialMigrationWindow, sealRuntimeCredential } from './credentialVaultRuntime.js';

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
  const vaultRevision = randomUUID();
  const metadata = { ...(token.metadata ?? {}), vault_revision: vaultRevision, vault_format: 'oauth-v1' };
  const envelope = await sealRuntimeCredential(userId, {
    provider, account: provider, credentialType: 'oauth-token', recordId: provider,
    revision: vaultRevision, scope: 'oauth-connection',
  }, JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token ?? null }));
  const { data, error } = await getSupabaseAdmin().rpc('save_oauth_connection', {
    p_owner_id: userId, p_provider: provider, p_revision: revision,
    p_access_token: envelope, p_refresh_token: null,
    p_metadata: metadata, p_provider_user_id: providerUserId ?? null,
    p_expected_refresh_token: expectedRefreshToken ?? null,
  });
  if (error || data !== true) throw new Error('OAuth connection changed during authorization or refresh. Reconnect to continue.');
}

/** Personal-token path with its own preflight epoch. It cannot reuse the OAuth
 * callback receipt, but it keeps the same vault format and revoke-wins CAS. */
export async function saveDirectOAuthConnection(userId: string, provider: 'vercel', token: StoredProviderToken,
  providerUserId?: string): Promise<void> {
  assertStorageIdentity(userId, provider);
  const prepared = await getSupabaseAdmin().rpc('prepare_direct_oauth_write', { p_owner_id: userId, p_provider: provider });
  if (prepared.error || !validRevision(prepared.data)) throw new Error('OAuth connection could not be admitted. Retry shortly.');
  const vaultRevision = randomUUID();
  const metadata = { ...(token.metadata ?? {}), vault_revision: vaultRevision, vault_format: 'oauth-v1' };
  const envelope = await sealRuntimeCredential(userId, { provider, account: provider, credentialType: 'oauth-token',
    recordId: provider, revision: vaultRevision, scope: 'oauth-connection' },
  JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token ?? null }));
  const saved = await getSupabaseAdmin().rpc('save_direct_oauth_connection', {
    p_owner_id: userId, p_provider: provider, p_revision: prepared.data,
    p_access_token: envelope, p_metadata: metadata, p_provider_user_id: providerUserId ?? null,
  });
  if (saved.error || saved.data !== true) throw new Error('OAuth connection changed while saving. Reconnect to continue.');
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
  const vaultRevision = randomUUID();
  const verifier = await sealRuntimeCredential(userId, {
    provider, account: provider, credentialType: 'pkce-verifier', recordId: provider,
    revision: vaultRevision, scope: 'oauth-session',
  }, session.verifier);
  const { data, error } = await supabase.rpc('begin_oauth_session', {
    p_owner_id: userId, p_provider: provider,
    p_session: { ...session, verifier, vault_revision: vaultRevision, vault_format: 'pkce-v1' },
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
    || !validRevision(data.vault_revision) || data.vault_format !== 'pkce-v1'
    || (data.nonce != null && typeof data.nonce !== 'string')) return null;
  let verifier: string;
  try {
    verifier = await openRuntimeCredential(userId, {
      provider, account: provider, credentialType: 'pkce-verifier', recordId: provider,
      revision: data.vault_revision, scope: 'oauth-session',
    }, data.verifier);
  } catch { return null; }
  return { verifier, state: data.state, redirect_uri: data.redirect_uri,
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
    .select('user_id, provider, access_token, refresh_token, metadata, credential_revision, provider_user_id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  if (error && options.authoritativeOnly) throw new Error('OAuth authority unavailable');
  if (error || (data && (data.metadata?.revoked === true || !data.access_token?.trim()))) {
    if (data && options.authoritativeOnly) throw new Error('OAuth authority rejected the stored value');
    return null;
  }
  if (data?.access_token?.trim()) {
    if (data.access_token.startsWith('vault:v3:')) {
      const vaultRevision = data.metadata?.vault_revision;
      const refreshLease = provider === 'vercel' && typeof data.refresh_token === 'string'
        && data.refresh_token.startsWith('xroga-refresh-lease:') ? data.refresh_token : null;
      if (data.user_id !== userId || data.provider !== provider || typeof vaultRevision !== 'string'
        || data.metadata?.vault_format !== 'oauth-v1' || (data.refresh_token !== null && !refreshLease)) return null;
      let opened: { access_token?: unknown; refresh_token?: unknown };
      try {
        opened = JSON.parse(await openRuntimeCredential(userId, {
          provider, account: provider, credentialType: 'oauth-token', recordId: provider,
          revision: vaultRevision, scope: 'oauth-connection',
        }, data.access_token));
      } catch { return null; }
      if (!opened || typeof opened !== 'object' || Array.isArray(opened)) return null;
      const current = await supabase.from('user_integrations')
        .select('user_id,provider,access_token,refresh_token,metadata,credential_revision,provider_user_id')
        .eq('user_id', userId).eq('provider', provider).maybeSingle();
      // Lease-only changes coordinate readers while KMS waits. They cannot
      // replace the credential epoch or provider account checked below.
      const currentRefreshLease = provider === 'vercel' && typeof current.data?.refresh_token === 'string'
        && current.data.refresh_token.startsWith('xroga-refresh-lease:') ? current.data.refresh_token : null;
      if (current.error || !current.data || current.data.user_id !== userId || current.data.provider !== provider
        || current.data.access_token !== data.access_token
        || (provider === 'vercel' ? current.data.refresh_token !== null && !currentRefreshLease
          : current.data.refresh_token !== data.refresh_token)
        || current.data.credential_revision !== data.credential_revision
        || current.data.provider_user_id !== data.provider_user_id
        || current.data.metadata?.revoked === true || current.data.metadata?.vault_revision !== vaultRevision
        || typeof opened.access_token !== 'string' || !opened.access_token
        || (opened.refresh_token !== null && typeof opened.refresh_token !== 'string')) return null;
      return { access_token: opened.access_token,
        refresh_token: opened.refresh_token as string | null,
        metadata: { ...(data.metadata as Record<string, unknown>),
          ...(typeof data.provider_user_id === 'string' ? { provider_user_id: data.provider_user_id } : {}),
          ...(currentRefreshLease ? { refresh_lease_marker: currentRefreshLease } : {}) },
        credential_revision: data.credential_revision };
    }
    requireLegacyCredentialMigrationWindow();
    return {
      access_token: data.access_token.trim(),
      refresh_token: data.refresh_token,
      metadata: { ...((data.metadata as Record<string, unknown>) ?? {}),
        ...(typeof data.provider_user_id === 'string' ? { provider_user_id: data.provider_user_id } : {}) },
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
