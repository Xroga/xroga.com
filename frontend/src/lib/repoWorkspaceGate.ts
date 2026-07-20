/**
 * Repo workspace rule:
 * - GitHub code lives on GitHub
 * - Chat, images, research, builds live on Xroga under the selected repo
 *
 * After the first ship we persist default_repo — later prompts auto-bind to it
 * so updates change the live product without re-picking every time.
 */

import { getSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import { api } from '@/lib/api';
import { isGitHubConnectedSession } from '@/lib/xrogaBrand';
import { notifyGithubRepoContext } from '@/lib/githubProjectEvents';

export type RepoWorkspaceReady =
  | { ok: true; repo: string; branch: string }
  | { ok: false; reason: 'not_connected' | 'no_repo_selected'; message: string };

function validSelectedRepo(
  selected: ReturnType<typeof getSelectedRepoContext>
): selected is { repo: string; branch: string } {
  return Boolean(selected?.repo && selected.repo.includes('/'));
}

function bindStickyRepo(repo: string, branch = 'main'): RepoWorkspaceReady {
  saveSelectedRepoContext({ repo, branch });
  notifyGithubRepoContext(repo, branch);
  return { ok: true, repo, branch };
}

export async function checkRepoWorkspaceReady(): Promise<RepoWorkspaceReady> {
  const selected = getSelectedRepoContext();

  // Footer already has owner/repo — trust it. Status API flakiness must not block the user.
  if (validSelectedRepo(selected)) {
    try {
      const status = await api.github.status();
      if (status.connected || isGitHubConnectedSession()) {
        return { ok: true, repo: selected.repo, branch: selected.branch || 'main' };
      }
      console.warn('[repoWorkspaceGate] status.connected=false but selected repo present — allowing');
      return { ok: true, repo: selected.repo, branch: selected.branch || 'main' };
    } catch (err) {
      console.warn('[repoWorkspaceGate] status check failed; allowing selected repo', err);
      return { ok: true, repo: selected.repo, branch: selected.branch || 'main' };
    }
  }

  try {
    const status = await api.github.status();
    if (!status.connected && !isGitHubConnectedSession()) {
      return {
        ok: false,
        reason: 'not_connected',
        message:
          'Connect GitHub first. Your code can go to GitHub — chats, images, and research stay on Xroga under your selected repo.',
      };
    }
    // Sticky default from first ship / last pick — auto-bind so updates hit the live product.
    if (status.defaultRepo?.includes('/')) {
      return bindStickyRepo(status.defaultRepo, 'main');
    }
  } catch {
    if (isGitHubConnectedSession()) {
      return {
        ok: false,
        reason: 'no_repo_selected',
        message:
          'Select a GitHub repository in the bar above. Everything you do is kept under that repo on Xroga.',
      };
    }
    return {
      ok: false,
      reason: 'not_connected',
      message: 'Connect GitHub first so we can save your terminal work under a repository.',
    };
  }

  return {
    ok: false,
    reason: 'no_repo_selected',
    message:
      'Select a GitHub repository in the bar above (once). We remember it so later updates change the same live product.',
  };
}
