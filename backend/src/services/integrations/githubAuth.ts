import { getSupabaseAdmin } from '../../config/supabase.js';

export type GitHubRepoStrategy = 'auto' | 'monorepo' | 'manual';

/** Load GitHub token — github_integrations first, then user_integrations with sync */
export async function getGitHubToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: primary, error: primaryErr } = await supabase
    .from('github_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (primaryErr) {
    console.warn('[githubAuth] github_integrations lookup:', primaryErr.message);
  }

  const primaryToken = primary?.access_token?.trim();
  if (primaryToken) return primaryToken;

  const { data: legacy, error: legacyErr } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .maybeSingle();

  if (legacyErr) {
    console.warn('[githubAuth] user_integrations lookup:', legacyErr.message);
  }

  const legacyToken = legacy?.access_token?.trim();
  if (!legacyToken) return null;

  const { error: syncErr } = await supabase.from('github_integrations').upsert(
    {
      user_id: userId,
      access_token: legacyToken,
      repo_strategy: 'auto',
      default_repo: null,
    },
    { onConflict: 'user_id' }
  );

  if (syncErr) {
    console.warn('[githubAuth] sync legacy token:', syncErr.message);
  }

  return legacyToken;
}

export async function isGitHubConnected(userId: string, retries = 3): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const token = await getGitHubToken(userId);
    if (token) return true;
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  console.warn('[githubAuth] no token for user', userId.slice(0, 8));
  return false;
}

export async function saveGitHubConnection(
  userId: string,
  accessToken: string,
  opts: {
    providerUserId: string;
    username: string;
    repoStrategy?: GitHubRepoStrategy;
    defaultRepo?: string | null;
  }
): Promise<void> {
  const token = accessToken.trim();
  if (!token) throw new Error('Empty GitHub access token');

  const supabase = getSupabaseAdmin();
  const repoStrategy = opts.repoStrategy ?? 'auto';
  const defaultRepo = opts.defaultRepo ?? null;

  const { error: userErr } = await supabase.from('user_integrations').upsert(
    {
      user_id: userId,
      provider: 'github',
      access_token: token,
      provider_user_id: opts.providerUserId,
      metadata: { username: opts.username },
    },
    { onConflict: 'user_id,provider' }
  );

  if (userErr) {
    throw new Error(`Failed to save GitHub integration: ${userErr.message}`);
  }

  const { error: ghErr } = await supabase.from('github_integrations').upsert(
    {
      user_id: userId,
      access_token: token,
      repo_strategy: repoStrategy,
      default_repo: defaultRepo,
    },
    { onConflict: 'user_id' }
  );

  if (ghErr) {
    throw new Error(`Failed to save GitHub settings: ${ghErr.message}`);
  }
}
