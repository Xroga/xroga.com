import { isWebsiteBuildPrompt } from './chatMemory';
import { requiresGitHubForBuild } from './messageHelpers';

/** A connected-app task needs its app authorization, not a GitHub repository. */
export function requiresRepoWorkspaceForPrompt(prompt: string): boolean {
  const text = prompt.trim();
  return Boolean(text && (isWebsiteBuildPrompt(text) || requiresGitHubForBuild(text)));
}
