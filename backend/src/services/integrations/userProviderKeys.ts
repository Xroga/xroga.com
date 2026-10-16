/**
 * User BYOK / product API keys — AES-256-GCM in user_integrations.
 * Secrets never go into GitHub; synced to the user's Vercel project env on deploy.
 * The database is authoritative for revocation. Legacy private Storage reads
 * require a successful database lookup, never an unavailable authority store.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { isMissingTableError } from './githubTokenStore.js';
import { ensurePrivateOAuthBucket } from './credentialStorageBucket.js';
import { projectRefFromUrl } from './supabaseProjectUrl.js';

const PROVIDER_PREFIX = 'apikey_';
const KEY_BUCKET = 'xroga-github-tokens';

function keyStoragePath(userId: string, providerRow: string): string {
  return `${userId}/vault-${providerRow}.json`;
}

async function saveKeyToStorage(
  userId: string,
  providerRow: string,
  payload: { access_token: string; metadata: Record<string, unknown> },
): Promise<boolean> {
  try {
    if (!(await ensurePrivateOAuthBucket())) return false;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(KEY_BUCKET)
      .upload(keyStoragePath(userId, providerRow), JSON.stringify(payload), {
        upsert: true,
        contentType: 'application/json',
      });
    if (error) {
      console.warn('[userProviderKeys] storage upload:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[userProviderKeys] storage save:', (err as Error).message);
    return false;
  }
}

async function loadKeyFromStorage(
  userId: string,
  providerRow: string,
): Promise<{ access_token: string; metadata: Record<string, unknown> } | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(KEY_BUCKET)
      .download(keyStoragePath(userId, providerRow));
    if (error || !data) return null;
    const parsed = JSON.parse(await data.text()) as {
      access_token?: string;
      metadata?: Record<string, unknown>;
    };
    if (typeof parsed?.access_token !== 'string' || !parsed.access_token) return null;
    // A revocation or rotation may commit while the legacy download is pending.
    // Re-read authority after the bytes arrive, not only before the fallback.
    const { data: current, error: authorityError } = await supabase.from('user_integrations')
      .select('access_token, metadata').eq('user_id', userId).eq('provider', providerRow).maybeSingle();
    if (authorityError) return null;
    if (current) {
      if (current.metadata?.revoked === true || typeof current.access_token !== 'string' || !current.access_token) return null;
      return { access_token: current.access_token, metadata: current.metadata ?? {} };
    }
    return { access_token: parsed.access_token, metadata: parsed.metadata ?? {} };
  } catch {
    return null;
  }
}

async function listKeysFromStorage(userId: string): Promise<
  Array<{ provider: string; metadata: Record<string, unknown>; updated_at?: string }>
> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(KEY_BUCKET).list(userId, { limit: 100 });
    if (error || !data?.length) return [];
    const out: Array<{ provider: string; metadata: Record<string, unknown>; updated_at?: string }> =
      [];
    for (const file of data) {
      if (!file.name?.startsWith('vault-apikey_') || !file.name.endsWith('.json')) continue;
      const providerRow = file.name.replace(/^vault-/, '').replace(/\.json$/, '');
      const loaded = await loadKeyFromStorage(userId, providerRow);
      if (!loaded) continue;
      out.push({
        provider: providerRow,
        metadata: loaded.metadata,
        updated_at: typeof loaded.metadata.connected_at === 'string' ? loaded.metadata.connected_at : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Providers users can paste for their own live products (not Xroga platform keys). */
export const ALLOWED_PROVIDERS = [
  'openai',
  'anthropic',
  'groq',
  'gemini',
  'openrouter',
  'deepseek',
  'grok',
  'huggingface',
  'replicate',
  'stripe',
  /** User Lemon Squeezy for subscriptions in THEIR generated apps */
  'lemon_squeezy',
  'lemon_squeezy_store',
  'lemon_squeezy_webhook',
  'lemon_squeezy_variant',
  /** User's Supabase project — data/auth/storage live on THEIR account */
  'supabase_url',
  'supabase',
  'supabase_anon',
  /** Management API personal access token — used to auto-provision; never sync to Vercel */
  'supabase_pat',
  /** Database password — optional fallback for SQL provision; never sync to Vercel */
  'supabase_db_password',
  'resend',
  /** User-owned mobile publish (EAS / stores) — Xroga never pays Apple/Google fees */
  'expo',
  'expo_project_id',
  'apple_asc',
  /** App Store Connect API key JSON: keyId, issuerId, keyP8 */
  'apple_asc_api',
  'google_play',
  /** Chrome Web Store OAuth JSON: clientId, clientSecret, refreshToken, extensionId, publisherId */
  'cws_oauth',
  /** Electron code-signing: base64 p12 / CSC_LINK value */
  'electron_csc_link',
  'electron_csc_password',
  /** Electron macOS notarization (GitHub Actions secrets) */
  'electron_apple_id',
  'electron_apple_password',
  'electron_apple_team_id',
  'custom',
] as const;

export type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number];

export const ENV_VAR_BY_PROVIDER: Record<string, string> = {
  grok: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY',
  huggingface: 'HF_TOKEN',
  openrouter: 'OPENROUTER_API_KEY',
  replicate: 'REPLICATE_API_TOKEN',
  stripe: 'STRIPE_SECRET_KEY',
  lemon_squeezy: 'LEMONSQUEEZY_API_KEY',
  lemon_squeezy_store: 'LEMONSQUEEZY_STORE_ID',
  lemon_squeezy_webhook: 'LEMONSQUEEZY_WEBHOOK_SECRET',
  lemon_squeezy_variant: 'LEMONSQUEEZY_VARIANT_ID',
  supabase_url: 'NEXT_PUBLIC_SUPABASE_URL',
  supabase: 'SUPABASE_SERVICE_ROLE_KEY',
  supabase_anon: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  supabase_pat: 'SUPABASE_ACCESS_TOKEN',
  supabase_db_password: 'SUPABASE_DB_PASSWORD',
  resend: 'RESEND_API_KEY',
  expo: 'EXPO_TOKEN',
  expo_project_id: 'EXPO_EAS_PROJECT_ID',
  apple_asc: 'EXPO_APPLE_APP_SPECIFIC_PASSWORD',
  apple_asc_api: 'EXPO_APPLE_ASC_API_JSON',
  google_play: 'GOOGLE_SERVICE_ACCOUNT_JSON',
  cws_oauth: 'CHROME_WEBSTORE_OAUTH_JSON',
  electron_csc_link: 'CSC_LINK',
  electron_csc_password: 'CSC_KEY_PASSWORD',
  electron_apple_id: 'APPLE_ID',
  electron_apple_password: 'APPLE_APP_SPECIFIC_PASSWORD',
  electron_apple_team_id: 'APPLE_TEAM_ID',
  custom: 'CUSTOM_API_KEY',
};

