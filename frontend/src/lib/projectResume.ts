import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { api, type Project } from '@/lib/api';
import { saveSelectedRepoContext } from '@/lib/repoContext';
import { resumeToDashboard } from '@/lib/workspacePersistence';

/** Restore workspace + GitHub repo context so user continues exactly where they left off. */
export async function continueGithubProject(
  project: Project,
  router: AppRouterInstance,
  opts?: { branch?: string }
): Promise<void> {
  if (project.github_repo_name?.includes('/')) {
    saveSelectedRepoContext({
      repo: project.github_repo_name,
      branch: opts?.branch ?? 'main',
    });
  }

  let prompt = `Continue work on ${project.name}`;
  try {
    const detail = await api.projects.get(project.id);
    const lastUser = [...(detail.project_messages ?? [])]
      .reverse()
      .find((m) => m.role === 'user');
    if (lastUser?.content?.trim()) {
      prompt = lastUser.content.trim();
    }
  } catch {
    /* use default prompt */
  }

  const fixHint = project.github_repo_name
    ? `\n\nConnected repo: ${project.github_repo_name}. Analyze existing files, fix bugs/errors, and apply updates without rebuilding from scratch.`
    : '';

  resumeToDashboard({
    prompt: `${prompt}${fixHint}`,
    selectedId: project.id,
    selectedLabel: project.name,
    source: 'projects',
  });

  router.push('/dashboard');
}
