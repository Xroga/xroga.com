import { getSupabaseAdmin } from '../../config/supabase.js';
import { ensureGithubSchema } from '../../db/ensureGithubSchema.js';
import {
  getGitHubTokenFromStorage,
  isMissingTableError,
  saveGitHubTokenToStorage,
  deleteGitHubTokenFromStorage,
} from './githubTokenStore.js';

export type GitHubRepoStrategy = 'auto' | 'monorepo' | 'manual';

/** Load GitHub token — DB tables first, then private Storage fallback */
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

  if (!legacyErr) {
    const legacyToken = legacy?.access_token?.trim();
    if (legacyToken) return legacyToken;
  } else if (!isMissingTableError(legacyErr.message)) {
    console.warn('[githubAuth] user_integrations lookup:', legacyErr.message);
  }

  const stored = await getGitHubTokenFromStorage(userId);
  return stored?.access_token?.trim() ?? null;
}

export async function getGitHubStorageMeta(userId: string): Promise<{
  username?: string;
  repo_strategy?: GitHubRepoStrategy;
  default_repo?: string | null;
} | null> {
  const stored = await getGitHubTokenFromStorage(userId);
  if (!stored) return null;
  return {
    username: stored.username,
    repo_strategy: stored.repo_strategy,
    default_repo: stored.default_repo,
  };
}

export async function isGitHubConnected(userId: string, retries = 3): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const token = await getGitHubToken(userId);
    if (token) return true;
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
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

  const storagePayload = {
    access_token: token,
    username: opts.username,
    provider_user_id: opts.providerUserId,
    repo_strategy: repoStrategy,
    default_repo: defaultRepo,
    updated_at: new Date().toISOString(),
  };

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
    await ensureGithubSchema();
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

  if (!ghErr) {
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
    return;
  }

  if (!isMissingTableError(ghErr.message)) {
    throw new Error(`Failed to save GitHub connection: ${ghErr.message}`);
  }

  const stored = await saveGitHubTokenToStorage(userId, storagePayload);
  if (!stored) {
    throw new Error(
      'Could not save your GitHub connection. Please try again in a moment or contact support.'
    );
  }
  console.log('[githubAuth] Saved GitHub token via Storage fallback for user', userId.slice(0, 8));
}

export async function clearGitHubConnection(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('github_integrations').delete().eq('user_id', userId);
  await supabase
    .from('user_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'github');
  await deleteGitHubTokenFromStorage(userId);
}
