import { getSupabaseAdmin } from '../../config/supabase.js';
import { ensureGithubSchema } from '../../db/ensureGithubSchema.js';

export type GitHubRepoStrategy = 'auto' | 'monorepo' | 'manual';

function isMissingTableError(message: string): boolean {
  return /schema cache|could not find the table|does not exist|relation.*does not exist/i.test(
    message
  );
}

/** Load GitHub token — github_integrations first, optional user_integrations fallback */
export async function getGitHubToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: primary, error: primaryErr } = await supabase
    .from('github_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (primaryErr && !isMissingTableError(primaryErr.message)) {
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
    if (!isMissingTableError(legacyErr.message)) {
      console.warn('[githubAuth] user_integrations lookup:', legacyErr.message);
    }
    return null;
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

  if (syncErr && !isMissingTableError(syncErr.message)) {
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

  await ensureGithubSchema();

  let { error: ghErr } = await supabase.from('github_integrations').upsert(
    {
      user_id: userId,
      access_token: token,
      repo_strategy: repoStrategy,
      default_repo: defaultRepo,
    },
    { onConflict: 'user_id' }
  );

  if (ghErr && isMissingTableError(ghErr.message)) {
    const bootstrapped = await ensureGithubSchema();
    if (bootstrapped) {
      ({ error: ghErr } = await supabase.from('github_integrations').upsert(
        {
          user_id: userId,
          access_token: token,
          repo_strategy: repoStrategy,
          default_repo: defaultRepo,
        },
        { onConflict: 'user_id' }
      ));
    }
  }

  if (ghErr) {
    if (isMissingTableError(ghErr.message)) {
      throw new Error(
        'GitHub storage is not ready yet. Ask your admin to run scripts/apply-github-integration-migration.mjs or paste supabase/migrations/020_user_integrations.sql in Supabase SQL Editor, then try Connect again.'
      );
    }
    throw new Error(`Failed to save GitHub connection: ${ghErr.message}`);
  }

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

  if (userErr && !isMissingTableError(userErr.message)) {
    console.warn('[githubAuth] optional user_integrations save:', userErr.message);
  }
}
