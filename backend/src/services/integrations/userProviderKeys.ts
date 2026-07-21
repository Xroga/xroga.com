/**
 * User BYOK / product API keys — AES-256-GCM in user_integrations.
 * Secrets never go into GitHub; synced to the user's Vercel project env on deploy.
 * When user_integrations is missing, fall back to private Storage (same as OAuth PKCE).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';
import { ensureGithubSchema, githubSchemaAutoBootstrapEnabled } from '../../db/ensureGithubSchema.js';
import { isMissingTableError } from './githubTokenStore.js';

const PROVIDER_PREFIX = 'apikey_';
const KEY_BUCKET = 'xroga-github-tokens';

function keyStoragePath(userId: string, providerRow: string): string {
  return `${userId}/vault-${providerRow}.json`;
}

async function ensureKeyBucket(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (!listErr && buckets?.some((b) => b.id === KEY_BUCKET || b.name === KEY_BUCKET)) {
    return true;
  }
  const { error: createErr } = await supabase.storage.createBucket(KEY_BUCKET, {
    public: false,
    fileSizeLimit: 65536,
  });
  if (!createErr) return true;
  if (/already exists|duplicate/i.test(createErr.message)) return true;
  console.warn('[userProviderKeys] createBucket:', createErr.message);
  return false;
}

async function saveKeyToStorage(
  userId: string,
  providerRow: string,
  payload: { access_token: string; metadata: Record<string, unknown> },
): Promise<boolean> {
  try {
    if (!(await ensureKeyBucket())) return false;
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
    if (!parsed?.access_token) return null;
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
  'tavily',
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
  tavily: 'TAVILY_API_KEY',
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

function encryptionKey(): Buffer {
  const secret =
    process.env.USER_SECRETS_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_JWT_SECRET ||
    'xroga-dev-key';
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
  if (!stored.startsWith('v1:')) {
    try {
      const raw = Buffer.from(stored.replace(/^enc:/, ''), 'base64').toString('utf8');
      const idx = raw.indexOf(':');
      return idx >= 0 ? raw.slice(idx + 1) : raw;
    } catch {
      return null;
    }
  }
  const parts = stored.split(':');
  if (parts.length < 4) return null;
  try {
    const iv = Buffer.from(parts[1]!, 'base64');
    const tag = Buffer.from(parts[2]!, 'base64');
    const data = Buffer.from(parts.slice(3).join(':'), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
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
}

export function envVarForProvider(provider: string, override?: string): string {
  if (override?.trim()) return sanitizeEnvVarName(override);
  const p = normalizeProvider(provider);
  return ENV_VAR_BY_PROVIDER[p] ?? `${p.toUpperCase()}_API_KEY`;
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
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('Supabase URL must be a valid https URL (e.g. https://xxxx.supabase.co)');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Supabase URL must use https://');
    }
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

  if (githubSchemaAutoBootstrapEnabled()) {
    await ensureGithubSchema();
  }

  let { error } = await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider: providerRow,
      access_token: encrypted,
      metadata,
    },
    { onConflict: 'user_id,provider' },
  );

  if (error && isMissingTableError(error.message)) {
    await ensureGithubSchema();
    await new Promise((r) => setTimeout(r, 400));
    ({ error } = await supabase.from('user_integrations').upsert(
      {
        user_id: userId,
        provider: providerRow,
        access_token: encrypted,
        metadata,
      },
      { onConflict: 'user_id,provider' },
    ));
  }

  if (error && isMissingTableError(error.message)) {
    const ok = await saveKeyToStorage(userId, providerRow, {
      access_token: encrypted,
      metadata,
    });
    if (!ok) {
      throw new Error(
        'Could not save credentials — user_integrations table missing and storage fallback failed. Apply migration 036 or set SUPABASE_DB_PASSWORD on Fly.',
      );
    }
    console.warn('[userProviderKeys] saved via storage fallback:', providerRow);
    return { provider: p, connected: true, masked: maskKey(trimmed), envVar, connectedAt: now };
  }

  if (error) throw new Error(error.message);

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
    .select('provider, metadata, updated_at')
    .eq('user_id', userId)
    .like('provider', `${PROVIDER_PREFIX}%`);

  type KeyRow = {
    provider: string;
    metadata: Record<string, unknown> | null;
    updated_at?: string | null;
  };
  let rows: KeyRow[] = (data ?? []) as KeyRow[];
  if (error) {
    if (!isMissingTableError(error.message)) {
      throw new Error(error.message);
    }
    rows = await listKeysFromStorage(userId);
  } else if (!rows.length) {
    // Also merge storage fallback keys (table empty but vault files exist)
    const stored = await listKeysFromStorage(userId);
    if (stored.length) rows = stored;
  }

  return rows.map((row) => {
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
      connectedAt: meta.connected_at ?? row.updated_at ?? undefined,
    };
  });
}

export async function deleteUserProviderKey(userId: string, provider: string): Promise<void> {
  const p = normalizeProvider(provider);
  const supabase = getSupabaseAdmin();
  // custom_* rows: delete by prefix match when provider is custom_FOO
  if (p.startsWith('custom_') || p === 'custom') {
    const { data, error } = await supabase
      .from('user_integrations')
      .select('provider')
      .eq('user_id', userId)
      .like('provider', `${PROVIDER_PREFIX}custom%`);
    if (!error) {
      for (const row of data ?? []) {
        await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', row.provider);
        await supabase.storage.from(KEY_BUCKET).remove([keyStoragePath(userId, row.provider)]).catch(() => undefined);
      }
    } else if (!isMissingTableError(error.message)) {
      throw new Error(error.message);
    }
    const stored = await listKeysFromStorage(userId);
    for (const row of stored) {
      if (String(row.provider).includes('custom')) {
        await supabase.storage.from(KEY_BUCKET).remove([keyStoragePath(userId, row.provider)]).catch(() => undefined);
      }
    }
    return;
  }
  const providerRow = `${PROVIDER_PREFIX}${p}`;
  const { error } = await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', providerRow);
  if (error && !isMissingTableError(error.message)) {
    throw new Error(error.message);
  }
  await supabase.storage.from(KEY_BUCKET).remove([keyStoragePath(userId, providerRow)]).catch(() => undefined);
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
  const p = normalizeProvider(provider);
  const supabase = getSupabaseAdmin();
  if (p === 'custom' || p.startsWith('custom_')) {
    const { data, error } = await supabase
      .from('user_integrations')
      .select('access_token, provider')
      .eq('user_id', userId)
      .like('provider', `${PROVIDER_PREFIX}custom%`);
    if (!error) {
      const row = (data ?? [])[0];
      if (row?.access_token) return decryptApiKey(row.access_token);
    }
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
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', providerRow)
    .maybeSingle();

  if (!error && data?.access_token) {
    return decryptApiKey(data.access_token);
  }

  if (error && !isMissingTableError(error.message)) {
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
    if (error && !isMissingTableError(error.message)) {
      console.warn('[userProviderKeys] resolve for deploy:', error.message);
    }
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
    const meta = (row.metadata ?? {}) as {
      env_var?: string;
      provider?: string;
      sync_target?: string;
    };
    const provider = meta.provider ?? String(row.provider).replace(PROVIDER_PREFIX, '');
    if (PUBLISH_ONLY_PROVIDERS.has(provider) || meta.sync_target === 'eas') continue;
    if (SUPABASE_SERVER_ONLY_PROVIDERS.has(provider) || meta.sync_target === 'xroga_server') continue;
    const varName = meta.env_var ?? envVarForProvider(provider);
    const plain = row.access_token ? decryptApiKey(row.access_token) : null;
    if (plain && varName) out[varName] = plain;
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
    { id: 'tavily', name: 'Tavily search', envVar: 'TAVILY_API_KEY', freeTier: true, category: 'search' },
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
  const ready = hasUrl && hasAnonKey && hasServiceRole;
  const provisioned = ready && (hasAccessToken || hasDbPassword || oauthConnected);
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
    message: provisioned
      ? 'Your Supabase is connected and auto-provisioned — AI memory & storage live in YOUR project.'
      : oauthConnected
        ? 'Authorized — pick a project and Xroga sets up schema, memory & storage automatically.'
        : ready
          ? 'Keys saved. Authorize Supabase OAuth so Xroga can auto-run SQL on your project.'
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

/** Save URL + anon (+ optional service role) and auto-provision when possible. */
export async function connectUserSupabase(
  userId: string,
  input: ConnectUserSupabaseInput,
): Promise<{
  status: UserSupabaseStatus;
  saved: UserProviderKeyStatus[];
  provision?: import('./supabaseProvision.js').ProvisionResult;
}> {
  const saved: UserProviderKeyStatus[] = [];
  saved.push(await saveUserProviderKey(userId, 'supabase_url', input.projectUrl.trim()));
  saved.push(await saveUserProviderKey(userId, 'supabase_anon', input.anonKey.trim()));
  const service = input.serviceRoleKey?.trim();
  if (service) {
    saved.push(await saveUserProviderKey(userId, 'supabase', service));
  }
  const accessToken = input.accessToken?.trim();
  if (accessToken) {
    saved.push(await saveUserProviderKey(userId, 'supabase_pat', accessToken));
  }
  const dbPassword = input.dbPassword?.trim();
  if (dbPassword) {
    saved.push(await saveUserProviderKey(userId, 'supabase_db_password', dbPassword));
  }

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
    if (provision.schemaApplied) status.provisioned = true;
  }
  return { status, saved, provision };
}