/** These are for EAS/store submit — never sync into Vercel web project env. */
export const PUBLISH_ONLY_PROVIDERS = new Set([
  'expo',
  'expo_project_id',
  'apple_asc',
  'apple_asc_api',
  'google_play',
  'cws_oauth',
  'electron_csc_link',
  'electron_csc_password',
  'electron_apple_id',
  'electron_apple_password',
  'electron_apple_team_id',
]);

/** Server-only provision credentials — never sync to Vercel (or expose to browser). */
export const SUPABASE_SERVER_ONLY_PROVIDERS = new Set(['supabase_pat', 'supabase_db_password']);

const ALLOWED_SET = new Set<string>(ALLOWED_PROVIDERS);

function normalizeProvider(provider: string): string {
  const p = provider.trim().toLowerCase().replace(/^apikey_/, '');
  if (p === 'xai') return 'grok';
  return p;
}

/** Only admitted providers or custom rows produced by sanitizeEnvVarName.
 * Reject before query/path construction; a caller's string is not a scope.
 */
function credentialProviderSelection(provider: string): string {
  if (typeof provider !== 'string') throw new Error('Unsupported credential provider.');
  const p = normalizeProvider(provider);
  if (!ALLOWED_SET.has(p) && !/^custom_[a-z_][a-z0-9_]{1,63}$/.test(p)) {
    throw new Error('Unsupported credential provider.');
  }
  return p;
}

function encryptionKey(): Buffer {
  const secret =
    process.env.USER_SECRETS_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_JWT_SECRET ||
    '';
  if (!secret.trim()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'USER_SECRETS_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) required in production to encrypt user vault secrets',
      );
    }
    console.warn(
      '[userProviderKeys] using insecure dev encryption fallback — set USER_SECRETS_ENCRYPTION_KEY',
    );
    return scryptSync('xroga-dev-key', 'xroga-provider-keys-v2', 32);
  }
  return scryptSync(secret.slice(0, 64), 'xroga-provider-keys-v2', 32);
}

function encryptApiKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptApiKey(stored: string): string | null {
  if (typeof stored !== 'string' || !stored.length || stored.length > 70000) return null;
  const decode = (value: string): Buffer | null => {
    if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    const bytes = Buffer.from(value, 'base64');
    return bytes.toString('base64') === value ? bytes : null;
  };
  const utf8 = (bytes: Buffer): string | null => {
    const text = bytes.toString('utf8');
    return Buffer.from(text, 'utf8').equals(bytes) ? text : null;
  };
  if (!stored.startsWith('v1:')) {
    // Keep known legacy enc:/bare-base64 records, never interpret unknown
    // versioned envelopes or malformed bytes as credentials.
    const bytes = decode(stored.startsWith('enc:') ? stored.slice(4) : stored);
    const raw = bytes && utf8(bytes);
    if (!raw) return null;
    const idx = raw.indexOf(':');
    return (idx >= 0 ? raw.slice(idx + 1) : raw) || null;
  }
  const parts = stored.split(':');
  if (parts.length !== 4) return null;
  try {
    const iv = decode(parts[1]!), tag = decode(parts[2]!), data = decode(parts[3]!);
    if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !data) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return utf8(Buffer.concat([decipher.update(data), decipher.final()]));
  } catch {
    return null;
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function sanitizeEnvVarName(name: string): string {
  const raw = name.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) || raw.length < 2 || raw.length > 64) {
    throw new Error('Invalid env var name — use UPPER_SNAKE_CASE');
  }
  return raw.toUpperCase();
}

export interface UserProviderKeyStatus {
  provider: string;
  connected: boolean;
  masked?: string;
  envVar?: string;
  connectedAt?: string;
}

export interface SaveKeyOptions {
  /** Required when provider is `custom`; optional override for others. */
  envVarName?: string;
  /** Server-issued before upstream async work, never accepted from request JSON. */
  writeAdmission?: ProviderKeyWriteAdmission;
}

export interface ProviderKeyWriteAdmission {
  readonly userId: string;
  readonly providerRow: string;
  readonly envVar: string;
}
const issuedWriteAdmissions = new WeakMap<ProviderKeyWriteAdmission, { revision: string; oauthReceipt: boolean }>();

/** Carry the existing database CAS admission across this process's async work. */
export async function prepareUserProviderKeyWrite(
  userId: string,
  provider: string,
  opts?: { envVarName?: string; cwsAuthorizationRevision?: string },
): Promise<ProviderKeyWriteAdmission> {
  const p = normalizeProvider(provider);
  if (!ALLOWED_SET.has(p)) throw new Error('Unsupported credential provider.');
  if (p === 'custom' && !opts?.envVarName?.trim()) throw new Error('Custom keys require an env var name (e.g. MY_SERVICE_API_KEY)');
  const envVar = envVarForProvider(p, opts?.envVarName);
  const providerRow = `${PROVIDER_PREFIX}${p === 'custom' ? `custom_${envVar.toLowerCase()}` : p}`;
  if (opts?.cwsAuthorizationRevision !== undefined && (p !== 'cws_oauth'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.cwsAuthorizationRevision))) {
    throw new Error('Invalid CWS authorization revision. Authorize again.');
  }
  const prepared = await getSupabaseAdmin().rpc('prepare_provider_key_write', { p_owner_id: userId, p_provider: providerRow });
  if (prepared.error || typeof prepared.data !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(prepared.data)) {
    throw new Error('Credential could not be saved. Retry shortly.');
  }
  if (opts?.cwsAuthorizationRevision !== undefined && prepared.data !== opts.cwsAuthorizationRevision) {
    throw new Error('CWS connection changed during authorization. Authorize again.');
  }
  const admission = Object.freeze({ userId, providerRow, envVar });
  issuedWriteAdmissions.set(admission, { revision: prepared.data, oauthReceipt: opts?.cwsAuthorizationRevision !== undefined });
  return admission;
}

export function envVarForProvider(provider: string, override?: string): string {
  const p = normalizeProvider(provider);
  const name = override?.trim() ? sanitizeEnvVarName(override) : ENV_VAR_BY_PROVIDER[p] ?? `${p.toUpperCase()}_API_KEY`;
  assertPrivateCredentialEnv(p, name);
  return name;
}

