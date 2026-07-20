'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, KeyRound, GitBranch, Triangle, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { clearOAuthResult, subscribeOAuthResults } from '@/lib/oauthPopupResult';
import { AiIntegrationsPanel } from './AiIntegrationsPanel';
import { SupabaseConnectPanel } from './SupabaseConnectPanel';

type StepId = 'github' | 'vercel' | 'supabase' | 'keys';

/**
 * Ship flow: GitHub → Vercel → Supabase (user's project) → extra API keys.
 */
export function ConnectShipWizard() {
  const [githubOk, setGithubOk] = useState(false);
  const [vercelOk, setVercelOk] = useState(false);
  const [supabaseOk, setSupabaseOk] = useState(false);
  const [keysOk, setKeysOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<StepId | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [showSupabase, setShowSupabase] = useState(false);
  const [showVercelToken, setShowVercelToken] = useState(false);
  const [vercelToken, setVercelToken] = useState('');
  const stopVercelListen = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [gh, ve, keys, sb] = await Promise.all([
        api.github.status().catch(() => ({ connected: false })),
        api.vercel.status().catch(() => ({ connected: false })),
        api.integrations.providerKeys().catch(() => ({ keys: [] as Array<{ provider?: string; connected?: boolean }> })),
        api.supabase.status().catch(() => ({ ready: false, connected: false, provisioned: false })),
      ]);
      setGithubOk(Boolean((gh as { connected?: boolean }).connected));
      setVercelOk(Boolean((ve as { connected?: boolean }).connected));
      const list = (keys as { keys?: Array<{ provider?: string; connected?: boolean }> }).keys ?? [];
      const connected = list.filter((k) => k.connected);
      setSupabaseOk(
        Boolean((sb as { provisioned?: boolean }).provisioned) ||
          Boolean((sb as { ready?: boolean }).ready),
      );
      setKeysOk(
        connected.some(
          (k) =>
            k.provider &&
            !String(k.provider).startsWith('supabase'),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      stopVercelListen.current?.();
      stopVercelListen.current = null;
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeOAuthResults((data) => {
      if (data.type === 'xroga-github-connected') {
        setGithubOk(true);
        toast.success(
          typeof data.username === 'string'
            ? `GitHub connected as @${data.username}`
            : 'GitHub connected',
        );
        void refresh();
      }
      if (data.type === 'xroga-github-error' && typeof data.message === 'string') {
        toast.error(data.message);
      }
      // Vercel success/error is handled by listenVercelOAuthMessages during Authorize
      // to avoid double toasts (storage + postMessage + poll).
      if (data.type === 'xroga-supabase-connected') {
        if (data.provisioned) {
          setSupabaseOk(true);
        }
        void refresh();
      }
    });
    return unsub;
  }, [refresh]);

  // After same-tab Vercel/GitHub return (?vercel=connected on integrations)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('vercel') === 'connected') {
      setVercelOk(true);
      void refresh();
    }
    if (q.get('github') === 'connected') {
      setGithubOk(true);
      void refresh();
    }
    if (q.get('supabase') === 'connected') {
      void refresh();
    }
    // Chatbar / OAuth session-store failure → land here with token paste ready
    if (q.get('vercel') === 'setup' || q.get('focus') === 'vercel') {
      setShowVercelToken(true);
    }
    const onSetup = () => setShowVercelToken(true);
    window.addEventListener('xroga-vercel-setup', onSetup);
    const vercelErr = q.get('vercel') === 'error' ? q.get('message') : null;
    const githubErr = q.get('github') === 'error' ? q.get('message') : null;
    if (vercelErr) toast.error(vercelErr);
    if (githubErr) toast.error(githubErr);
    return () => window.removeEventListener('xroga-vercel-setup', onSetup);
  }, [refresh]);

  async function connectGithub() {
    setBusy('github');
    try {
      clearOAuthResult();
      const { url } = await api.github.oauthUrl();
      if (!url) {
        toast.error('GitHub OAuth not configured');
        return;
      }
      const popup = window.open(
        'about:blank',
        'xroga-github-oauth',
        'width=600,height=720,scrollbars=yes,resizable=yes',
      );
      if (!popup) {
        window.location.href = url;
      } else {
        try {
          popup.location.href = url;
          popup.focus();
        } catch {
          window.location.href = url;
        }
      }
    } catch {
      toast.error('Could not start GitHub connect');
    } finally {
      setBusy(null);
    }
  }

  async function connectVercel() {
    setBusy('vercel');
    try {
      stopVercelListen.current?.();
      const { openVercelOAuthPopup, listenVercelOAuthMessages } = await import('@/lib/vercelConnect');
      stopVercelListen.current = listenVercelOAuthMessages(
        (username) => {
          stopVercelListen.current = null;
          setVercelOk(true);
          toast.success(username ? `Vercel connected as @${username}` : 'Vercel connected');
          void refresh();
        },
        (msg) => {
          stopVercelListen.current = null;
          toast.error(msg);
        },
      );
      const result = await openVercelOAuthPopup();
      if (result.goToIntegrations && !result.opened) {
        stopVercelListen.current?.();
        stopVercelListen.current = null;
        // Already on Integrations — show token paste instead of looping navigate
        setShowVercelToken(true);
        toast.error(
          result.error ||
            'OAuth session store unavailable — paste a Vercel personal token below',
        );
        return;
      }
      if (!result.opened) {
        stopVercelListen.current?.();
        stopVercelListen.current = null;
        setShowVercelToken(true);
        toast.error(result.error || 'Could not start Vercel authorize');
      } else if (!result.popup) {
        toast.success('Continue authorizing Vercel in this tab…');
      }
    } catch {
      setShowVercelToken(true);
      toast.error('Could not start Vercel connect');
    } finally {
      setBusy(null);
    }
  }

  async function saveVercelToken() {
    const token = vercelToken.trim();
    if (!token || token.length < 20) {
      toast.error('Paste a valid token from vercel.com/account/tokens');
      return;
    }
    setBusy('vercel');
    try {
      const res = await api.vercel.connectToken(token);
      setVercelOk(true);
      setShowVercelToken(false);
      setVercelToken('');
      toast.success(
        res.username ? `Vercel connected as @${res.username}` : 'Vercel connected',
      );
      void refresh();
    } catch (err) {
      toast.error((err as Error).message || 'Could not save Vercel token');
    } finally {
      setBusy(null);
    }
  }

  const steps: Array<{
    id: StepId;
    title: string;
    body: string;
    done: boolean;
    optional?: boolean;
    action: () => void;
    label: string;
  }> = [
    {
      id: 'github',
      title: '1. GitHub',
      body: 'Authorize once. We push and update your code automatically.',
      done: githubOk,
      action: connectGithub,
      label: githubOk ? 'Connected' : 'Authorize',
    },
    {
      id: 'vercel',
      title: '2. Vercel',
      body: 'Authorize in a popup (Vercel App). With Project + Deployment + Env permissions, we deploy and sync keys automatically.',
      done: vercelOk,
      action: connectVercel,
      label: vercelOk ? 'Connected' : 'Authorize',
    },
    {
      id: 'supabase',
      title: '3. Supabase',
      body: 'Authorize once. We fetch keys and run SQL (schema, memory, storage). Create a project here if you have none.',
      done: supabaseOk,
      optional: true,
      action: () => {
        setShowSupabase(true);
        setShowKeys(false);
      },
      label: supabaseOk ? 'Connected' : 'Authorize',
    },
    {
      id: 'keys',
      title: '4. Extra keys',
      body: 'Optional — OpenAI, Stripe, Resend for live product features.',
      done: keysOk,
      optional: true,
      action: () => {
        setShowKeys(true);
        setShowSupabase(false);
      },
      label: keysOk ? 'Saved' : 'Add keys',
    },
  ];

  const ready = githubOk && vercelOk;

  return (
    <section
      id="ship-setup"
      className="mb-8 rounded-2xl border border-[var(--card-border)] bg-[var(--card)]/40 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Ship setup
          </p>
          <h2 className="text-lg sm:text-xl font-bold mt-1">3 clicks · then just describe</h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-xl">
            Authorize GitHub + Vercel (+ Supabase). Then open Workspace and tell Xroga what to
            build — we code, push, and deploy for you.
          </p>
        </div>
        <div
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
            ready
              ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
              : 'border-amber-500/40 text-amber-700 bg-amber-500/10'
          }`}
        >
          {loading ? 'Checking…' : ready ? 'Ready to ship' : 'Setup incomplete'}
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[var(--card-border)] bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="mt-0.5 shrink-0">
                {s.done ? (
                  <Check className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Circle className="w-5 h-5 text-[var(--muted)]" />
                )}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                  {s.id === 'github' ? <GitBranch className="w-4 h-4" /> : null}
                  {s.id === 'vercel' ? <Triangle className="w-4 h-4" /> : null}
                  {s.id === 'supabase' ? <Database className="w-4 h-4" /> : null}
                  {s.id === 'keys' ? <KeyRound className="w-4 h-4" /> : null}
                  {s.title}
                  {s.optional ? (
                    <span className="text-[10px] uppercase tracking-wide text-[var(--muted)] font-medium">
                      optional
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={(s.done && s.id !== 'keys' && s.id !== 'supabase') || busy === s.id}
              onClick={s.action}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
            >
              {busy === s.id ? 'Opening…' : s.label}
            </button>
          </li>
        ))}
      </ol>

      {!vercelOk && showVercelToken ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Paste a Vercel personal token from{' '}
            <a
              href="https://vercel.com/account/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] font-semibold hover:underline"
            >
              vercel.com/account/tokens
            </a>{' '}
            (works even when OAuth session storage is unavailable).
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="password"
              value={vercelToken}
              onChange={(e) => setVercelToken(e.target.value)}
              placeholder="vercel_… personal access token"
              className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-[var(--card-border)] text-xs font-mono"
              autoComplete="off"
            />
            <button
              type="button"
              disabled={busy === 'vercel'}
              onClick={() => void saveVercelToken()}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
            >
              {busy === 'vercel' ? 'Saving…' : 'Save token'}
            </button>
          </div>
        </div>
      ) : !vercelOk ? (
        <button
          type="button"
          onClick={() => setShowVercelToken(true)}
          className="mt-3 text-xs text-[var(--muted)] hover:text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Prefer a personal token? Paste it here
        </button>
      ) : null}

      {ready ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          You&apos;re set.{' '}
          <Link href="/workspace" className="text-[var(--accent)] font-semibold hover:underline">
            Open Workspace
          </Link>{' '}
          and describe what to build.
        </p>
      ) : null}

      {showSupabase ? (
        <div id="ship-setup-supabase" className="mt-5 pt-5 border-t border-[var(--card-border)]">
          <SupabaseConnectPanel
            onConnected={() => {
              void refresh();
              setShowSupabase(false);
            }}
          />
        </div>
      ) : null}

      {showKeys ? (
        <div className="mt-5 pt-5 border-t border-[var(--card-border)]">
          <AiIntegrationsPanel compact />
        </div>
      ) : null}
    </section>
  );
}
