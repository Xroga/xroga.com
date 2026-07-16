'use client';

import { useEffect, useState } from 'react';
import { Loader2, Rocket, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { listenVercelOAuthMessages, openVercelOAuthPopup } from '@/lib/vercelConnect';
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
  const applyBuild = useProjectWorkspaceStore((s) => s.applyBuild);
  const storeDeployUrl = useProjectWorkspaceStore((s) => s.deployUrl);

  useEffect(() => {
    void api.vercel
      .status()
      .then((s) => {
        setConnected(s.connected);
        setUsername(s.username ?? null);
      })
      .catch(() => setConnected(false));

    const stop = listenVercelOAuthMessages(
      (name) => {
        setConnected(true);
        setUsername(name ?? null);
        toast.success(name ? `Vercel connected as @${name}` : 'Vercel connected');
      },
      (msg) => toast.error(msg)
    );
    return stop;
  }, []);

  useEffect(() => {
    if (storeDeployUrl?.includes('vercel.app')) setLiveUrl(storeDeployUrl);
  }, [storeDeployUrl]);

  async function connectVercel(): Promise<boolean> {
    const result = await openVercelOAuthPopup();
    if (!result.opened) {
      toast.error(result.error || 'Could not open Vercel authorization');
      return false;
    }
    toast('Complete authorization in the Vercel window…', { icon: '▲' });
    return new Promise((resolve) => {
      const started = Date.now();
      const poll = setInterval(async () => {
        try {
          const status = await api.vercel.status();
          if (status.connected) {
            clearInterval(poll);
            setConnected(true);
            setUsername(status.username ?? null);
            toast.success('Vercel connected');
            resolve(true);
            return;
          }
        } catch {
          /* keep polling */
        }
        if (Date.now() - started > 120_000) {
          clearInterval(poll);
          toast.error('Vercel authorization timed out — try again');
          resolve(false);
        }
      }, 900);
    });
  }

  async function deploy() {
    if (!connected) {
      const ok = await connectVercel();
      if (!ok) return;
    }
    setDeploying(true);
    try {
      const result = await api.vercel.deploy({
        html,
        css,
        js,
        projectSlug,
        projectName,
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
        toast.success('Live on your Vercel domain');
        onDeployed?.(result.deployUrl);
      } else {
        toast.error(result.error ?? 'Deploy failed');
      }
    } catch (err) {
      toast.error((err as Error).message?.slice(0, 140) || 'Deploy failed');
    } finally {
      setDeploying(false);
    }
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
    <button
      type="button"
      onClick={() => void deploy()}
      disabled={deploying}
      title={connected ? `Deploy as @${username ?? 'you'}` : 'Authorize Vercel, then deploy to your account'}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-black text-white dark:bg-white dark:text-black text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {deploying ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : connected === false ? (
        <TriangleAlert className="w-4 h-4" />
      ) : (
        <Rocket className="w-4 h-4" />
      )}
      {deploying ? 'Deploying…' : connected ? 'Deploy to Vercel' : 'Authorize Vercel & deploy'}
    </button>
  );
}