function assertPrivateCredentialEnv(provider: string, name: string): void {
  const publicSupabase = (provider === 'supabase_url' && name === 'NEXT_PUBLIC_SUPABASE_URL')
    || (provider === 'supabase_anon' && name === 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!publicSupabase && /^(NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|REACT_APP_|PUBLIC_|GATSBY_|VUE_APP_|NUXT_PUBLIC_)/.test(name)) {
    throw new Error('Vault credentials cannot use browser-public environment names. Reconnect with a server-only name.');
  }
}

export async function saveUserProviderKey(
  userId: string,
  provider: string,
  apiKey: string,
  opts?: SaveKeyOptions,
): Promise<UserProviderKeyStatus> {
  const p = normalizeProvider(provider);
  if (!ALLOWED_SET.has(p)) {
    throw new Error(`Provider "${provider}" is not supported`);
  }
  if (p === 'custom' && !opts?.envVarName?.trim()) {
    throw new Error('Custom keys require an env var name (e.g. MY_SERVICE_API_KEY)');
  }
  const trimmed = apiKey.trim();
  const minLen =
    p === 'google_play' || p === 'cws_oauth' || p === 'apple_asc_api'
      ? 32
      : p === 'supabase_url'
        ? 12
        : p === 'supabase_db_password' ||
            p === 'electron_csc_password' ||
            p === 'electron_apple_team_id'
          ? 4
          : 8;
  if (trimmed.length < minLen) throw new Error('API key / credential too short');
  if (trimmed.length > 48_000) throw new Error('Credential too long (max ~48KB)');

  if (p === 'supabase_url') {
    if (!projectRefFromUrl(trimmed)) throw new Error('Supabase URL must be a hosted https://PROJECT.supabase.co origin.');
  }

  const envVar = envVarForProvider(p, opts?.envVarName);
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const syncTarget = PUBLISH_ONLY_PROVIDERS.has(p)
    ? 'eas'
    : SUPABASE_SERVER_ONLY_PROVIDERS.has(p)
      ? 'xroga_server'
      : 'vercel';
  const providerRow = `${PROVIDER_PREFIX}${p === 'custom' ? `custom_${envVar.toLowerCase()}` : p}`;
  // Capture before asynchronous bootstrap or persistence. A concurrent revoke or
  // newer save invalidates this exact attempt, including an initially absent row.
  const admission = opts?.writeAdmission ?? await prepareUserProviderKeyWrite(userId, p, { envVarName: envVar });
  const issued = issuedWriteAdmissions.get(admission);
  if (!issued || admission.userId !== userId || admission.providerRow !== providerRow || admission.envVar !== envVar) {
    throw Object.assign(new Error('Credential write admission does not match this request.'), { code: 'CREDENTIAL_WRITE_CONFLICT' });
  }
  const metadata = {
    type: PUBLISH_ONLY_PROVIDERS.has(p)
      ? 'user_publish_credential'
      : SUPABASE_SERVER_ONLY_PROVIDERS.has(p)
        ? 'supabase_provision'
        : 'user_api_key',
    provider: p,
    env_var: envVar,
    sync_target: syncTarget,
    connected_at: now,
    masked: maskKey(trimmed),
  };
  const encrypted = encryptApiKey(trimmed);


  const saveArgs = {
    p_owner_id:userId,p_provider:providerRow,p_revision:issued.revision,p_access_token:encrypted,p_metadata:metadata,
  };
  const { data:saved,error } = issued.oauthReceipt
    ? await supabase.rpc('save_cws_oauth_key_if_current', saveArgs)
    : await supabase.rpc('save_provider_key_if_current', saveArgs);
  if (error) throw new Error('Credential could not be saved. Retry shortly.');
  if (saved !== true) throw Object.assign(new Error('Credential changed while saving. Reconnect explicitly and retry.'), {code:'CREDENTIAL_WRITE_CONFLICT'});

  void saveKeyToStorage(userId, providerRow, {
    access_token: encrypted,
    metadata,
  }).catch(() => undefined);

  return { provider: p, connected: true, masked: maskKey(trimmed), envVar, connectedAt: now };
}

export async function listUserProviderKeys(userId: string): Promise<UserProviderKeyStatus[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('provider, metadata, created_at')
    .eq('user_id', userId)
    .like('provider', `${PROVIDER_PREFIX}%`);

  type KeyRow = {
    provider: string;
    metadata: Record<string, unknown> | null;
    updated_at?: string | null;
    created_at?: string | null;
  };
  let rows: KeyRow[] = (data ?? []) as KeyRow[];
  if (error) {
    throw new Error('Credential lookup unavailable. Retry shortly.');
  } else if (!rows.length) {
    // Also merge storage fallback keys (table empty but vault files exist)
    const stored = await listKeysFromStorage(userId);
    if (stored.length) rows = stored;
  }

  return rows.filter((row) => row.metadata?.revoked !== true).map((row) => {
    const meta = (row.metadata ?? {}) as {
      provider?: string;
      masked?: string;
      connected_at?: string;
      env_var?: string;
    };
    const provider = meta.provider ?? String(row.provider).replace(PROVIDER_PREFIX, '');
    return {
      provider,
      connected: true,
      masked: meta.masked,
      envVar: meta.env_var ?? envVarForProvider(provider),
      connectedAt: meta.connected_at ?? row.created_at ?? row.updated_at ?? undefined,
    };
  });
}

