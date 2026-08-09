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
  const repoName = githubRepoName?.trim();
  if (!repoName || !userId) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .eq('github_repo_name', repoName)
      .maybeSingle();
    if (error || !data) return null;
    return typeof data.id === 'string' ? data.id : null;
  } catch {
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
