/**
 * Persist build output to projects + project_files so users and AI can access old code.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';
import { storeProjectFile } from '../storage/projectFiles.js';
import type { ProjectFile } from '../integrations/githubDeploy.js';

export interface UpsertBuildProjectInput {
  userId: string;
  name: string;
  type?: 'website' | 'app' | 'game' | 'research' | 'automation' | 'video';
  userPrompt: string;
  githubRepoUrl?: string;
  githubRepoName?: string;
  deployUrl?: string;
  projectFiles: ProjectFile[];
  runId?: string;
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
    status: 'active',
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

  const toStore = input.projectFiles.filter((f) => CORE_FILES.has(f.path) || f.path.startsWith('src/'));
  for (const file of toStore.slice(0, 24)) {
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
      metadata: { runId: input.runId, deployUrl: input.deployUrl, source: 'build' },
    });
  } catch {
    /* optional */
  }

  return projectId;
}
