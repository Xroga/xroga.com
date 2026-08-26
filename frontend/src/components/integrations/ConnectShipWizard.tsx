'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, KeyRound, GitBranch, Triangle, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { openGitHubOAuthPopup } from '@/lib/githubConnect';
import { subscribeOAuthResults } from '@/lib/oauthPopupResult';
import { AiIntegrationsPanel } from './AiIntegrationsPanel';
import { SupabaseConnectPanel } from './SupabaseConnectPanel';

type StepId = 'github' | 'vercel' | 'supabase' | 'keys';

/**
 * Ship flow: GitHub → Vercel → Supabase (user's project) → extra API keys.
 */
export function ConnectShipWizard() {
  const [githubOk, setGithubOk] = useState(false);
  const [vercelOk, setVercelOk] = useState(false);
  const [vercelCanDeploy, setVercelCanDeploy] = useState<boolean | null>(null);
  const [managedVercelAvailable, setManagedVercelAvailable] = useState(false);
  const [vercelUser, setVercelUser] = useState<string | null>(null);
  const [vercelWarning, setVercelWarning] = useState<string | null>(null);
  const [supabaseOk, setSupabaseOk] = useState(false);
  const [keysOk, setKeysOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<StepId | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [showSupabase, setShowSupabase] = useState(false);
  const [showVercelProjects, setShowVercelProjects] = useState(false);
  const [vercelProjects, setVercelProjects] = useState<
    Array<{ id: string; name: string; teamId?: string; teamName?: string }>
  >([]);
  const [vercelPreferred, setVercelPreferred] = useState<string | null>(null);
  const [vercelPreferredTeamId, setVercelPreferredTeamId] = useState<string | null>(null);
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
        canDeploy?: boolean | null;
        managedDeployAvailable?: boolean;
      };
      // Persist Connected when a token is stored (backend connected=true), even if live check is flaky
      setVercelOk(Boolean(veStatus.connected));
      setVercelCanDeploy(veStatus.canDeploy ?? null);
      setManagedVercelAvailable(Boolean(veStatus.managedDeployAvailable));
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
    try {
      setVercelPreferred(localStorage.getItem('xroga_vercel_preferred_project'));
      setVercelPreferredTeamId(localStorage.getItem('xroga_vercel_preferred_team_id'));
    } catch {
      /* local preference is optional */
    }
  }, []);

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
    // Chatbar / OAuth return → focus this permission-based setup section.
    if (q.get('vercel') === 'setup' || q.get('focus') === 'vercel') {
      document.getElementById('ship-setup')?.scrollIntoView({ block: 'start' });
    }
    const onSetup = () => document.getElementById('ship-setup')?.scrollIntoView({ block: 'start' });
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
      const result = await openGitHubOAuthPopup();
      if (!result.opened) toast.error(result.error || 'Could not start GitHub connect');
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
        toast.error(result.error || 'Could not start Vercel authorization');
        return;
      }
      if (!result.opened) {
        stopVercelListen.current?.();
        stopVercelListen.current = null;
        toast.error(result.error || 'Could not start Vercel authorize');
      } else if (!result.popup) {
        toast.success('Continue authorizing Vercel in this tab…');
      }
    } catch {
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
      setVercelCanDeploy(null);
      setVercelUser(null);
      setVercelWarning(null);
      setShowVercelProjects(false);
      setVercelProjects([]);
      setVercelPreferred(null);
      setVercelPreferredTeamId(null);
      try {
        localStorage.removeItem('xroga_vercel_preferred_project');
        localStorage.removeItem('xroga_vercel_preferred_team_id');
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
      body: managedVercelAvailable
        ? 'Managed Vercel publishing is ready. No personal token or Vercel sign-in is required.'
        : 'Vercel publishing is temporarily unavailable.',
      done: managedVercelAvailable || (vercelOk && vercelCanDeploy === true),
      action: connectVercel,
      label: managedVercelAvailable
        ? 'Managed by Xroga'
        : vercelOk && vercelCanDeploy === true
          ? 'Connected'
          : 'Unavailable',
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

  const ready = githubOk && (managedVercelAvailable || (vercelOk && vercelCanDeploy === true));

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
            <strong>Web:</strong> GitHub + managed Vercel (+ optional Supabase). <strong>Chrome / Desktop:</strong>{' '}
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
              {s.id === 'vercel' && managedVercelAvailable ? (
                <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
                  Ready
                </span>
              ) : s.id === 'vercel' && vercelOk ? (
                <>
                  <button
                    type="button"
                    disabled={busy === 'vercel'}
                    onClick={() => void changeVercelAccount()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40 transition-colors"
                  >
                    Change account
                  </button>
                  {vercelCanDeploy === true ? (
                    <button
                      type="button"
                      disabled={busy === 'vercel'}
                      onClick={() => void loadVercelProjects()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40 transition-colors"
                    >
                      Change project
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === 'vercel'}
                      onClick={() => void connectVercel()}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 transition-colors"
                    >
                      Re-authorize permissions
                    </button>
                  )}
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
                      if (p.teamId) {
                        localStorage.setItem('xroga_vercel_preferred_team_id', p.teamId);
                      } else {
                        localStorage.removeItem('xroga_vercel_preferred_team_id');
                      }
                      setVercelPreferred(p.name);
                      setVercelPreferredTeamId(p.teamId ?? null);
                    } catch {
                      /* ignore */
                    }
                    toast.success(`Preferred Vercel project: ${p.name}`);
                    setShowVercelProjects(false);
                  }}
                >
                  {vercelPreferred === p.name && vercelPreferredTeamId === (p.teamId ?? null)
                    ? 'Selected'
                    : 'Use'}
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