export async function deleteUserProviderKey(context: TenantContext, provider: string): Promise<void> {
  const { userId } = requireTenantContext(context);
  // Historical disconnect alias is delete-only, never a supported save/read key.
  if (provider === 'supabase_service') {
    await revokeProviderRow(context, 'apikey_supabase_service');
    return;
  }
  const p = credentialProviderSelection(provider);
  const supabase = getTenantSupabaseAdmin(context);
  // Only the legacy category-level request selects all custom keys. A named
  // custom credential must take the exact provider-row path below.
  if (p === 'custom') {
    const providers = new Set<string>();
    let expectedCount: number | undefined;
    for (let page = 0; page < 100; page++) {
      const offset = page * 100;
      const { data, error, count } = await supabase.from('user_integrations')
        .select('user_id,provider', { count: 'exact' })
        .eq('user_id', userId).like('provider', `${PROVIDER_PREFIX}custom%`)
        .order('provider', { ascending: true }).range(offset, offset + 99);
      if (error) throw new Error('Credential revocation could not be recorded. Retry shortly.');
      if (!Array.isArray(data) || !Number.isSafeInteger(count) || count === null || count < 0 || count > 10000
        || (expectedCount !== undefined && count !== expectedCount)
        || data.length !== Math.min(100, Math.max(0, count - offset))) {
        throw new Error('Custom credential database enumeration could not be completed. Retry shortly.');
      }
      expectedCount = count;
      for (const row of data) {
        if (!row || row.user_id !== userId || !isCustomProviderRow(row.provider) || providers.has(row.provider)) {
          throw new Error('Custom credential database enumeration changed. Retry shortly.');
        }
        providers.add(row.provider);
      }
      if (providers.size === count) break;
    }
    if (expectedCount === undefined || providers.size !== expectedCount) {
      throw new Error('Custom credential database enumeration exceeds the verified limit. Retry shortly.');
    }
    // Complete both inventories before the first mutation. Pagination is not a
    // transaction snapshot, so concurrent new-key creation remains separate.
    const stored = await listCustomRowsForRevocation(context);
    for (const providerRow of stored) providers.add(providerRow);
    for (const providerRow of providers) {
      await revokeProviderRow(context, providerRow);
    }
    return;
  }
  const providerRow = `${PROVIDER_PREFIX}${p}`;
  await revokeProviderRow(context, providerRow);
}

function isCustomProviderRow(value: unknown): value is string {
  return typeof value === 'string' && /^apikey_custom(?:_[a-z_][a-z0-9_]{1,63})?$/.test(value);
}

/** Revocation must prove enumeration, unlike optional display-only discovery. */
async function listCustomRowsForRevocation(context: TenantContext): Promise<string[]> {
  const { userId } = requireTenantContext(context);
  const supabase = getTenantSupabaseAdmin(context);
  const providers = new Set<string>();
  const seenNames = new Set<string>();
  const pageSize = 100;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase.storage.from(KEY_BUCKET).list(userId, {
      limit: pageSize, offset: page * pageSize, sortBy: { column: 'name', order: 'asc' },
    }).catch(() => ({ data: null, error: true }));
    if (error || !Array.isArray(data) || data.length > pageSize) {
      throw new Error('Custom credential cleanup could not be enumerated. Retry shortly.');
    }
    for (const file of data) {
      if (!file || typeof file.name !== 'string' || !file.name || seenNames.has(file.name)) {
        throw new Error('Custom credential cleanup enumeration changed. Retry shortly.');
      }
      seenNames.add(file.name);
      if (!file.name.startsWith('vault-apikey_custom') || !file.name.endsWith('.json')) continue;
      const providerRow = file.name.slice('vault-'.length, -'.json'.length);
      if (!isCustomProviderRow(providerRow)) throw new Error('Custom credential cleanup name is invalid. Retry shortly.');
      providers.add(providerRow);
    }
    if (data.length < pageSize) return [...providers];
  }
  throw new Error('Custom credential cleanup exceeds the verified enumeration limit. Retry shortly.');
}

/** Keep an authoritative denial even when a legacy mirror cannot be removed.
 * A missing database cannot safely certify revocation through Storage alone.
 */
async function revokeProviderRow(context: TenantContext, providerRow: string): Promise<void> {
  const { userId } = requireTenantContext(context);
  if (providerRow !== 'apikey_supabase_service') credentialProviderSelection(providerRow);
  const supabase = getTenantSupabaseAdmin(context);
  const { data,error } = await supabase.rpc('revoke_provider_key', {p_owner_id:userId,p_provider:providerRow});
  if (error || data !== true) throw new Error('Credential revocation could not be recorded. Retry shortly.');
  try {
    const result = await supabase.storage.from(KEY_BUCKET).remove([keyStoragePath(userId, providerRow)]);
    if (result.error) throw new Error('cleanup failed');
  } catch {
    throw new Error('Credential revoked, but legacy copy cleanup is pending. Retry shortly.');
  }
}

/** Placeholders only for GitHub — never plaintext secrets. */
export async function buildProviderEnvFiles(
  userId: string,
): Promise<Array<{ path: string; content: string }>> {
  const keys = await listUserProviderKeys(userId);
  const lines = [
    '# ── Secrets (NEVER commit real values) ─────────────────────',
    '# Save keys in Xroga → Integrations (encrypted vault).',
    '# On deploy, Xroga syncs them to your Vercel project env automatically.',
    '# For local: copy to .env.local (gitignored).',
    '',
  ];

  const rows =
    keys.length > 0
      ? keys
      : Object.entries(ENV_VAR_BY_PROVIDER)
          .filter(([p]) => p !== 'custom')
          .map(([provider, envVar]) => ({
            provider,
            connected: false,
            masked: undefined as string | undefined,
            envVar,
          }));

  for (const k of rows) {
    const varName = k.envVar ?? envVarForProvider(k.provider);
    if (k.connected) {
      lines.push(`${varName}=  # ✓ in Xroga vault (${k.masked ?? '••••'}) — synced to Vercel on deploy`);
    } else {
      lines.push(`# ${varName}=`);
    }
  }
  lines.push('');

  const connected = keys.filter((k) => k.connected);
  return [
    { path: '.env.example', content: lines.join('\n') },
    {
      path: 'SECRETS.md',
      content: `# Secrets & API keys (safe pattern)

## Never do this
- Do **not** paste API keys into chat or commit them to GitHub
- Do **not** put secret keys in \`NEXT_PUBLIC_*\` (browser-visible)

## Do this
1. Open **Xroga → Integrations**
2. Paste your key (OpenAI, Stripe, Supabase, custom…) → **Save**
3. Keys are stored **AES-256-GCM encrypted** in your account
4. When you deploy with **Vercel connected**, Xroga upserts them as project env vars
5. In code, read \`process.env.OPENAI_API_KEY\` (server/API routes only)

## Free client-safe APIs (optional demos)
Some public APIs work in the browser without secrets (e.g. demo image APIs). Prefer server routes for anything paid or private.

${
  connected.length
    ? `### Keys in your vault\n${connected
        .map((k) => `- **${k.provider}** → \`${k.envVar ?? envVarForProvider(k.provider)}\` (${k.masked ?? 'saved'})`)
        .join('\n')}`
    : '### No keys saved yet\nAdd one under Integrations before shipping paid AI/features.'
}
`,
    },
  ];
}

