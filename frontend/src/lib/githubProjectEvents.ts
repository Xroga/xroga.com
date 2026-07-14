/** Fired when a GitHub-linked project is saved or updated (sidebar refresh). */
export const GITHUB_PROJECT_SAVED_EVENT = 'xroga-github-project-saved';

/** Fired when user continues a project — RepoContextBar should reload repo. */
export const GITHUB_REPO_CONTEXT_EVENT = 'xroga-github-repo-context';

/** Fired after New Terminal — clear selection and open chatbar repo picker. */
export const OPEN_REPO_PICKER_EVENT = 'xroga-open-repo-picker';

/** Fired when repo selection was cleared (New Terminal). */
export const REPO_CONTEXT_CLEARED_EVENT = 'xroga-repo-context-cleared';

export function notifyGithubProjectSaved(projectId?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GITHUB_PROJECT_SAVED_EVENT, { detail: { projectId } }));
}

export function notifyGithubRepoContext(repo: string, branch = 'main'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(GITHUB_REPO_CONTEXT_EVENT, { detail: { repo, branch } }));
}

export function notifyOpenRepoPicker(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_REPO_PICKER_EVENT));
}

export function notifyRepoContextCleared(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REPO_CONTEXT_CLEARED_EVENT));
}
