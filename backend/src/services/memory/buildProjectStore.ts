import { createHash } from 'node:crypto';
import { HACKATHON_MAX_STORED_FILES } from '../../config/modelRegistry.js';
import { getSupabaseAdmin } from '../../config/supabase.js';

/**
 * Persist build output to projects + project_files so users and AI can access old code.
 */
import { storeProjectFile } from '../storage/projectFiles.js';
import type { ProjectFile } from '../integrations/githubDeploy.js';

/**
 * Finds the project a build belongs to from the repository it targets.
 *
 * The client sends a project id only when the browser is on `/dashboard/projects/<id>`,
 * because that is the single place the id appears — it is parsed out of the URL. Builds
 * are typed into the terminal dock, which is present on every route, so a real build
 * usually arrives with no project id at all.
 *
 * That is fine for the legacy pipeline, which never asks. It is not fine for the
 * universal rollout: `routeProject` buckets on project id, so an absent id means a build
 * can never be allowlisted and never falls inside a percentage. Left alone, raising the
 * rollout to 50% would still route approximately nothing, because the identity it buckets
 * on is missing from most requests.
 *
 * Resolving from the target repository is not a fallback guess. `upsertBuildProject`
 * already treats `(user_id, github_repo_name)` as the identity of a project — this reads
 * the same key it writes, so the id recovered here is the id the build would be recorded
 * under when it completes.
 *
 * Returns null rather than throwing: a failed lookup must leave the build on the legacy
 * path, never break it.
 */
export async function findProjectIdByRepo(
  userId: string,
  githubRepoName: string | null | undefined,
): Promise<string | null> {
  const repoName = githubRepoName ? normalizeRepoIdentity(githubRepoName) : null;
  if (!repoName || !userId) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .ilike('github_repo_name', repoName)
      .maybeSingle();
    if (error || !data) return null;
    return typeof data.id === 'string' ? data.id : null;
  } catch {
    return null;
  }
}

function normalizeRepoIdentity(value: string): string | null {
  const normalized = value.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '').toLowerCase();
  return /^[^/\s]+\/[^/\s]+$/.test(normalized) ? normalized : null;
}

/**
 * Stable UUID for the repository-level persistence row.
 *
 * Branch and projectRoot remain part of the canonical ActiveProjectContext used by the
 * universal writer. The existing `projects` table is the repository container, so its id
 * is deliberately stable across branches while branch-specific files, commits and
 * checkpoints remain isolated by the full context key.
 */
export function projectIdentityId(userId: string, githubRepoName: string): string | null {
  const repoName = normalizeRepoIdentity(githubRepoName);
  if (!userId.trim() || !repoName) return null;
  const bytes = createHash('sha256').update(`${userId.trim()}\0${repoName}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Ensures a selected GitHub repository has the stable persistence identity required by
 * the universal writer before its first build.
 *
 * This is intentionally idempotent and generic. It does not inspect or classify the
 * repository. `type: app` only satisfies the legacy table constraint and is never used
 * to select a framework, language, capability or deployment path.
 */
export async function ensureProjectIdByRepo(
  userId: string,
  githubRepoName: string | null | undefined,
): Promise<string | null> {
  const repoName = githubRepoName ? normalizeRepoIdentity(githubRepoName) : null;
  if (!repoName || !userId.trim()) return null;

  const existing = await findProjectIdByRepo(userId, repoName);
  if (existing) return existing;

  const id = projectIdentityId(userId, repoName);
  if (!id) return null;
  const repoLabel = repoName.slice(repoName.indexOf('/') + 1);
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('projects')
      .upsert({
        id,
        user_id: userId,
        name: repoLabel.slice(0, 200),
        type: 'app',
        status: 'in_progress',
        github_repo_url: `https://github.com/${repoName}`,
        github_repo_name: repoName,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id')
      .maybeSingle();
    if (!error && typeof data?.id === 'string') return data.id;

    // `ignoreDuplicates` may return no row. Re-read the deterministic id so concurrent
    // first requests converge on the same project rather than falling back to legacy.
    const { data: persisted, error: readError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!readError && typeof persisted?.id === 'string') return persisted.id;
    console.warn('[buildProjectStore] ensure project identity:', error?.message ?? readError?.message ?? 'row unavailable');
    return null;
  } catch (error) {
    console.warn('[buildProjectStore] ensure project identity:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

export interface UpsertBuildProjectInput {
  userId: string;
  name: string;
  type?: 'website' | 'app' | 'game' | 'research' | 'automation' | 'video';
  userPrompt: string;
  githubRepoUrl?: string;
  githubRepoName?: string;
  githubBranch?: string;
  deployUrl?: string;
  projectFiles: ProjectFile[];
  runId?: string;
  summaryText?: string;
  isHackathon?: boolean;
}

const CORE_FILES = new Set([
  'index.html',
  'styles.css',
  'script.js',
  'package.json',
  'README.md',
]);

/** Upsert a project row and store core build files for later restore. */
export async function upsertBuildProject(input: UpsertBuildProjectInput): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const repoName = input.githubRepoName?.trim();

  let projectId: string | null = null;

  if (repoName) {
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', input.userId)
      .eq('github_repo_name', repoName)
      .maybeSingle();
    projectId = existing?.id ?? null;
  }

  const row = {
    name: input.name.slice(0, 200),
    type: input.type ?? 'website',
    status: 'completed',
    github_repo_url: input.githubRepoUrl ?? (repoName ? `https://github.com/${repoName}` : null),
    github_repo_name: repoName ?? null,
    updated_at: new Date().toISOString(),
  };

  if (projectId) {
    const { error } = await supabase.from('projects').update(row).eq('id', projectId).eq('user_id', input.userId);
    if (error) {
      console.warn('[buildProjectStore] update:', error.message);
      return null;
    }
  } else {
    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: input.userId, ...row })
      .select('id')
      .single();
    if (error || !data) {
      console.warn('[buildProjectStore] insert:', error?.message);
      return null;
    }
    projectId = data.id;
  }

  const maxFiles =
    input.isHackathon || input.type === 'research' || input.projectFiles.length > 40
      ? HACKATHON_MAX_STORED_FILES
      : 64;
  const toStore =
    input.isHackathon || input.projectFiles.length > 40
      ? input.projectFiles
      : input.projectFiles.filter(
          (f) =>
            CORE_FILES.has(f.path) ||
            f.path.startsWith('src/') ||
            f.path.startsWith('contracts/') ||
            f.path.startsWith('apps/') ||
            f.path.includes('/')
        );
  for (const file of toStore.slice(0, maxFiles)) {
    try {
      await storeProjectFile(
        input.userId,
        projectId!,
        file.path.replace(/\//g, '_'),
        file.content,
        file.path.endsWith('.json') ? 'application/json' : 'text/plain',
        'code'
      );
    } catch (err) {
      console.warn('[buildProjectStore] file', file.path, (err as Error).message);
    }
  }

  try {
    await supabase.from('project_messages').insert({
      project_id: projectId,
      role: 'user',
      content: input.userPrompt.slice(0, 8000),
      metadata: {
        runId: input.runId,
        deployUrl: input.deployUrl,
        githubRepoName: repoName,
        githubBranch: input.githubBranch ?? 'main',
        source: 'build',
      },
    });
    if (input.summaryText?.trim()) {
      await supabase.from('project_messages').insert({
        project_id: projectId,
        role: 'assistant',
        content: input.summaryText.slice(0, 12_000),
        metadata: { deployUrl: input.deployUrl, githubRepoName: repoName, source: 'build_summary' },
      });
    }
  } catch {
    /* optional */
  }

  return projectId;
}
