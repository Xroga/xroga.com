'use client';

import { useEffect, useState } from 'react';
import { Loader2, Rocket, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
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

  useEffect(() => {
    void api.vercel.status().then((s) => {
      setConnected(s.connected);
      setUsername(s.username ?? null);
    }).catch(() => setConnected(false));

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'xroga-vercel-connected') {
        setConnected(true);
        setUsername(typeof e.data.username === 'string' ? e.data.username : null);
        toast.success('Vercel connected');
      }
      if (e.data?.type === 'xroga-vercel-error') {
        toast.error(typeof e.data.message === 'string' ? e.data.message : 'Vercel connection failed');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function connectVercel() {
    try {
      const { url, oauthConfigured } = await api.vercel.oauthUrl();
      if (!url || !oauthConfigured) {
        toast.error('Open Integrations → paste your Vercel token from vercel.com/account/tokens');
        return;
      }
      const popup = window.open(url, 'xroga-vercel-oauth', 'width=600,height=700,scrollbars=yes');
      if (!popup) {
        toast.error('Allow popups to connect Vercel');
        return;
      }
      const poll = setInterval(async () => {
        if (popup.closed) {
          clearInterval(poll);
          const status = await api.vercel.status().catch(() => ({ connected: false, username: undefined }));
          setConnected(status.connected);
          setUsername(status.username ?? null);
          if (status.connected) toast.success('Vercel connected');
        }
      }, 800);
    } catch (err) {
      toast.error((err as Error).message || 'Vercel OAuth not configured');
    }
  }

  async function deploy() {
    if (!connected) {
      await connectVercel();
      return;
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
        toast.success('Deployed to your Vercel account');
        onDeployed?.(result.deployUrl);
      } else {
        toast.error(result.error ?? 'Deploy failed');
      }
    } catch (err) {
      toast.error((err as Error).message?.slice(0, 120) || 'Deploy failed');
    } finally {
      setDeploying(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void deploy()}
      disabled={deploying}
      title={connected ? `Deploy as @${username ?? 'you'}` : 'Connect Vercel to deploy to your account'}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-black text-white dark:bg-white dark:text-black text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {deploying ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : connected === false ? (
        <TriangleAlert className="w-4 h-4" />
      ) : (
        <Rocket className="w-4 h-4" />
      )}
      {deploying ? 'Deploying…' : connected ? 'Deploy to Vercel' : 'Connect Vercel & deploy'}
    </button>
  );
}