export async function getUserProviderKey(userId: string, provider: string): Promise<string | null> {
  const p = credentialProviderSelection(provider);
  if (SUPABASE_BUNDLE_PROVIDERS.includes(p as BundleProvider)) {
    const bundle = await readUserSupabaseBundle(userId);
    const field = { supabase_url: 'projectUrl', supabase_anon: 'anonKey', supabase: 'serviceRoleKey', supabase_db_password: 'dbPassword' } as const;
    return bundle?.[field[p as BundleProvider]] ?? null;
  }
  const supabase = getSupabaseAdmin();
  if (p === 'custom') {
    const { data, error } = await supabase
      .from('user_integrations')
      .select('access_token, provider, metadata')
      .eq('user_id', userId)
      .like('provider', `${PROVIDER_PREFIX}custom%`);
    if (!error) {
      const row = (data ?? []).find((item) => item.metadata?.revoked !== true && item.access_token);
      if (row) return decryptApiKey(row.access_token);
      if (data?.length) return null;
    }
    if (error) return null;
    const storedList = await listKeysFromStorage(userId);
    const custom = storedList.find((r) => String(r.provider).includes('custom'));
    if (custom) {
      const loaded = await loadKeyFromStorage(userId, custom.provider);
      if (loaded?.access_token) return decryptApiKey(loaded.access_token);
    }
    return null;
  }

  const providerRow = `${PROVIDER_PREFIX}${p}`;
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token, metadata')
    .eq('user_id', userId)
    .eq('provider', providerRow)
    .maybeSingle();

  if (!error && data) {
    return data.metadata?.revoked === true || !data.access_token ? null : decryptApiKey(data.access_token);
  }

  if (error) {
    return null;
  }

  const stored = await loadKeyFromStorage(userId, providerRow);
  if (!stored?.access_token) return null;
  return decryptApiKey(stored.access_token);
}

/** Decrypt vault → env map for Vercel sync only (never log values). */
export async function resolveProviderEnvForDeploy(userId: string): Promise<Record<string, string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('provider, access_token, metadata')
    .eq('user_id', userId)
    .like('provider', `${PROVIDER_PREFIX}%`);

  type Row = {
    provider: string;
    access_token?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  let rows: Row[] = (!error && data?.length ? data : []) as Row[];

  if (error || !rows.length) {
    if (error) throw new Error('Credential lookup unavailable. Retry shortly.');
    const stored = await listKeysFromStorage(userId);
    rows = [];
    for (const s of stored) {
      const loaded = await loadKeyFromStorage(userId, s.provider);
      if (!loaded?.access_token) continue;
      rows.push({
        provider: s.provider,
        access_token: loaded.access_token,
        metadata: loaded.metadata,
      });
    }
  }

  const out: Record<string, string> = {};
  for (const row of rows) {
    if (!row || (row.metadata != null && (typeof row.metadata !== 'object' || Array.isArray(row.metadata)))) {
      throw new Error('Credential metadata is invalid. Reconnect before syncing.');
    }
    if (row.metadata?.revoked === true) continue;
    const meta = (row.metadata ?? {}) as {
      env_var?: string;
      provider?: string;
      sync_target?: string;
    };
    // Row identity, not display metadata, determines where a secret may go.
    if (typeof row.provider !== 'string' || !row.provider.startsWith(PROVIDER_PREFIX)) throw new Error('Credential metadata is invalid. Reconnect before syncing.');
    let provider: string;
    try { provider = credentialProviderSelection(row.provider); }
    catch { throw new Error('Credential metadata is invalid. Reconnect before syncing.'); }
    if (PUBLISH_ONLY_PROVIDERS.has(provider) || meta.sync_target === 'eas') continue;
    if (SUPABASE_SERVER_ONLY_PROVIDERS.has(provider) || meta.sync_target === 'xroga_server') continue;
    if (meta.provider !== undefined && meta.provider !== provider && !(provider.startsWith('custom_') && meta.provider === 'custom')) {
      throw new Error('Credential metadata is invalid. Reconnect before syncing.');
    }
    const varName = meta.env_var ?? envVarForProvider(provider);
    if (typeof varName !== 'string' || !/^[A-Z_][A-Z0-9_]{1,63}$/.test(varName)) throw new Error('Credential metadata is invalid. Reconnect before syncing.');
    assertPrivateCredentialEnv(provider, varName);
    const plain = row.access_token ? decryptApiKey(row.access_token) : null;
    if (plain && varName) out[varName] = plain;
  }
  // Validate the final map too, including historical values and custom env
  // overrides. Generated server clients send the retained service key here.
  if (out.NEXT_PUBLIC_SUPABASE_URL && !projectRefFromUrl(out.NEXT_PUBLIC_SUPABASE_URL)) {
    throw new Error('Supabase deploy URL is not a verified hosted project origin. Reconnect before syncing credentials.');
  }
  if (out.NEXT_PUBLIC_SUPABASE_URL || out.NEXT_PUBLIC_SUPABASE_ANON_KEY || out.SUPABASE_SERVICE_ROLE_KEY) {
    const projectRows = new Map<BundleProvider, BundleRow>();
    for (const provider of SUPABASE_BUNDLE_PROVIDERS) {
      const row = rows.find(item => item.provider === `apikey_${provider}`);
      projectRows.set(provider, { provider: `apikey_${provider}`, access_token: row?.access_token ?? '', metadata: row?.metadata ?? { revoked: true }, credential_revision: null });
    }
    const values = bundleValues(projectRows);
    if (!boundBundle(projectRows) || out.NEXT_PUBLIC_SUPABASE_URL !== values.projectUrl
      || out.NEXT_PUBLIC_SUPABASE_ANON_KEY !== values.anonKey
      || (out.SUPABASE_SERVICE_ROLE_KEY ?? null) !== values.serviceRoleKey) {
      throw new Error('Supabase credentials are not associated with one project. Reconnect before syncing credentials.');
    }
  }
  return out;
}

