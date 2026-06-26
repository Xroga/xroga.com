'use client';

import { useEffect, useState } from 'react';
import { X, GitBranch, Plus, ExternalLink, FolderGit2 } from 'lucide-react';
import { api } from '@/lib/api';

interface GithubRepoModalProps {
  open: boolean;
  onClose: () => void;
  onSelect?: (text: string) => void;
}

export function GithubRepoModal({ open, onClose, onSelect }: GithubRepoModalProps) {
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [defaultRepo, setDefaultRepo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.github
      .status()
      .then((s) => {
        setConnected(s.connected);
        setUsername(s.username ?? null);
        setDefaultRepo(s.defaultRepo ?? null);
      })
      .catch(() => setConnected(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function connect() {
    try {
      const { url } = await api.github.oauthUrl();
      window.location.href = url;
    } catch {
      window.location.href = '/dashboard/integrations';
    }
  }

  const repoLabel = defaultRepo ?? (username ? `${username}/repository` : 'No repo selected');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl modal-glass universe-fade-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-semibold">GitHub Repository</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {!connected ? (
            <>
              <p className="text-sm text-[var(--muted)]">Connect GitHub to push code and manage repositories.</p>
              <button
                type="button"
                onClick={connect}
                className="w-full py-3 rounded-xl bg-[var(--foreground)] text-[var(--background)] font-semibold text-sm hover:opacity-90 transition-opacity connect-pulse"
              >
                Connect GitHub
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                <FolderGit2 className="w-8 h-8 text-[var(--accent)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-[var(--muted)]">Active repository</p>
                  <p className="text-sm font-mono font-medium truncate">{repoLabel}</p>
                  {username && (
                    <p className="text-[10px] text-[var(--muted)] mt-0.5">@{username}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Create new repository', suffix: '[Create new GitHub repo: my-project] ' },
                  { label: 'Push to existing repo', suffix: `[Push to ${repoLabel}] ` },
                ].map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      onSelect?.(action.suffix);
                      onClose();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-left hover:bg-white/5 transition-colors"
                  >
                    <Plus className="w-4 h-4 text-[var(--muted)]" />
                    {action.label}
                  </button>
                ))}
                {username && (
                  <a
                    href={`https://github.com/${username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm hover:bg-white/5"
                  >
                    <ExternalLink className="w-4 h-4 text-[var(--muted)]" />
                    View on GitHub
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
