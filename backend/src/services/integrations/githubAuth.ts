import { getSupabaseAdmin } from '../../config/supabase.js';
import {
  getGitHubTokenFromStorage,
  isMissingTableError,
  saveGitHubTokenToStorage,
  deleteGitHubTokenFromStorage,
} from './githubTokenStore.js';

export type GitHubRepoStrategy = 'auto' | 'monorepo' | 'manual';

/** Existing authoritative rows, including empty-token revocations, precede legacy copies. */
export async function getGitHubToken(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: primary, error: primaryErr } = await supabase
    .from('github_integrations')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (primaryErr) return null;
  if (primary) return typeof primary.access_token === 'string' ? primary.access_token.trim() || null : null;

  const { data: legacy, error: legacyErr } = await supabase
    .from('user_integrations')
    .select('access_token, metadata')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .maybeSingle();

  if (legacyErr) return null;
  if (legacy) return legacy.metadata?.revoked === true ? null :
    typeof legacy.access_token === 'string' ? legacy.access_token.trim() || null : null;

  const stored = await getGitHubTokenFromStorage(userId);
  return stored?.access_token?.trim() ?? null;
}

export async function getGitHubStorageMeta(userId: string): Promise<{
  username?: string;
  repo_strategy?: GitHubRepoStrategy;
  default_repo?: string | null;
} | null> {
  if (!(await getGitHubToken(userId))) return null;
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
    authorizationRevision: string;
  }
): Promise<void> {
  const token = accessToken.trim();
  if (!token) throw new Error('Empty GitHub access token');

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.authorizationRevision)) {
    throw new Error('GitHub authorization revision required. Authorize again.');
  }
  const { data, error } = await getSupabaseAdmin().rpc('save_github_oauth_connection', {
    p_owner_id:userId,p_revision:opts.authorizationRevision,p_access_token:token,
    p_provider_user_id:opts.providerUserId,p_username:opts.username,
    p_repo_strategy:opts.repoStrategy??'auto',p_default_repo:opts.defaultRepo??null,
  });
  if (error) {
    throw new Error('GitHub connection could not be saved. Retry shortly.');
  }
  if (data !== true) throw new Error('GitHub connection changed during authorization. Authorize again.');
}

export async function clearGitHubConnection(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  // Both authority rows and the pending session revoke atomically.
  const { data, error } = await supabase.rpc('revoke_github_oauth_connection', {p_owner_id:userId});
  if (error || data !== true) throw new Error('GitHub revocation could not be recorded. Retry shortly.');
  const removed = await deleteGitHubTokenFromStorage(userId);
  if (!removed) throw new Error('GitHub disconnected, but legacy copy cleanup is pending. Retry shortly.');
}

/** Persist the live ship target so later updates auto-bind without re-picking. */
export async function setGithubDefaultRepo(userId: string, repoFullName: string): Promise<void> {
  const repo = repoFullName.trim();
  if (!repo.includes('/')) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('github_integrations')
    .update({ default_repo: repo, repo_strategy: 'manual' })
    .eq('user_id', userId);

  if (error && !isMissingTableError(error.message)) {
    console.warn('[githubAuth] default repository save failed');
  }

  const token = await getGitHubToken(userId);
  const stored = await getGitHubTokenFromStorage(userId);
  if (token) {
    await saveGitHubTokenToStorage(userId, {
      access_token: token,
      username: stored?.username ?? 'github-user',
      provider_user_id: stored?.provider_user_id ?? '',
      repo_strategy: 'manual',
      default_repo: repo,
      updated_at: new Date().toISOString(),
    }).catch(() => undefined);
  }
}
