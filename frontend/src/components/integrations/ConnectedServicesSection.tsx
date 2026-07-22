'use client';

import { useCallback, useEffect, useState } from 'react';
import { FreeApiOptionsPanel } from '@/components/integrations/FreeApiOptionsPanel';
import { CheckCircle2, Database, GitBranch, Key, Lock, Shield, Triangle } from 'lucide-react';
import { api } from '@/lib/api';
import { loadCredentials, hasVault } from '@/lib/credentialVault';
import { listenVercelOAuthMessages, openVercelOAuthPopup } from '@/lib/vercelConnect';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const CONNECTABLE = [
  {
    id: 'brevo',
    name: 'Brevo',
    detail: 'Transactional email',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    detail: 'CDN, DNS, SSL, R2 storage',
  },
  {
    id: 'lemon_squeezy',
    name: 'Lemon Squeezy',
    detail: 'Payments & subscriptions (MoR)',
  },
] as const;

const COMING_SOON = [
  'Stripe',
  'PayPal',
  'Fly.io',
  'Railway',
  'Netlify',
  'Discord',
  'Slack',
  'Google Analytics',
  'AWS',
  'Heroku',
];

export function ConnectedServicesSection() {
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
  const [vercelConnected, setVercelConnected] = useState(false);
  const [vercelUser, setVercelUser] = useState<string | null>(null);
  const [vercelWarning, setVercelWarning] = useState<string | null>(null);
  const [vercelProjects, setVercelProjects] = useState<
    Array<{ id: string; name: string; teamName?: string }>
  >([]);
  const [showVercelProjects, setShowVercelProjects] = useState(false);
  const [vercelPreferred, setVercelPreferred] = useState<string | null>(null);
  const [showVercelToken, setShowVercelToken] = useState(false);
  const [vercelToken, setVercelToken] = useState('');
  const [vercelBusy, setVercelBusy] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [supabaseMsg, setSupabaseMsg] = useState<string | null>(null);
  const [supabaseBusy, setSupabaseBusy] = useState(false);
  const [customCount, setCustomCount] = useState(0);
  const vaultReady = hasVault();

  const refresh = useCallback(async () => {
    try {
      const [gh, ve, sb] = await Promise.all([
        api.github.status().catch(() => ({ connected: false as boolean, username: undefined as string | undefined })),
        api.vercel.status().catch(() => ({
          connected: false as boolean,
          username: undefined as string | undefined,
          warning: undefined as string | undefined,
        })),
        api.supabase.status().catch(() => ({
          oauthConnected: false,
          connected: false,
          provisioned: false,
          ready: false,
          message: undefined as string | undefined,
        })),
      ]);
      setGithubConnected(Boolean(gh.connected));
      setGithubUser(gh.username ?? null);
      setVercelConnected(Boolean(ve.connected));
      setVercelUser(ve.username ?? null);
      setVercelWarning(ve.warning ?? null);
      setSupabaseConnected(
        Boolean(sb.oauthConnected || sb.connected || sb.provisioned || sb.ready),
      );
      setSupabaseMsg(sb.message ?? null);
    } finally {
      setCustomCount(loadCredentials().length);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setVercelPreferred(localStorage.getItem('xroga_vercel_preferred_project'));
    } catch {
      /* ignore */
    }
    const q = new URLSearchParams(window.location.search);
    if (q.get('vercel') === 'setup' || q.get('focus') === 'vercel') {
      setShowVercelToken(true);
    }
    const onSetup = () => setShowVercelToken(true);
    window.addEventListener('xroga-vercel-setup', onSetup);
    return () => window.removeEventListener('xroga-vercel-setup', onSetup);
  }, []);

  async function connectGithub() {
    try {
      const { url } = await api.github.oauthUrl();
      window.location.href = url;
    } catch {
      toast.error('GitHub OAuth not configured');
    }
  }

  function authorizeVercel() {
    const stop = listenVercelOAuthMessages(
      (username) => {
        stop();
        setVercelConnected(true);
        setVercelUser(username ?? null);
        toast.success(username ? `Vercel connected as @${username}` : 'Vercel connected');
        void refresh();
      },
      (msg) => {
        stop();
        setShowVercelToken(true);
        toast.error(msg);
      },
    );
    void openVercelOAuthPopup().then((result) => {
      if (result.goToIntegrations && !result.opened) {
        stop();
        setShowVercelToken(true);
        toast.error(
          result.error || 'OAuth session store unavailable — paste a Vercel personal token below',
        );
        return;
      }
      if (!result.opened) {
        stop();
        setShowVercelToken(true);
        toast.error(result.error || 'Could not open Vercel authorization');
      } else if (!result.popup) {
        toast.success('Continue authorizing Vercel in this tab…');
      }
    });
  }

  async function disconnectVercel() {
    setVercelBusy(true);
    try {
      await api.vercel.disconnect();
      setVercelConnected(false);
      setVercelUser(null);
      setVercelProjects([]);
      setShowVercelProjects(false);
      setVercelPreferred(null);
      try {
        localStorage.removeItem('xroga_vercel_preferred_project');
      } catch {
        /* ignore */
      }
      toast.success('Vercel disconnected');
      void refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Could not disconnect Vercel');
    } finally {
      setVercelBusy(false);
    }
  }

  async function changeVercelAccount() {
    await disconnectVercel();
    authorizeVercel();
  }

  async function loadVercelProjects() {
    setVercelBusy(true);
    try {
      const res = await api.vercel.projects();
      setVercelProjects(res.projects ?? []);
      setShowVercelProjects(true);
      toast.success(
        (res.projects ?? []).length
          ? `${res.projects.length} Vercel project(s)`
          : 'No projects found on this account',
      );
    } catch (e) {
      toast.error((e as Error).message || 'Could not list Vercel projects');
    } finally {
      setVercelBusy(false);
    }
  }

  async function disconnectSupabase() {
    setSupabaseBusy(true);
    try {
      await api.supabase.disconnect();
      setSupabaseConnected(false);
      setSupabaseMsg(null);
      toast.success('Supabase disconnected');
      void refresh();
    } catch (e) {
      toast.error((e as Error).message || 'Could not disconnect Supabase');
    } finally {
      setSupabaseBusy(false);
    }
  }

  async function changeSupabaseAccount() {
    await disconnectSupabase();
    document.getElementById('ship-setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.dispatchEvent(new CustomEvent('xroga-supabase-setup'));
    toast('Authorize a different Supabase account in Ship setup', { icon: '🗄️' });
  }

  function connectSoon(name: string) {
    toast(`${name} connect — add credentials in Custom API Keys`, { icon: '🔑' });
  }

  return (
    <div className="glass-panel rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold font-claude flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--accent)]" />
          Connected services
        </h3>
        <p className="text-xs text-[var(--muted)] mt-1 font-coding">
          Connect GitHub, Vercel & Supabase for push and deploy. Status persists after refresh.
        </p>
      </div>

      <div className="space-y-2">
        {/* GitHub */}
        <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03]">
          <GitBranch className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold font-claude">GitHub</p>
            <p className="text-xs text-[var(--muted)] font-coding">
              {githubConnected
                ? `Connected as @${githubUser ?? 'user'} — repo push & code ownership`
                : 'Not connected — required before builds'}
            </p>
            {githubConnected && (
              <p className="text-[10px] font-mono text-[var(--muted)] mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Token: •••••••••••• (encrypted vault)
              </p>
            )}
            {!githubConnected ? (
              <button
                type="button"
                className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 font-coding"
                onClick={() => void connectGithub()}
              >
                Connect GitHub
              </button>
            ) : null}
          </div>
          {githubConnected ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : null}
        </div>

        {/* Vercel */}
        <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03]">
          <Triangle className="w-5 h-5 shrink-0 mt-0.5 text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold font-claude">Vercel</p>
            <p className="text-xs text-[var(--muted)] font-coding">
              {vercelConnected
                ? `Connected as @${vercelUser ?? 'user'}${
                    vercelPreferred ? ` · project ${vercelPreferred}` : ''
                  } — deploys go to your Vercel domain`
                : 'Connect your Vercel account — authorize once, then every build can go live'}
            </p>
            {vercelWarning ? (
              <p className="text-[10px] text-amber-600 mt-1 font-coding">{vercelWarning}</p>
            ) : null}
            {vercelConnected ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={vercelBusy}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--accent)]/50 font-coding disabled:opacity-50"
                  onClick={() => void changeVercelAccount()}
                >
                  Change account
                </button>
                <button
                  type="button"
                  disabled={vercelBusy}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--accent)]/50 font-coding disabled:opacity-50"
                  onClick={() => void loadVercelProjects()}
                >
                  {showVercelProjects ? 'Refresh projects' : 'Change project'}
                </button>
                <button
                  type="button"
                  disabled={vercelBusy}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500/90 hover:bg-red-500/10 font-coding disabled:opacity-50"
                  onClick={() => void disconnectVercel()}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <button
                  type="button"
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 font-coding"
                  onClick={() => authorizeVercel()}
                >
                  Authorize Vercel
                </button>
                <button
                  type="button"
                  className="ml-2 text-xs text-[var(--muted)] hover:text-[var(--accent)] underline font-coding"
                  onClick={() => setShowVercelToken((v) => !v)}
                >
                  {showVercelToken ? 'Hide token' : 'Paste token instead'}
                </button>
              </div>
            )}
            {showVercelToken && !vercelConnected ? (
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
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
                  disabled={vercelBusy}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50 font-coding"
                  onClick={() => {
                    const token = vercelToken.trim();
                    if (token.length < 12) {
                      toast.error('Paste a valid token from vercel.com/account/tokens');
                      return;
                    }
                    setVercelBusy(true);
                    void api.vercel
                      .connectToken(token)
                      .then((res) => {
                        setVercelConnected(true);
                        setVercelUser(res.username);
                        setVercelToken('');
                        setShowVercelToken(false);
                        toast.success(`Vercel connected as @${res.username}`);
                        void refresh();
                      })
                      .catch((e) => toast.error((e as Error).message))
                      .finally(() => setVercelBusy(false));
                  }}
                >
                  {vercelBusy ? 'Saving…' : 'Save token'}
                </button>
              </div>
            ) : null}
            {showVercelProjects && vercelConnected ? (
              <ul className="mt-2 max-h-36 overflow-auto space-y-1 rounded-lg border border-[var(--card-border)] p-2">
                {vercelProjects.length === 0 ? (
                  <li className="text-[11px] text-[var(--muted)] font-coding">No projects listed</li>
                ) : (
                  vercelProjects.map((p) => (
                    <li
                      key={p.id}
                      className="text-xs font-coding flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-[var(--foreground)]/5"
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
          </div>
          {vercelConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : null}
        </div>

        {/* Supabase */}
        <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03]">
          <Database className="w-5 h-5 shrink-0 mt-0.5 text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold font-claude">Supabase</p>
            <p className="text-xs text-[var(--muted)] font-coding">
              {supabaseConnected
                ? supabaseMsg || 'Connected — your project holds app data & AI memory'
                : 'Optional — authorize then pick/create a project'}
            </p>
            {supabaseConnected ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={supabaseBusy}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--accent)]/50 font-coding disabled:opacity-50"
                  onClick={() => void changeSupabaseAccount()}
                >
                  Change account
                </button>
                <button
                  type="button"
                  disabled={supabaseBusy}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--accent)]/50 font-coding disabled:opacity-50"
                  onClick={() => {
                    document
                      .getElementById('ship-setup-supabase')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    window.dispatchEvent(new CustomEvent('xroga-supabase-change-project'));
                    toast('Pick another project in Ship setup → Supabase', { icon: '🗄️' });
                  }}
                >
                  Change project
                </button>
                <button
                  type="button"
                  disabled={supabaseBusy}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500/90 hover:bg-red-500/10 font-coding disabled:opacity-50"
                  onClick={() => void disconnectSupabase()}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--accent)]/50 font-coding"
                onClick={() => {
                  document.getElementById('ship-setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  window.dispatchEvent(new CustomEvent('xroga-supabase-setup'));
                }}
              >
                Connect in Ship setup
              </button>
            )}
          </div>
          {supabaseConnected ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : null}
        </div>

        {CONNECTABLE.map((svc) => (
          <div
            key={svc.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.02]"
          >
            <Key className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium font-claude">{svc.name}</p>
              <p className="text-xs text-[var(--muted)] font-coding">{svc.detail}</p>
              <button
                type="button"
                className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--accent)]/50 font-coding"
                onClick={() => connectSoon(svc.name)}
              >
                Connect
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-[var(--card-border)] p-3 relative overflow-hidden">
        <p className="text-xs font-semibold text-[var(--muted)] mb-2 font-coding">Coming soon</p>
        <div className="xv-integrations-soon-grid flex flex-wrap gap-1.5">
          {COMING_SOON.map((name) => (
            <span
              key={name}
              className={cn(
                'xv-integration-soon-chip text-[10px] px-2 py-1 rounded-md',
                'bg-[var(--foreground)]/5 text-[var(--muted)] font-coding',
              )}
            >
              {name}
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--foreground)]/70 bg-[var(--background)]/55 px-3 py-1 rounded-md backdrop-blur-[1px] font-coding">
            Not yet available
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--card-border)] p-3">
        <p className="text-xs font-semibold mb-1 text-[var(--muted)] font-coding">More free options</p>
        <FreeApiOptionsPanel compact />
      </div>

      <p className="text-[11px] text-[var(--muted)] leading-relaxed font-coding">
        {vaultReady ? (
          <>
            Your vault has {customCount} custom credential{customCount === 1 ? '' : 's'}. Unlock with
            your vault password to view or copy keys below.
          </>
        ) : (
          <>
            <strong className="text-[var(--foreground)]">Set a vault password</strong> in Custom API
            Keys — required every time you view or copy an integrated key.
          </>
        )}
      </p>
    </div>
  );
}
