'use client';

import { useEffect, useState } from 'react';
import { FreeApiOptionsPanel } from '@/components/integrations/FreeApiOptionsPanel';
import { CheckCircle2, GitBranch, Key, Lock, Shield, Triangle } from 'lucide-react';
import { api } from '@/lib/api';
import { loadCredentials, hasVault } from '@/lib/credentialVault';
import { listenVercelOAuthMessages, openVercelOAuthPopup } from '@/lib/vercelConnect';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

const CONNECTABLE = [
  {
    id: 'supabase',
    name: 'Supabase',
    detail: 'Database, Auth, Realtime, Storage',
  },
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
  const [customCount, setCustomCount] = useState(0);
  const vaultReady = hasVault();

  useEffect(() => {
    api.github
      .status()
      .then((s) => {
        setGithubConnected(s.connected);
        setGithubUser(s.username ?? null);
      })
      .catch(() => {
        setGithubConnected(false);
      });
    api.vercel
      .status()
      .then((s) => {
        setVercelConnected(s.connected);
        setVercelUser(s.username ?? null);
      })
      .catch(() => setVercelConnected(false));
    setCustomCount(loadCredentials().length);
  }, []);

  async function connectGithub() {
    try {
      const { url } = await api.github.oauthUrl();
      window.location.href = url;
    } catch {
      toast.error('GitHub OAuth not configured');
    }
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
          Connect GitHub & Vercel for push and deploy. Other keys stay encrypted in your vault.
        </p>
      </div>

      <div className="space-y-2">
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

        <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03]">
          <Triangle className="w-5 h-5 shrink-0 mt-0.5 text-[var(--accent)]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold font-claude">Vercel</p>
            <p className="text-xs text-[var(--muted)] font-coding">
              {vercelConnected
                ? `Connected as @${vercelUser ?? 'user'} — deploys go to your Vercel domain`
                : 'Connect your Vercel account — authorize once, then every build can go live'}
            </p>
            {!vercelConnected ? (
              <button
                type="button"
                className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 font-coding"
                onClick={() => {
                  const stop = listenVercelOAuthMessages(
                    (username) => {
                      stop();
                      setVercelConnected(true);
                      setVercelUser(username ?? null);
                      toast.success(username ? `Vercel connected as @${username}` : 'Vercel connected');
                    },
                    (msg) => {
                      stop();
                      toast.error(msg);
                    }
                  );
                  void openVercelOAuthPopup().then((result) => {
                    if (!result.opened) {
                      stop();
                      toast.error(result.error || 'Could not open Vercel authorization');
                    }
                  });
                }}
              >
                Connect Vercel
              </button>
            ) : null}
          </div>
          {vercelConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : null}
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
                'bg-[var(--foreground)]/5 text-[var(--muted)] font-coding'
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
            Your vault has {customCount} custom credential{customCount === 1 ? '' : 's'}. Unlock with your vault password to view or copy keys below.
          </>
        ) : (
          <>
            <strong className="text-[var(--foreground)]">Set a vault password</strong> in Custom API Keys — required every time you view or copy an integrated key.
          </>
        )}
      </p>
    </div>
  );
}
