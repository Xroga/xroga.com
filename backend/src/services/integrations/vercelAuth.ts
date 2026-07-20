import { getSupabaseAdmin } from '../../config/supabase.js';
import { isMissingTableError } from './githubTokenStore.js';

export async function getVercelToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'vercel')
    .maybeSingle();

  if (error && !isMissingTableError(error.message)) {
    console.warn('[vercelAuth] lookup:', error.message);
  }

  return data?.access_token?.trim() ?? null;
}

export async function getVercelUsername(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('user_integrations')
    .select('metadata')
    .eq('user_id', userId)
    .eq('provider', 'vercel')
    .maybeSingle();
  const meta = data?.metadata as { username?: string } | null;
  return meta?.username?.trim() ?? null;
}

export async function isVercelConnected(userId: string): Promise<boolean> {
  const token = await getVercelToken(userId);
  return Boolean(token);
}

export async function saveVercelConnection(
  userId: string,
  accessToken: string,
  meta: { username?: string; providerUserId?: string }
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const row = {
    user_id: userId,
    provider: 'vercel',
    access_token: accessToken,
    provider_user_id: meta.providerUserId ?? null,
    metadata: { username: meta.username ?? 'vercel-user' },
  };

  const { error } = await supabase.from('user_integrations').upsert(row, {
    onConflict: 'user_id,provider',
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function clearVercelConnection(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('user_integrations').delete().eq('user_id', userId).eq('provider', 'vercel');
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
