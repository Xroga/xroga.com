/**
 * Repo workspace rule:
 * - GitHub code lives on GitHub
 * - Chat, images, research, builds live on Xroga under the selected repo
 * Users should connect GitHub + select a repo before starting work.
 */

import { getSelectedRepoContext } from '@/lib/repoContext';
import { api } from '@/lib/api';

export type RepoWorkspaceReady =
  | { ok: true; repo: string; branch: string }
  | { ok: false; reason: 'not_connected' | 'no_repo_selected'; message: string };

export async function checkRepoWorkspaceReady(): Promise<RepoWorkspaceReady> {
  const selected = getSelectedRepoContext();
  try {
    const status = await api.github.status();
    if (!status.connected) {
      return {
        ok: false,
        reason: 'not_connected',
        message:
          'Connect GitHub first. Your code can go to GitHub — chats, images, and research stay on Xroga under your selected repo.',
      };
    }
    if (status.defaultRepo?.includes('/') && !selected?.repo) {
      // Soft prefer default repo — caller may auto-select
      return {
        ok: false,
        reason: 'no_repo_selected',
        message: `Select a repository (e.g. ${status.defaultRepo}) so this chat is saved under that project in Repositories.`,
      };
    }
  } catch {
    return {
      ok: false,
      reason: 'not_connected',
      message: 'Connect GitHub first so we can save your terminal work under a repository.',
    };
  }

  if (!selected?.repo?.includes('/')) {
    return {
      ok: false,
      reason: 'no_repo_selected',
      message:
        'Select a GitHub repository in the bar above. Everything you do (chat, research, images, builds) is kept under that repo on Xroga — only code is pushed to GitHub.',
    };
  }

  return { ok: true, repo: selected.repo, branch: selected.branch || 'main' };
}