/** Catalog for Integrations UI */
export function providerCatalog() {
  return [
    { id: 'openai', name: 'OpenAI', envVar: 'OPENAI_API_KEY', freeTier: false, category: 'ai' },
    { id: 'anthropic', name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY', freeTier: false, category: 'ai' },
    { id: 'groq', name: 'Groq', envVar: 'GROQ_API_KEY', freeTier: true, category: 'ai' },
    { id: 'gemini', name: 'Google Gemini', envVar: 'GEMINI_API_KEY', freeTier: true, category: 'ai' },
    { id: 'openrouter', name: 'OpenRouter', envVar: 'OPENROUTER_API_KEY', freeTier: true, category: 'ai' },
    { id: 'deepseek', name: 'DeepSeek', envVar: 'DEEPSEEK_API_KEY', freeTier: false, category: 'ai' },
    { id: 'grok', name: 'xAI Grok', envVar: 'XAI_API_KEY', freeTier: false, category: 'ai' },
    { id: 'stripe', name: 'Stripe', envVar: 'STRIPE_SECRET_KEY', freeTier: false, category: 'payments' },
    {
      id: 'supabase_url',
      name: 'Supabase project URL',
      envVar: 'NEXT_PUBLIC_SUPABASE_URL',
      freeTier: true,
      category: 'backend',
    },
    { id: 'supabase', name: 'Supabase service role', envVar: 'SUPABASE_SERVICE_ROLE_KEY', freeTier: true, category: 'backend' },
    { id: 'supabase_anon', name: 'Supabase anon key', envVar: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', freeTier: true, category: 'backend' },
    {
      id: 'supabase_pat',
      name: 'Supabase access token (auto-provision)',
      envVar: 'SUPABASE_ACCESS_TOKEN',
      freeTier: true,
      category: 'backend',
    },
    {
      id: 'supabase_db_password',
      name: 'Supabase DB password (auto-provision fallback)',
      envVar: 'SUPABASE_DB_PASSWORD',
      freeTier: true,
      category: 'backend',
    },
    { id: 'resend', name: 'Resend email', envVar: 'RESEND_API_KEY', freeTier: true, category: 'email' },
    { id: 'huggingface', name: 'Hugging Face', envVar: 'HF_TOKEN', freeTier: true, category: 'ai' },
    {
      id: 'expo',
      name: 'Expo access token (EAS)',
      envVar: 'EXPO_TOKEN',
      freeTier: true,
      category: 'publish',
    },
    {
      id: 'apple_asc',
      name: 'Apple app-specific password',
      envVar: 'EXPO_APPLE_APP_SPECIFIC_PASSWORD',
      freeTier: false,
      category: 'publish',
    },
    {
      id: 'apple_asc_api',
      name: 'App Store Connect API key JSON',
      envVar: 'EXPO_APPLE_ASC_API_JSON',
      freeTier: false,
      category: 'publish',
    },
    {
      id: 'google_play',
      name: 'Google Play service account JSON',
      envVar: 'GOOGLE_SERVICE_ACCOUNT_JSON',
      freeTier: false,
      category: 'publish',
    },
    {
      id: 'cws_oauth',
      name: 'Chrome Web Store OAuth JSON',
      envVar: 'CHROME_WEBSTORE_OAUTH_JSON',
      freeTier: false,
      category: 'publish',
    },
    {
      id: 'electron_csc_link',
      name: 'Electron code-sign cert (CSC_LINK)',
      envVar: 'CSC_LINK',
      freeTier: false,
      category: 'publish',
    },
    {
      id: 'electron_csc_password',
      name: 'Electron code-sign password',
      envVar: 'CSC_KEY_PASSWORD',
      freeTier: false,
      category: 'publish',
    },
    {
      id: 'electron_apple_id',
      name: 'Apple ID (Electron notarization)',
      envVar: 'APPLE_ID',
      freeTier: false,
      category: 'publish',
    },
    {
      id: 'electron_apple_password',
      name: 'Apple app-specific password (notarization)',
      envVar: 'APPLE_APP_SPECIFIC_PASSWORD',
      freeTier: false,
      category: 'publish',
    },
    {
      id: 'electron_apple_team_id',
      name: 'Apple Team ID (notarization)',
      envVar: 'APPLE_TEAM_ID',
      freeTier: false,
      category: 'publish',
    },
    { id: 'custom', name: 'Custom env var', envVar: 'CUSTOM_API_KEY', freeTier: false, category: 'custom' },
  ];
}

export interface UserSupabaseStatus {
  connected: boolean;
  ready: boolean;
  provisioned: boolean;
  hasUrl: boolean;
  hasAnonKey: boolean;
  hasServiceRole: boolean;
  hasAccessToken: boolean;
  hasDbPassword: boolean;
  urlMasked?: string;
  message: string;
}

/** True when the user can power a generated app against THEIR Supabase project. */
export async function getUserSupabaseStatus(userId: string): Promise<UserSupabaseStatus> {
  let keys: UserProviderKeyStatus[] = [];
  try {
    keys = await listUserProviderKeys(userId);
  } catch (err) {
    // Missing table / schema cache — treat as empty vault, not a hard failure after OAuth
    if (!isMissingTableError((err as Error).message)) {
      console.warn('[userProviderKeys] status list:', (err as Error).message);
    }
    keys = [];
  }
  const byProvider = new Map(keys.map((k) => [k.provider, k]));
  const url = byProvider.get('supabase_url');
  const anon = byProvider.get('supabase_anon');
  const service = byProvider.get('supabase');
  const pat = byProvider.get('supabase_pat');
  const dbPass = byProvider.get('supabase_db_password');
  const hasUrl = Boolean(url?.connected);
  const hasAnonKey = Boolean(anon?.connected);
  const hasServiceRole = Boolean(service?.connected);
  const hasAccessToken = Boolean(pat?.connected);
  const hasDbPassword = Boolean(dbPass?.connected);
  let oauthConnected = false;
  try {
    const { isSupabaseOAuthConnected } = await import('./supabaseAuth.js');
    oauthConnected = await isSupabaseOAuthConnected(userId);
  } catch {
    /* ignore */
  }
  let associated = false;
  try { associated = Boolean((await readUserSupabaseBundle(userId))?.serviceRoleKey); } catch { /* fail closed */ }
  const ready = hasUrl && hasAnonKey && hasServiceRole && associated;
  // Credential presence is not evidence that schema or storage was provisioned.
  const provisioned = false;
  return {
    connected: hasUrl || hasAnonKey || hasServiceRole || hasAccessToken || oauthConnected,
    ready,
    provisioned,
    hasUrl,
    hasAnonKey,
    hasServiceRole,
    hasAccessToken: hasAccessToken || oauthConnected,
    hasDbPassword,
    urlMasked: url?.masked,
    message: ready
      ? 'Keys configured. Schema and private storage setup have not been verified by this status check.'
      : oauthConnected
        ? 'Authorized — pick a project and Xroga sets up schema, memory & storage automatically.'
          : 'Click Authorize Supabase — no keys to paste. Xroga handles keys, SQL, memory & storage.',
  };
}

export interface ConnectUserSupabaseInput {
  projectUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  accessToken?: string;
  dbPassword?: string;
  projectName?: string;
}

const SUPABASE_BUNDLE_PROVIDERS = ['supabase', 'supabase_anon', 'supabase_db_password', 'supabase_url'] as const;
type BundleProvider = typeof SUPABASE_BUNDLE_PROVIDERS[number];
type BundleRow = { provider: string; access_token: string; metadata: Record<string, unknown>; credential_revision: string | null };
export type SupabaseBundleAdmission = Readonly<{ userId: string }>;
const bundleAdmissions = new WeakMap<SupabaseBundleAdmission, Map<BundleProvider, BundleRow>>();
const bundleConflict = () => Object.assign(new Error('Supabase connection changed. Reconnect explicitly.'), { code: 'CREDENTIAL_WRITE_CONFLICT' });

async function snapshotSupabaseRows(userId: string): Promise<Map<BundleProvider, BundleRow>> {
  const db = getSupabaseAdmin();
  const query = () => db.from('user_integrations').select('user_id,provider,access_token,metadata,credential_revision')
    .eq('user_id', userId).in('provider', SUPABASE_BUNDLE_PROVIDERS.map(p => `apikey_${p}`));
  const first = await query();
  const validate = (result: typeof first) => {
    if (result.error || !Array.isArray(result.data) || result.data.some(row => !row || row.user_id !== userId
      || !SUPABASE_BUNDLE_PROVIDERS.some(p => row.provider === `apikey_${p}`)
      || typeof row.access_token !== 'string' || typeof row.credential_revision !== 'string'
      || !row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata))
      || new Set(result.data.map(row => row.provider)).size !== result.data.length) {
      throw new Error('Supabase credential authority is unavailable. Retry before reconnecting.');
    }
    return result.data;
  };
  const rows = validate(first);
  const result = new Map<BundleProvider, BundleRow>();
  for (const provider of SUPABASE_BUNDLE_PROVIDERS) {
    const row = rows.find(r => r.provider === `apikey_${provider}`);
    if (row) { result.set(provider, row as BundleRow); continue; }
    // Preserve legacy records, but distinguish absence from an unavailable mirror.
    const downloaded = await db.storage.from(KEY_BUCKET).download(keyStoragePath(userId, `apikey_${provider}`));
    if (downloaded.error) {
      // Pinned storage-js maps body.statusCode, then body.code, into statusCode.
      // Storage may return HTTP 400 with a precise missing-object/bucket code.
      if (!['404', 'NoSuchKey', 'NoSuchBucket'].includes(String(downloaded.error.statusCode))) {
        throw new Error('Legacy Supabase credentials could not be checked. Retry before reconnecting.');
      }
      result.set(provider, { provider: `apikey_${provider}`, access_token: '', metadata: { revoked: true }, credential_revision: null });
    } else {
      let legacy: { access_token?: unknown; metadata?: unknown };
      try { legacy = JSON.parse(await downloaded.data.text()); } catch { throw new Error('Legacy Supabase credentials require explicit reconnection.'); }
      if (typeof legacy.access_token !== 'string' || !legacy.metadata || typeof legacy.metadata !== 'object' || Array.isArray(legacy.metadata)) {
        throw new Error('Legacy Supabase credentials require explicit reconnection.');
      }
      // A mirror cannot assert an authoritative bundle generation.
      const metadata = { ...legacy.metadata } as Record<string, unknown>;
      delete metadata.supabase_bundle_id; delete metadata.supabase_project_ref;
      result.set(provider, { provider: `apikey_${provider}`, access_token: legacy.access_token, metadata, credential_revision: null });
    }
  }
  if (rows.length !== SUPABASE_BUNDLE_PROVIDERS.length) {
    const second = validate(await query());
    const fingerprint = (items: typeof rows) => JSON.stringify(items.map(r => [r.provider, r.credential_revision]).sort());
    if (fingerprint(rows) !== fingerprint(second)) throw bundleConflict();
  }
  return result;
}

export async function prepareSupabaseBundleWrite(userId: string): Promise<SupabaseBundleAdmission> {
  const rows = await snapshotSupabaseRows(userId);
  const admission = Object.freeze({ userId });
  bundleAdmissions.set(admission, rows);
  return admission;
}

function legacyJwtMatches(key: string, ref: string, role: string): boolean {
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    return payload.ref === ref && payload.role === role;
  } catch { return false; }
}

