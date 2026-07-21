/**
 * Repo workspace rule:
 * - GitHub code lives on GitHub
 * - Chat, images, research, builds live on Xroga under the selected repo
 *
 * Sticky default_repo is for updates only (applied by the chat layer when it
 * detects an update). This gate never silently binds the last product — that
 * caused multi-product wrong-repo ships.
 */

import { getSelectedRepoContext } from '@/lib/repoContext';
import { api } from '@/lib/api';
import { isGitHubConnectedSession } from '@/lib/xrogaBrand';

export type RepoWorkspaceReady =
  | { ok: true; repo: string; branch: string }
  | { ok: false; reason: 'not_connected' | 'no_repo_selected'; message: string };

function validSelectedRepo(
  selected: ReturnType<typeof getSelectedRepoContext>
): selected is { repo: string; branch: string } {
  return Boolean(selected?.repo && selected.repo.includes('/'));
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
      'Select a GitHub repository in the bar above. For a new product leave it clear or pick a fresh repo; for updates pick the live product.',
  };
}
