import { getSupabaseAdmin } from '../../config/supabase.js';
import type { GitHubRepoStrategy } from './githubAuth.js';
import { ensurePrivateOAuthBucket } from './credentialStorageBucket.js';

const BUCKET = 'xroga-github-tokens';

export interface StoredGitHubAuth {
  access_token: string;
  username: string;
  provider_user_id: string;
  repo_strategy: GitHubRepoStrategy;
  default_repo: string | null;
  updated_at: string;
}

function storagePath(userId: string): string {
  return `${userId}/github.json`;
}

function isMissingTableError(message: string): boolean {
  return /schema cache|could not find the table|does not exist|relation.*does not exist/i.test(
    message
  );
}

function isBucketMissingError(message: string): boolean {
  return /bucket not found|not found|does not exist/i.test(message);
}

export async function saveGitHubTokenToStorage(
  userId: string,
  data: StoredGitHubAuth
): Promise<boolean> {
  try {
    const ready = await ensurePrivateOAuthBucket();
    if (!ready) {
      console.warn('[githubTokenStore] bucket not available');
      return false;
    }

    const supabase = getSupabaseAdmin();
    const body = JSON.stringify(data);
    let { error } = await supabase.storage.from(BUCKET).upload(storagePath(userId), body, {
      upsert: true,
      contentType: 'application/json',
    });

    if (error && isBucketMissingError(error.message)) {
      if (!(await ensurePrivateOAuthBucket())) return false;
      ({ error } = await supabase.storage.from(BUCKET).upload(storagePath(userId), body, {
        upsert: true,
        contentType: 'application/json',
      }));
    }

    if (error) {
      console.warn('[githubTokenStore] upload failed');
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[githubTokenStore] save failed');
    return false;
  }
}

/** Null means authority denied/unavailable, empty string means legacy-only. */
async function currentGitHubAuthority(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const primary = await supabase.from('github_integrations').select('access_token').eq('user_id', userId).maybeSingle();
  if (primary.error) return null;
  if (primary.data) return typeof primary.data.access_token === 'string' ? primary.data.access_token.trim() || null : null;
  const legacy = await supabase.from('user_integrations').select('access_token, metadata')
    .eq('user_id', userId).eq('provider', 'github').maybeSingle();
  if (legacy.error) return null;
  if (legacy.data) return legacy.data.metadata?.revoked === true ? null
    : typeof legacy.data.access_token === 'string' ? legacy.data.access_token.trim() || null : null;
  return '';
}

export async function getGitHubTokenFromStorage(userId: string): Promise<StoredGitHubAuth | null> {
  try {
    if (await currentGitHubAuthority(userId) === null) return null;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath(userId));
    if (error || !data) return null;
    const text = await data.text();
    const parsed = JSON.parse(text) as StoredGitHubAuth;
    if (typeof parsed?.access_token !== 'string' || !parsed.access_token.trim()) return null;
    // A delayed mirror cannot override a disconnect/rotation, including one
    // committed while this download was in flight. Metadata is token-bound too.
    const authority = await currentGitHubAuthority(userId);
    if (authority === null || (authority !== '' && authority !== parsed.access_token.trim())) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function deleteGitHubTokenFromStorage(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(BUCKET).remove([storagePath(userId)]);
    return !error;
  } catch {
    return false;
  }
}

export { isMissingTableError };
