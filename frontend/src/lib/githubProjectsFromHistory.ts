import type { Project } from '@/lib/api';
import type { TerminalHistoryEntry } from '@/lib/terminalHistory';

/** Show GitHub-linked builds from local terminal history when DB project row is missing. */
export function githubProjectsFromHistory(
  history: TerminalHistoryEntry[],
  existing: Project[]
): Project[] {
  const knownRepos = new Set(
    existing.map((p) => p.github_repo_name?.toLowerCase()).filter(Boolean) as string[]
  );

  const fromHistory: Project[] = [];

  for (const h of history) {
    const repo = h.githubRepoName?.trim();
    if (!repo?.includes('/')) continue;
    const key = repo.toLowerCase();
    if (knownRepos.has(key)) continue;
    knownRepos.add(key);

    fromHistory.push({
      id: `history-${h.id}`,
      name: h.title.slice(0, 120) || repo.split('/').pop() || 'GitHub project',
      type: 'website',
      status: 'active',
      actions_used: 0,
      github_repo_url: h.githubRepoUrl ?? `https://github.com/${repo}`,
      github_repo_name: repo,
      created_at: h.createdAt,
      updated_at: h.updatedAt,
    });
  }

  fromHistory.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return fromHistory;
}

export function mergeGithubProjects(remote: Project[], history: TerminalHistoryEntry[]): Project[] {
  const merged = [...remote, ...githubProjectsFromHistory(history, remote)];
  merged.sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
  return merged;
}
