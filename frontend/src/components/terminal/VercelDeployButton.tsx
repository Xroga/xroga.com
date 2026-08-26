'use client';

import { useEffect, useState } from 'react';
import { Loader2, Rocket, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import toast from 'react-hot-toast';

interface VercelDeployButtonProps {
  html: string;
  css: string;
  js: string;
  projectSlug: string;
  projectName: string;
  onDeployed?: (url: string) => void;
}

export function VercelDeployButton({
  html,
  css,
  js,
  projectSlug,
  projectName,
  onDeployed,
}: VercelDeployButtonProps) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);
  const applyBuild = useProjectWorkspaceStore((s) => s.applyBuild);
  const storeDeployUrl = useProjectWorkspaceStore((s) => s.deployUrl);

  useEffect(() => {
    void api.vercel
      .status()
      .then((s) => {
        setConnected(Boolean(s.managedDeployAvailable || (s.connected && s.canDeploy === true)));
        setUsername(s.username ?? null);
        setConnectionWarning(s.warning ?? null);
      })
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    if (storeDeployUrl?.includes('vercel.app')) setLiveUrl(storeDeployUrl);
  }, [storeDeployUrl]);

  async function runDeploy(): Promise<boolean> {
    if (!html?.trim()) {
      toast.error('No site HTML to deploy — open Preview first or rebuild');
      return false;
    }
    setDeploying(true);
    try {
      let preferredSlug = '';
      let preferredTeamId = '';
      try {
        preferredSlug = localStorage.getItem('xroga_vercel_preferred_project')?.trim() || '';
        preferredTeamId = localStorage.getItem('xroga_vercel_preferred_team_id')?.trim() || '';
      } catch {
        /* ignore */
      }
      const slug = preferredSlug || projectSlug;
      const result = await api.vercel.deploy({
        html,
        css,
        js,
        projectSlug: slug,
        projectName: preferredSlug || projectName,
        teamId: preferredTeamId || undefined,
      });
      if (result.deployUrl) {
        setLiveUrl(result.deployUrl);
        applyBuild({
          html,
          css,
          js,
          projectName,
          deployUrl: result.deployUrl,
          status: 'live',
          openPreview: true,
        });
        toast.success('Live on Vercel');
        onDeployed?.(result.deployUrl);
        return true;
      }
      toast.error(result.error ?? 'Deploy failed');
      return false;
    } catch (err) {
      const msg = (err as Error).message?.slice(0, 160) || 'Deploy failed';
      if (/publishing.*unavailable|not configured/i.test(msg)) {
        setConnected(false);
        setConnectionWarning('Managed Vercel publishing is temporarily unavailable.');
        toast.error('Managed Vercel publishing is unavailable');
      } else {
        toast.error(msg);
      }
      return false;
    } finally {
      setDeploying(false);
    }
  }

  async function deploy() {
    if (!connected) return;
    await runDeploy();
  }

  if (liveUrl) {
    return (
      <a
        href={liveUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={username ? `Open @${username} Vercel preview` : 'Open Vercel preview'}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#006aff]/35 bg-[#006aff]/10 text-[#006aff] text-xs font-bold hover:bg-[#006aff]/15 transition-colors"
      >
        <Rocket className="w-4 h-4" />
        Vercel preview
      </a>
    );
  }

  return (
    <div className="inline-flex flex-col gap-2 max-w-full">
      <button
        type="button"
        onClick={() => void deploy()}
        disabled={deploying || connected !== true}
        title={
          connected
            ? username
              ? `Deploy with Vercel · connected as @${username}`
              : 'Deploy through Xroga managed Vercel'
            : 'Managed Vercel publishing is unavailable'
        }
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-black text-white dark:bg-white dark:text-black text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {deploying ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : connected === false ? (
          <TriangleAlert className="w-4 h-4" />
        ) : (
          <Rocket className="w-4 h-4" />
        )}
        {deploying
          ? 'Deploying…'
          : connected
              ? 'Deploy to Vercel'
              : 'Vercel unavailable'}
      </button>

      {connected === false || connectionWarning ? (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 space-y-2 min-w-[240px] max-w-[320px]">
          <p className="text-[10px] text-[var(--muted)] leading-relaxed">
            {connectionWarning ||
              'Xroga publishes through its managed Vercel authority. No personal token is required or accepted.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
