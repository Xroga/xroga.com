'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Loader2, Code2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import { api, type GitHubStatus } from '@/lib/api';
import { dispatchGitHubConnected } from '@/lib/githubEvents';
import 'react-loading-skeleton/dist/skeleton.css';

type RepoStrategy = 'auto' | 'monorepo' | 'manual';

export function GitHubConnect() {
  const router = useRouter();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [repoStrategy, setRepoStrategy] = useState<RepoStrategy>('auto');
  const [defaultRepo, setDefaultRepo] = useState('');
  const searchParams = useSearchParams();

  useEffect(() => {
    api.github.status()
      .then((s) => {
        setStatus(s);
        if (s.repoStrategy) setRepoStrategy(s.repoStrategy as RepoStrategy);
        if (s.defaultRepo) setDefaultRepo(s.defaultRepo);
      })
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code && !status?.connected) {
      setConnecting(true);
      api.github.connect(code, repoStrategy, defaultRepo || undefined)
        .then((res) => {
          dispatchGitHubConnected(res.username);
          router.replace(
            `/workspace?github=connected&username=${encodeURIComponent(res.username)}`
          );
        })
        .catch((e) => toast.error((e as Error).message))
        .finally(() => setConnecting(false));
    }
  }, [searchParams, status?.connected, repoStrategy, defaultRepo, router]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const { url } = await api.github.oauthUrl();
      if (!url) {
        toast.error('GitHub OAuth not configured');
        setConnecting(false);
        return;
      }
      const popup = window.open(url, 'xroga-github-oauth', 'width=600,height=720,scrollbars=yes');
      if (!popup) {
        window.location.href = url;
        return;
      }
      try {
        popup.focus();
      } catch {
        /* ignore */
      }
      setConnecting(false);
    } catch (e) {
      toast.error((e as Error).message);
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await api.github.disconnect();
      setStatus({ connected: false });
      toast.success('GitHub disconnected');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleSaveStrategy() {
    try {
      await api.github.updateSettings(repoStrategy, defaultRepo || undefined);
      toast.success('Repository strategy saved');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) return <Skeleton height={200} baseColor="#1a1a2e" highlightColor="#2a2a3e" />;

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
            <Code2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold">GitHub</h3>
            {status?.connected ? (
              <p className="text-sm text-blue-400 flex items-center gap-1">
                <Check className="w-4 h-4" /> Connected as @{status.username}
              </p>
            ) : (
              <p className="text-sm text-[var(--muted)]">Not connected</p>
            )}
          </div>
        </div>

        {status?.connected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            className="text-sm text-red-400 hover:underline"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-200 text-sm font-medium disabled:opacity-50"
          >
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Code2 className="w-4 h-4" />}
            Connect GitHub
          </button>
        )}
      </div>

      {status?.connected && (
        <div className="space-y-4 pt-4 border-t border-[var(--card-border)]">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-2">Repository Strategy</label>
            <select
              value={repoStrategy}
              onChange={(e) => setRepoStrategy(e.target.value as RepoStrategy)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
            >
              <option value="auto">Auto-Create (Recommended) — new repo per project</option>
              <option value="monorepo">Single Monorepo — all projects in one repo</option>
              <option value="manual">Ask Me Every Time</option>
            </select>
          </div>

          {repoStrategy === 'monorepo' && (
            <div>
              <label className="block text-sm text-[var(--muted)] mb-2">Monorepo Name</label>
              <input
                value={defaultRepo}
                onChange={(e) => setDefaultRepo(e.target.value)}
                placeholder="xroga-workspace"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleSaveStrategy}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm"
          >
            Save Strategy
          </button>
        </div>
      )}
    </div>
  );
}