function bundleValues(rows: Map<BundleProvider, BundleRow>) {
  const value = (provider: BundleProvider) => {
    const row = rows.get(provider);
    return row?.metadata.revoked === true || !row?.access_token ? null : decryptApiKey(row.access_token);
  };
  return { projectUrl: value('supabase_url'), anonKey: value('supabase_anon'), serviceRoleKey: value('supabase'), dbPassword: value('supabase_db_password') };
}

function boundBundle(rows: Map<BundleProvider, BundleRow>): boolean {
  const values = bundleValues(rows), ref = projectRefFromUrl(values.projectUrl ?? '');
  if (!ref || !values.anonKey) return false;
  const active = [...rows.values()].filter(row => row.access_token && row.metadata.revoked !== true);
  const generation = rows.get('supabase_url')?.metadata.supabase_bundle_id;
  if (generation) return typeof generation === 'string' && active.every(row => row.metadata.supabase_bundle_id === generation && row.metadata.supabase_project_ref === ref);
  if (active.some(row => row.metadata.supabase_bundle_id) || values.dbPassword) return false;
  return legacyJwtMatches(values.anonKey, ref, 'anon') && (!values.serviceRoleKey || legacyJwtMatches(values.serviceRoleKey, ref, 'service_role'));
}

/** One authority snapshot. Legacy JWT consistency is not provider verification. */
export async function readUserSupabaseBundle(userId: string) {
  const rows = await snapshotSupabaseRows(userId);
  if (!boundBundle(rows)) return null;
  return bundleValues(rows);
}

