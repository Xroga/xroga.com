'use client';

import { useEffect, useState } from 'react';
import { GitBranch, X } from 'lucide-react';
import { api, type GitHubRepo } from '@/lib/api';
import { saveSelectedRepoContext } from '@/lib/repoContext';
import { notifyGithubRepoContext } from '@/lib/githubProjectEvents';
import { ensureSelectedRepoFolder } from '@/lib/repoSessionsIndex';
import { cn } from '@/lib/utils';

interface RepoWorkspaceGateModalProps {
  open: boolean;
  reason: 'not_connected' | 'no_repo_selected';
  message: string;
  onClose: () => void;
  onReady: () => void;
}

/**
 * Connect GitHub + select a repo before chat/build/images.
 * Code → GitHub; chats/research/images → Xroga under that selected repo.
 */
export function RepoWorkspaceGateModal({
  open,
  reason,
  message,
  onClose,
  onReady,
}: RepoWorkspaceGateModalProps) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [step, setStep] = useState<'connect' | 'select'>(
    reason === 'not_connected' ? 'connect' : 'select'
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStep(reason === 'not_connected' ? 'connect' : 'select');
    if (reason === 'no_repo_selected') {
      void loadRepos();
    }
  }, [open, reason]);

  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const res = await api.github.listRepos();
      setRepos(Array.isArray(res.repos) ? res.repos.slice(0, 30) : []);
    } catch {
      setRepos([]);
      setError('Could not load repositories. Open GitHub in the chat bar to retry.');
    } finally {
      setLoadingRepos(false);
    }
  }

  async function connectGithub() {
    setConnecting(true);
    setError(null);
    try {
      const { url } = await api.github.oauthUrl();
      const popup = window.open(url, 'xroga-github-oauth', 'width=600,height=700,scrollbars=yes');
      if (!popup) {
        setError('Allow popups to connect GitHub.');
        setConnecting(false);
        return;
      }
      const poll = setInterval(async () => {
        try {
          const status = await api.github.status();
          if (status.connected) {
            clearInterval(poll);
            try {
              popup.close();
            } catch {
              /* ignore */
            }
            setConnecting(false);
            setStep('select');
            void loadRepos();
          } else if (popup.closed) {
            clearInterval(poll);
            setConnecting(false);
            setError('GitHub connection was not completed.');
          }
        } catch {
          /* keep polling */
        }
      }, 900);
    } catch (err) {
      setError((err as Error).message || 'Could not start GitHub connect');
      setConnecting(false);
    }
  }

  function pickRepo(fullName: string, branch: string) {
    saveSelectedRepoContext({ repo: fullName, branch: branch || 'main' });
    notifyGithubRepoContext(fullName, branch || 'main');
    ensureSelectedRepoFolder();
    onReady();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-[#12141a] text-white shadow-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-[#006aff]" />
            <h2 className="text-base font-bold">
              {step === 'connect' ? 'Connect GitHub to start' : 'Select a repository'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-white/10" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-white/80 leading-relaxed overflow-y-auto">
          <p>{message}</p>
          <ul className="text-[12px] space-y-1.5 text-white/60 list-disc pl-4">
            <li>
              <span className="text-white/85">Code</span> can push to your GitHub repo
            </li>
            <li>
              <span className="text-white/85">Chats, research, images</span> stay on Xroga under that
              selected repo — open Repositories anytime to continue where you left off
            </li>
          </ul>
          {error ? <p className="text-red-400 text-xs">{error}</p> : null}

          {step === 'select' ? (
            <div className="space-y-1 pt-1">
              {loadingRepos ? (
                <p className="text-xs text-white/50">Loading your repositories…</p>
              ) : repos.length === 0 ? (
                <p className="text-xs text-white/50">No repos found. Create one on GitHub, then retry.</p>
              ) : (
                repos.map((r) => (
                  <button
                    key={r.fullName}
                    type="button"
                    onClick={() => pickRepo(r.fullName, r.defaultBranch || 'main')}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-[12px] font-mono',
                      'bg-white/5 hover:bg-[#006aff]/20 border border-transparent hover:border-[#006aff]/40'
                    )}
                  >
                    {r.fullName}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 px-5 pb-5 shrink-0">
          {step === 'connect' ? (
            <button
              type="button"
              disabled={connecting}
              onClick={() => void connectGithub()}
              className="px-4 py-2 rounded-lg bg-[#006aff] text-white text-sm font-bold hover:opacity-95 disabled:opacity-60"
            >
              {connecting ? 'Connecting…' : 'Connect GitHub'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/20 text-sm text-white/80 hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
