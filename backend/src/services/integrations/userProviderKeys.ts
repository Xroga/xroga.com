/**
 * User BYOK API keys — stored server-side in user_integrations (encrypted at rest).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getSupabaseAdmin } from '../../config/supabase.js';

const PROVIDER_PREFIX = 'apikey_';

const ALLOWED_PROVIDERS = new Set([
  'grok',
  'xai',
  'deepseek',
  'openai',
  'anthropic',
  'groq',
  'gemini',
  'tavily',
  'huggingface',
  'openrouter',
  'replicate',
]);

function normalizeProvider(provider: string): string {
  const p = provider.trim().toLowerCase().replace(/^apikey_/, '');
  if (p === 'xai') return 'grok';
  return p;
}

function encryptionKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_JWT_SECRET ?? 'xroga-dev-key';
  return scryptSync(secret.slice(0, 32), 'xroga-provider-keys', 32);
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

export interface UserProviderKeyStatus {
  provider: string;
  connected: boolean;
  masked?: string;
  connectedAt?: string;
}

export async function saveUserProviderKey(
  userId: string,
  provider: string,
  apiKey: string
): Promise<UserProviderKeyStatus> {
  const p = normalizeProvider(provider);
  if (!ALLOWED_PROVIDERS.has(p)) {
    throw new Error(`Provider "${provider}" is not supported`);
  }
  const trimmed = apiKey.trim();
  if (trimmed.length < 8) throw new Error('API key too short');

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider: `${PROVIDER_PREFIX}${p}`,
      access_token: encryptApiKey(trimmed),
      metadata: {
        type: 'user_api_key',
        provider: p,
        connected_at: now,
        masked: maskKey(trimmed),
      },
    },
    { onConflict: 'user_id,provider' }
  );

  if (error) throw new Error(error.message);

  return { provider: p, connected: true, masked: maskKey(trimmed), connectedAt: now };
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
    const meta = (row.metadata ?? {}) as { provider?: string; masked?: string; connected_at?: string };
    const provider = meta.provider ?? row.provider.replace(PROVIDER_PREFIX, '');
    return {
      provider,
      connected: true,
      masked: meta.masked,
      connectedAt: meta.connected_at ?? row.updated_at,
    };
  });
}

export async function deleteUserProviderKey(userId: string, provider: string): Promise<void> {
  const p = normalizeProvider(provider);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', `${PROVIDER_PREFIX}${p}`);
  if (error) throw new Error(error.message);
}

const ENV_VAR_BY_PROVIDER: Record<string, string> = {
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
};

/** `.env.example` for repos — placeholders only; real keys stay in Xroga vault. */
export async function buildProviderEnvFiles(
  userId: string
): Promise<Array<{ path: string; content: string }>> {
  const keys = await listUserProviderKeys(userId);
  if (!keys.length) return [];

  const lines = [
    '# API keys saved in your Xroga account (Integrations → AI)',
    '# Copy to .env.local for local dev. On Vercel: Project → Settings → Environment Variables.',
    '',
  ];
  for (const k of keys) {
    const varName = ENV_VAR_BY_PROVIDER[k.provider] ?? `${k.provider.toUpperCase()}_API_KEY`;
    lines.push(`${varName}=  # Connected in Xroga (${k.masked ?? 'saved'})`);
  }
  lines.push('');

  return [
    { path: '.env.example', content: lines.join('\n') },
    {
      path: 'AI_INTEGRATIONS.md',
      content: `# AI integrations

Keys below are stored encrypted in your **Xroga account** — not committed to GitHub.

${keys
  .map(
    (k) =>
      `- **${k.provider}** (${k.masked ?? 'connected'}) — set \`${ENV_VAR_BY_PROVIDER[k.provider] ?? `${k.provider.toUpperCase()}_API_KEY`}\` in Vercel env vars`
  )
  .join('\n')}

Paid APIs (Grok, DeepSeek, etc.): top up credits on the provider site, then your saved key works in generated code.
`,
    },
  ];
}

/** Resolve user BYOK key for runtime (build / inference). */
export async function getUserProviderKey(userId: string, provider: string): Promise<string | null> {
  const p = normalizeProvider(provider);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', `${PROVIDER_PREFIX}${p}`)
    .maybeSingle();

  if (error || !data?.access_token) return null;
  return decryptApiKey(data.access_token);
}
