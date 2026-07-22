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
  const [vercelUser, setVercelUser] = useState<string | null>(null);
  const [vercelWarning, setVercelWarning] = useState<string | null>(null);
  const [supabaseOk, setSupabaseOk] = useState(false);
  const [keysOk, setKeysOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<StepId | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [showSupabase, setShowSupabase] = useState(false);
  const [showVercelToken, setShowVercelToken] = useState(false);
  const [vercelToken, setVercelToken] = useState('');
  const [showVercelProjects, setShowVercelProjects] = useState(false);
  const [vercelProjects, setVercelProjects] = useState<
    Array<{ id: string; name: string; teamName?: string }>
  >([]);
  const [vercelPreferred, setVercelPreferred] = useState<string | null>(null);
  const stopVercelListen = useRef<(() => void) | null>(null);
  const stopSupabaseListen = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [gh, ve, keys, sb] = await Promise.all([
        api.github.status().catch(() => ({ connected: false })),
        api.vercel.status().catch(() => ({ connected: false })),
        api.integrations
          .providerKeys()
          .catch(() => ({ keys: [] as Array<{ provider?: string; connected?: boolean }> })),
        api.supabase.status().catch(() => ({
          ready: false,
          connected: false,
          provisioned: false,
          oauthConnected: false,
        })),
      ]);
      setGithubOk(Boolean((gh as { connected?: boolean }).connected));
      const veStatus = ve as {
        connected?: boolean;
        username?: string;
        warning?: string;
        tokenValid?: boolean | null;
      };
      // Persist Connected when a token is stored (backend connected=true), even if live check is flaky
      setVercelOk(Boolean(veStatus.connected));
      setVercelUser(veStatus.username ?? null);
      setVercelWarning(veStatus.warning ?? null);
      const list =
        (keys as { keys?: Array<{ provider?: string; connected?: boolean }> }).keys ?? [];
      const connected = list.filter((k) => k.connected);
      // Authorize alone is enough to tick — project pick/provision may still be needed next
      const sbStatus = sb as {
        oauthConnected?: boolean;
        connected?: boolean;
        ready?: boolean;
        provisioned?: boolean;
      };
      setSupabaseOk(
        Boolean(sbStatus.oauthConnected) ||
          Boolean(sbStatus.connected) ||
          Boolean(sbStatus.provisioned) ||
          Boolean(sbStatus.ready),
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
      stopSupabaseListen.current?.();
      stopSupabaseListen.current = null;
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
        // OAuth succeeded — tick immediately (even if user still needs to pick a project)
        setSupabaseOk(true);
        setShowSupabase(true);
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
      setSupabaseOk(true);
      setShowSupabase(true);
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

  async function connectSupabase() {
    setBusy('supabase');
    setShowSupabase(true);
    setShowKeys(false);
    try {
      stopSupabaseListen.current?.();
      const { openSupabaseOAuthPopup, listenSupabaseOAuthMessages } = await import(
        '@/lib/supabaseConnect'
      );
      stopSupabaseListen.current = listenSupabaseOAuthMessages(
        (result) => {
          stopSupabaseListen.current = null;
          setSupabaseOk(true);
          setShowSupabase(true);
          if (result.provisioned) {
            toast.success(result.message || 'Supabase ready');
          } else {
            toast.success(result.message || 'Supabase authorized — pick or create a project below');
          }
          void refresh();
        },
        (msg) => {
          stopSupabaseListen.current = null;
          toast.error(msg);
        },
      );
      const result = await openSupabaseOAuthPopup();
      if (!result.opened) {
        stopSupabaseListen.current?.();
        stopSupabaseListen.current = null;
        toast.error(result.error || 'Could not start Supabase authorize');
      } else if (!result.popup) {
        toast.success('Continue authorizing Supabase in this tab…');
      }
    } catch {
      toast.error('Could not start Supabase connect');
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const onSb = () => {
      setShowSupabase(true);
      setShowKeys(false);
    };
    window.addEventListener('xroga-supabase-setup', onSb);
    window.addEventListener('xroga-supabase-change-project', onSb);
    try {
      setVercelPreferred(localStorage.getItem('xroga_vercel_preferred_project'));
    } catch {
      /* ignore */
    }
    return () => {
      window.removeEventListener('xroga-supabase-setup', onSb);
      window.removeEventListener('xroga-supabase-change-project', onSb);
    };
  }, []);

  async function loadVercelProjects() {
    setBusy('vercel');
    try {
      const res = await api.vercel.projects();
      setVercelProjects(res.projects ?? []);
      setShowVercelProjects(true);
      toast.success(
        (res.projects ?? []).length
          ? `${res.projects.length} Vercel project(s)`
          : 'No Vercel projects yet',
      );
    } catch (err) {
      toast.error((err as Error).message || 'Could not list Vercel projects');
    } finally {
      setBusy(null);
    }
  }

  async function disconnectVercel() {
    setBusy('vercel');
    try {
      await api.vercel.disconnect();
      setVercelOk(false);
      setVercelUser(null);
      setVercelWarning(null);
      setShowVercelProjects(false);
      setVercelProjects([]);
      setVercelPreferred(null);
      try {
        localStorage.removeItem('xroga_vercel_preferred_project');
      } catch {
        /* ignore */
      }
      toast.success('Vercel disconnected');
      void refresh();
    } catch (err) {
      toast.error((err as Error).message || 'Could not disconnect Vercel');
    } finally {
      setBusy(null);
    }
  }

  async function changeVercelAccount() {
    await disconnectVercel();
    await connectVercel();
  }

  async function disconnectSupabase() {
    setBusy('supabase');
    try {
      await api.supabase.disconnect();
      setSupabaseOk(false);
      toast.success('Supabase disconnected');
      void refresh();
    } catch (err) {
      toast.error((err as Error).message || 'Could not disconnect Supabase');
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
      body: 'Authorize in a popup (Vercel App). Enable Project + Deployment + Env API permissions on the App — OIDC scopes alone cannot deploy.',
      done: vercelOk,
      action: connectVercel,
      label: vercelOk ? 'Connected' : 'Authorize',
    },
    {
      id: 'supabase',
      title: '3. Supabase',
      body: 'Optional for static sites. Authorize, then pick/create a project so we can run schema + sync keys.',
      done: supabaseOk,
      optional: true,
      action: connectSupabase,
      label: supabaseOk ? 'Authorized' : 'Authorize',
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
          <h2 className="text-lg sm:text-xl font-bold mt-1">Connect once · then just describe</h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-xl">
            <strong>Web:</strong> GitHub + Vercel (+ Supabase). <strong>Chrome / Desktop:</strong>{' '}
            GitHub alone (zip on ship). <strong>Mobile:</strong> GitHub + Expo token in Publish. Then
            open Workspace and describe what to build.
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
                <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
                  {s.body}
                  {s.id === 'vercel' && vercelUser ? (
                    <span className="block mt-1 text-[var(--foreground)]/80">
                      Signed in as @{vercelUser}
                      {vercelPreferred ? ` · project ${vercelPreferred}` : ''}
                      {vercelWarning ? ` · ${vercelWarning}` : ''}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {s.id === 'vercel' && vercelOk ? (
                <>
                  <button
                    type="button"
                    disabled={busy === 'vercel'}
                    onClick={() => void changeVercelAccount()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40 transition-colors"
                  >
                    Change account
                  </button>
                  <button
                    type="button"
                    disabled={busy === 'vercel'}
                    onClick={() => void loadVercelProjects()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40 transition-colors"
                  >
                    Change project
                  </button>
                  <button
                    type="button"
                    disabled={busy === 'vercel'}
                    onClick={() => void disconnectVercel()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-500/90 hover:bg-red-500/10 transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : s.id === 'supabase' && supabaseOk ? (
                <>
                  <button
                    type="button"
                    disabled={busy === 'supabase'}
                    onClick={() => {
                      setShowSupabase(true);
                      setShowKeys(false);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40 transition-colors"
                  >
                    Change project
                  </button>
                  <button
                    type="button"
                    disabled={busy === 'supabase'}
                    onClick={() => void disconnectSupabase()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/30 text-red-500/90 hover:bg-red-500/10 transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={(s.done && s.id !== 'keys' && s.id !== 'supabase') || busy === s.id}
                  onClick={s.action}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] disabled:opacity-50 hover:bg-[var(--accent)]/25 transition-colors"
                >
                  {busy === s.id ? 'Opening…' : s.label}
                </button>
              )}
            </div>
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
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] disabled:opacity-50"
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

      {vercelOk && showVercelProjects ? (
        <ul className="mt-4 max-h-40 overflow-auto space-y-1 rounded-xl border border-[var(--card-border)] p-3">
          {vercelProjects.length === 0 ? (
            <li className="text-xs text-[var(--muted)]">No projects listed</li>
          ) : (
            vercelProjects.map((p) => (
              <li
                key={p.id}
                className="text-xs font-coding flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-[var(--foreground)]/5"
              >
                <span className="truncate">
                  {p.name}
                  {p.teamName ? (
                    <span className="text-[var(--muted)]"> · {p.teamName}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-[10px] font-bold text-[var(--accent)]"
                  onClick={() => {
                    try {
                      localStorage.setItem('xroga_vercel_preferred_project', p.name);
                      setVercelPreferred(p.name);
                    } catch {
                      /* ignore */
                    }
                    toast.success(`Preferred Vercel project: ${p.name}`);
                    setShowVercelProjects(false);
                  }}
                >
                  {vercelPreferred === p.name ? 'Selected' : 'Use'}
                </button>
              </li>
            ))
          )}
        </ul>
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
