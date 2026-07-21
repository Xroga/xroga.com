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
  const [connecting, setConnecting] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
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
        setShowTokenForm(false);
        toast.success(name ? `Vercel connected as @${name}` : 'Vercel connected');
      },
      (msg) => toast.error(msg)
    );
    return stop;
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
      try {
        preferredSlug = localStorage.getItem('xroga_vercel_preferred_project')?.trim() || '';
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
        return true;
      }
      toast.error(result.error ?? 'Deploy failed');
      return false;
    } catch (err) {
      const msg = (err as Error).message?.slice(0, 160) || 'Deploy failed';
      if (/connect vercel|403|not connected/i.test(msg)) {
        setConnected(false);
        setShowTokenForm(true);
        toast.error('Connect Vercel first — authorize or paste a token below');
      } else {
        toast.error(msg);
      }
      return false;
    } finally {
      setDeploying(false);
    }
  }

  async function connectVercel(): Promise<boolean> {
    setConnecting(true);
    try {
      const result = await openVercelOAuthPopup();
      if (!result.opened) {
        setShowTokenForm(true);
        toast.error(result.error || 'Could not open Vercel authorization');
        return false;
      }
      toast('Complete authorization in the Vercel window…', { icon: '▲' });
      return await new Promise((resolve) => {
        const started = Date.now();
        const poll = setInterval(async () => {
          try {
            const status = await api.vercel.status();
            if (status.connected) {
              clearInterval(poll);
              setConnected(true);
              setUsername(status.username ?? null);
              setShowTokenForm(false);
              toast.success('Vercel connected');
              resolve(true);
              return;
            }
          } catch {
            /* keep polling */
          }
          if (Date.now() - started > 120_000) {
            clearInterval(poll);
            setShowTokenForm(true);
            toast.error('Vercel authorization timed out — paste a token below');
            resolve(false);
          }
        }, 900);
      });
    } finally {
      setConnecting(false);
    }
  }

  async function connectWithToken() {
    const token = tokenInput.trim();
    if (token.length < 12) {
      toast.error('Paste a Vercel personal access token from vercel.com/account/tokens');
      return;
    }
    setConnecting(true);
    try {
      const result = await api.vercel.connectToken(token);
      setConnected(true);
      setUsername(result.username ?? null);
      setShowTokenForm(false);
      setTokenInput('');
      toast.success(result.username ? `Vercel connected as @${result.username}` : 'Vercel connected');
      await runDeploy();
    } catch (err) {
      toast.error((err as Error).message?.slice(0, 140) || 'Token connect failed');
    } finally {
      setConnecting(false);
    }
  }

  async function deploy() {
    if (!connected) {
      const ok = await connectVercel();
      if (!ok) return;
    }
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
        disabled={deploying || connecting}
        title={
          connected
            ? `Deploy as @${username ?? 'you'}`
            : 'Authorize Vercel, then deploy to your account'
        }
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-black text-white dark:bg-white dark:text-black text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {deploying || connecting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : connected === false ? (
          <TriangleAlert className="w-4 h-4" />
        ) : (
          <Rocket className="w-4 h-4" />
        )}
        {deploying
          ? 'Deploying…'
          : connecting
            ? 'Connecting…'
            : connected
              ? 'Deploy to Vercel'
              : 'Authorize Vercel & deploy'}
      </button>

      {showTokenForm || connected === false ? (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 space-y-2 min-w-[240px] max-w-[320px]">
          <p className="text-[10px] text-[var(--muted)] leading-relaxed">
            Allow popups for OAuth, or paste a token from{' '}
            <a
              href="https://vercel.com/account/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-[var(--accent)]"
            >
              vercel.com/account/tokens
            </a>{' '}
            (Full Account).
          </p>
          {!showTokenForm ? (
            <button
              type="button"
              onClick={() => setShowTokenForm(true)}
              className="text-[10px] font-semibold text-[var(--accent)] hover:underline"
            >
              Use personal access token
            </button>
          ) : (
            <>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="vercel_… token"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--foreground)]/5 border border-[var(--card-border)] text-[11px] font-mono focus:outline-none focus:border-[var(--accent)]/50"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => void connectWithToken()}
                disabled={connecting || deploying}
                className="w-full py-2 rounded-lg bg-[var(--accent)] text-[var(--background)] text-[11px] font-bold hover:opacity-90 disabled:opacity-60"
              >
                {connecting ? 'Connecting…' : 'Connect token & deploy'}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
