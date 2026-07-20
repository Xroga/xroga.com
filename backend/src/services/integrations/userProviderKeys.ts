/**
 * User BYOK / product API keys — AES-256-GCM in user_integrations.
 * Secrets never go into GitHub; synced to the user's Vercel project env on deploy.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';

const PROVIDER_PREFIX = 'apikey_';

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
  'apple_asc',
  'google_play',
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
  supabase_url: 'NEXT_PUBLIC_SUPABASE_URL',
  supabase: 'SUPABASE_SERVICE_ROLE_KEY',
  supabase_anon: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  supabase_pat: 'SUPABASE_ACCESS_TOKEN',
  supabase_db_password: 'SUPABASE_DB_PASSWORD',
  resend: 'RESEND_API_KEY',
  expo: 'EXPO_TOKEN',
  apple_asc: 'EXPO_APPLE_APP_SPECIFIC_PASSWORD',
  google_play: 'GOOGLE_SERVICE_ACCOUNT_JSON',
  custom: 'CUSTOM_API_KEY',
};

/** These are for EAS/store submit — never sync into Vercel web project env. */
export const PUBLISH_ONLY_PROVIDERS = new Set(['expo', 'apple_asc', 'google_play']);

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
  const minLen = p === 'google_play' ? 32 : p === 'supabase_url' ? 12 : p === 'supabase_db_password' ? 4 : 8;
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
  const { error } = await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider: `${PROVIDER_PREFIX}${p === 'custom' ? `custom_${envVar.toLowerCase()}` : p}`,
      access_token: encryptApiKey(trimmed),
      metadata: {
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
      },
    },
    { onConflict: 'user_id,provider' },
  );

  if (error) throw new Error(error.message);

  return { provider: p, connected: true, masked: maskKey(trimmed), envVar, connectedAt: now };
}

export async function listUserProviderKeys(userId: string): Promise<UserProviderKeyStatus[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('provider, metadata, updated_at')
    .eq('user_id', userId)
    .like('provider', `${PROVIDER_PREFIX}%`);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
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
      connectedAt: meta.connected_at ?? row.updated_at,
    };
  });
}

export async function deleteUserProviderKey(userId: string, provider: string): Promise<void> {
  const p = normalizeProvider(provider);
  const supabase = getSupabaseAdmin();
  // custom_* rows: delete by prefix match when provider is custom_FOO
  if (p.startsWith('custom_') || p === 'custom') {
    const { data } = await supabase
      .from('user_integrations')
      .select('provider')
      .eq('user_id', userId)
      .like('provider', `${PROVIDER_PREFIX}custom%`);
    for (const row of data ?? []) {
      await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', row.provider);
    }
    return;
  }
  const { error } = await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', `${PROVIDER_PREFIX}${p}`);
  if (error) throw new Error(error.message);
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
    const { data } = await supabase
      .from('user_integrations')
      .select('access_token, provider')
      .eq('user_id', userId)
      .like('provider', `${PROVIDER_PREFIX}custom%`);
    const row = (data ?? [])[0];
    if (!row?.access_token) return null;
    return decryptApiKey(row.access_token);
  }
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', `${PROVIDER_PREFIX}${p}`)
    .maybeSingle();
  if (error || !data?.access_token) return null;
  return decryptApiKey(data.access_token);
}

/** Decrypt vault → env map for Vercel sync only (never log values). */
export async function resolveProviderEnvForDeploy(userId: string): Promise<Record<string, string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('provider, access_token, metadata')
    .eq('user_id', userId)
    .like('provider', `${PROVIDER_PREFIX}%`);
  if (error || !data?.length) return {};

  const out: Record<string, string> = {};
  for (const row of data) {
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
      id: 'google_play',
      name: 'Google Play service account JSON',
      envVar: 'GOOGLE_SERVICE_ACCOUNT_JSON',
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
  const keys = await listUserProviderKeys(userId);
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
