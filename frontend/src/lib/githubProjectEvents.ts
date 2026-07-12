/** Fired when a GitHub-linked project is saved or updated (sidebar refresh). */
export const GITHUB_PROJECT_SAVED_EVENT = 'xroga-github-project-saved';

/** Fired when user continues a project — RepoContextBar should reload repo. */
export const GITHUB_REPO_CONTEXT_EVENT = 'xroga-github-repo-context';

export function notifyGithubProjectSaved(projectId?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GITHUB_PROJECT_SAVED_EVENT, { detail: { projectId } }));
}

export function notifyGithubRepoContext(repo: string, branch = 'main'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GITHUB_REPO_CONTEXT_EVENT, { detail: { repo, branch } }));
}
