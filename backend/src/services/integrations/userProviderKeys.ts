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

/**
 * `.env.example` for repos — placeholders only.
 * Real keys stay AES-encrypted in the Xroga vault and are used via
 * `/api/integrations/live-ai/*` — never written into GitHub.
 */
export async function buildProviderEnvFiles(
  userId: string
): Promise<Array<{ path: string; content: string }>> {
  const keys = await listUserProviderKeys(userId);

  const lines = [
    '# ── Xroga AI keys ───────────────────────────────────────────',
    '# Paste values locally into .env.local (gitignored).',
    '# Keys you save in Xroga → Integrations are encrypted in your account',
    '# and used by the live preview proxy — they are NEVER committed here.',
    '',
    '# Free (no key): Pollinations text + images work in script.js out of the box.',
    '',
  ];
  const providers =
    keys.length > 0
      ? keys
      : Object.keys(ENV_VAR_BY_PROVIDER).map((provider) => ({
          provider,
          connected: false,
          masked: undefined as string | undefined,
        }));

  for (const k of providers) {
    const varName = ENV_VAR_BY_PROVIDER[k.provider] ?? `${k.provider.toUpperCase()}_API_KEY`;
    if (k.connected) {
      lines.push(`${varName}=  # ✓ saved encrypted in Xroga (${k.masked ?? '••••'}) — paste here only for local/Vercel`);
    } else {
      lines.push(`# ${varName}=  # optional — paste in Xroga Integrations (encrypted) or here for local`);
    }
  }
  lines.push('');

  const connected = keys.filter((k) => k.connected);
  return [
    { path: '.env.example', content: lines.join('\n') },
    {
      path: 'AI_INTEGRATIONS.md',
      content: `# AI integrations (free first + your encrypted keys)

## Already live in this project (no key)
- **Chat / text** — Pollinations free API (\`js/xroga-live-ai.js\`)
- **Images** — \`https://image.pollinations.ai/...\`
- **Voice** — browser Web Speech API
- **Web research during Xroga builds** — SearXNG (free, platform-side)

## Paste your API key (encrypted)
1. Open **[Xroga → Integrations → AI](https://xroga.com/dashboard/integrations)**
2. Find Groq / Gemini / OpenRouter / DeepSeek / etc.
3. Paste the key → **Save to Xroga**
4. Stored with **AES-256-GCM** in your account vault
5. Preview on xroga.com can call \`/api/integrations/live-ai/chat\` using your key — **secret never goes to GitHub**

${
  connected.length
    ? `### Keys connected in your account\n${connected
        .map(
          (k) =>
            `- **${k.provider}** (${k.masked ?? 'saved'}) → env \`${ENV_VAR_BY_PROVIDER[k.provider] ?? `${k.provider.toUpperCase()}_API_KEY`}\``
        )
        .join('\n')}`
    : '### No keys saved yet\nAdd one in Integrations to upgrade from free Pollinations to faster models.'
}

## Vercel production
Copy from \`.env.example\` into Vercel → Project → Settings → Environment Variables (optional).
Xroga preview does not need this if you saved keys in Integrations.
`,
    },
  ];
}

/** Decrypt vault keys for server-side deploy env sync only (never log values). */
export async function resolveProviderEnvForDeploy(
  userId: string
): Promise<Record<string, string>> {
  const keys = await listUserProviderKeys(userId);
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (!k.connected) continue;
    const plain = await getUserProviderKey(userId, k.provider);
    const varName = ENV_VAR_BY_PROVIDER[k.provider];
    if (plain && varName) out[varName] = plain;
  }
  return out;
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
