import { getSupabaseAdmin } from '../../config/supabase.js';
import type { GitHubRepoStrategy } from './githubAuth.js';

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

async function ensurePrivateBucket(): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 8192,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    console.warn('[githubTokenStore] createBucket:', error.message);
  }
}

export async function saveGitHubTokenToStorage(
  userId: string,
  data: StoredGitHubAuth
): Promise<boolean> {
  try {
    await ensurePrivateBucket();
    const supabase = getSupabaseAdmin();
    const body = JSON.stringify(data);
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath(userId), body, {
      upsert: true,
      contentType: 'application/json',
    });
    if (error) {
      console.warn('[githubTokenStore] upload failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[githubTokenStore] save failed:', (err as Error).message);
    return false;
  }
}

export async function getGitHubTokenFromStorage(userId: string): Promise<StoredGitHubAuth | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(BUCKET).download(storagePath(userId));
    if (error || !data) return null;
    const text = await data.text();
    const parsed = JSON.parse(text) as StoredGitHubAuth;
    if (!parsed?.access_token?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function deleteGitHubTokenFromStorage(userId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.storage.from(BUCKET).remove([storagePath(userId)]);
  } catch {
    /* ignore */
  }
}

export { isMissingTableError };