export async function saveSupabaseBundle(admission: SupabaseBundleAdmission, input: ConnectUserSupabaseInput): Promise<UserProviderKeyStatus[]> {
  const rows = bundleAdmissions.get(admission);
  if (!rows) throw bundleConflict();
  const ref = projectRefFromUrl(input.projectUrl);
  if (!ref) throw new Error('Invalid Supabase project URL.');
  const previous = bundleValues(rows);
  const values = { projectUrl: input.projectUrl.trim(), anonKey: input.anonKey.trim(), serviceRoleKey: input.serviceRoleKey?.trim(), dbPassword: input.dbPassword?.trim() };
  for (const [key, role] of [[values.anonKey, 'anon'], [values.serviceRoleKey, 'service_role']] as const) {
    if (!key || key.split('.').length !== 3) continue;
    let claim: Record<string, unknown>;
    try { claim = JSON.parse(Buffer.from(key.split('.')[1]!, 'base64url').toString('utf8')); } catch { continue; }
    if (claim && typeof claim === 'object' && (('ref' in claim && claim.ref !== ref) || ('role' in claim && claim.role !== role))) {
      throw new Error('Supabase credential project or role does not match the supplied bundle.');
    }
  }
  if (!values.anonKey || values.anonKey.length < 8 || (values.serviceRoleKey && values.serviceRoleKey.length < 8)
    || (values.dbPassword && values.dbPassword.length < 4) || Object.values(values).some(v => v && v.length > 48000)) throw new Error('Invalid Supabase credentials.');
  // Omitted active credentials may only survive an already-consistent same-project bundle.
  for (const key of ['serviceRoleKey', 'dbPassword'] as const) {
    if (!values[key] && previous[key]) {
      if (!boundBundle(rows) || projectRefFromUrl(previous.projectUrl ?? '') !== ref) {
        throw new Error('Disconnect the existing Supabase project before reconnecting with omitted service credentials or database password.');
      }
      values[key] = previous[key];
    }
  }
  const keys: Record<BundleProvider, string | undefined> = { supabase_url: values.projectUrl, supabase_anon: values.anonKey, supabase: values.serviceRoleKey, supabase_db_password: values.dbPassword };
  const now = new Date().toISOString();
  const statuses: UserProviderKeyStatus[] = [];
  const payload = SUPABASE_BUNDLE_PROVIDERS.map(provider => {
    const value = keys[provider], envVar = envVarForProvider(provider);
    if (value) statuses.push({ provider, connected: true, masked: maskKey(value), envVar, connectedAt: now });
    return { provider: `apikey_${provider}`, revision: rows.get(provider)!.credential_revision,
      access_token: value ? encryptApiKey(value) : '', metadata: value ? {
        type: SUPABASE_SERVER_ONLY_PROVIDERS.has(provider) ? 'supabase_provision' : 'user_api_key', provider, env_var: envVar,
        sync_target: SUPABASE_SERVER_ONLY_PROVIDERS.has(provider) ? 'xroga_server' : 'vercel', connected_at: now, masked: maskKey(value),
      } : { revoked: true } };
  });
  const saved = await getSupabaseAdmin().rpc('save_supabase_bundle_if_current', { p_owner_id: admission.userId, p_project_ref: ref, p_rows: payload });
  if (saved.error) throw new Error('Supabase bundle could not be saved. Retry shortly.');
  if (saved.data !== true) throw bundleConflict();
  bundleAdmissions.delete(admission);
  return statuses;
}

/** Save URL + anon (+ optional service role) and auto-provision when possible. */
export async function connectUserSupabase(
  context: TenantContext,
  input: ConnectUserSupabaseInput,
): Promise<{
  status: UserSupabaseStatus;
  saved: UserProviderKeyStatus[];
  provision?: import('./supabaseProvision.js').ProvisionResult;
}> {
  const { userId } = requireTenantContext(context);
  // Snapshot the whole request before admission or persistence can yield.
  input = {
    projectUrl: input.projectUrl.trim(), anonKey: input.anonKey.trim(),
    serviceRoleKey: input.serviceRoleKey?.trim(), accessToken: input.accessToken?.trim(),
    dbPassword: input.dbPassword?.trim(), projectName: input.projectName,
  };
  const projectRef = projectRefFromUrl(input.projectUrl);
  if (!projectRef) throw new Error('Supabase URL must be a hosted https://PROJECT.supabase.co origin.');
  // Legacy JWT claims are only a negative mismatch check, not verified identity.
  // Opaque publishable/secret formats remain supported.
  for (const key of [input.anonKey, input.serviceRoleKey]) {
    if (!key || key.split('.').length !== 3) continue;
    let payload: unknown;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1]!, 'base64url').toString('utf8')); }
    catch { continue; }
    if (payload && typeof payload === 'object' && 'ref' in payload
      && (payload as { ref: unknown }).ref !== projectRef) {
      throw new Error('Supabase credential project does not match the supplied URL.');
    }
  }
  const [admission, patAdmission] = await Promise.all([
    prepareSupabaseBundleWrite(userId),
    input.accessToken ? prepareUserProviderKeyWrite(userId, 'supabase_pat') : Promise.resolve(undefined),
  ]);
  const saved = await saveSupabaseBundle(admission, input);
  if (input.accessToken) saved.push(await saveUserProviderKey(userId, 'supabase_pat', input.accessToken, { writeAdmission: patAdmission }));
  const service = input.serviceRoleKey?.trim();
  const accessToken = input.accessToken?.trim();
  const dbPassword = input.dbPassword?.trim();

  let provision: import('./supabaseProvision.js').ProvisionResult | undefined;
  if (service && (accessToken || dbPassword)) {
    const { provisionUserSupabase } = await import('./supabaseProvision.js');
    provision = await provisionUserSupabase({
      projectUrl: input.projectUrl.trim(),
      serviceRoleKey: service,
      accessToken,
      dbPassword,
      projectName: input.projectName,
    });
  } else if (service) {
    const { ensureStorageBuckets, projectRefFromUrl } = await import('./supabaseProvision.js');
    const ref = projectRefFromUrl(input.projectUrl.trim());
    const buckets = await ensureStorageBuckets(input.projectUrl.trim(), service).catch(() => []);
    provision = {
      ok: buckets.length > 0,
      method: 'keys_only',
      projectRef: ref || undefined,
      projectUrl: input.projectUrl.trim(),
      buckets,
      schemaApplied: false,
      memoryTablesReady: false,
      message: buckets.length
        ? 'Storage bucket ready. Add Access Token for full one-click schema + AI memory setup.'
        : 'Keys saved. Add Access Token (Account → Access Tokens) for automatic schema setup.',
    };
  }

  const status = await getUserSupabaseStatus(userId);
  if (provision?.message) {
    status.message = provision.message;
    status.provisioned = provision.ok && provision.schemaApplied && provision.memoryTablesReady;
  }
  return { status, saved, provision };
}
