'use client';

import { useEffect, useState } from 'react';
import { FreeApiOptionsPanel } from '@/components/integrations/FreeApiOptionsPanel';
import { CheckCircle2, GitBranch, Key, Lock, Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { loadCredentials, hasVault } from '@/lib/credentialVault';

const AUTO_MANAGED = [
  { id: 'supabase', name: 'Supabase', detail: 'Database, Auth, Realtime, Storage' },
  { id: 'vercel', name: 'Vercel', detail: 'Frontend deployment' },
  { id: 'cloudflare', name: 'Cloudflare', detail: 'CDN, DNS, SSL, R2 storage' },
  { id: 'paddle', name: 'Paddle', detail: 'Payments (PK/IN friendly)' },
  { id: 'brevo', name: 'Brevo', detail: 'Transactional email' },
];

const OPTIONAL_COMING = [
  'Stripe',
  'PayPal',
  'Fly.io',
  'Railway',
  'Discord',
  'Slack',
  'Google Analytics',
];

export function ConnectedServicesSection() {
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [githubConnected, setGithubConnected] = useState(false);
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
    setCustomCount(loadCredentials().length);
  }, []);

  return (
    <div className="glass-panel rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--accent)]" />
          Connected services
        </h3>
        <p className="text-xs text-[var(--muted)] mt-1">
          Xroga auto-configures platform integrations. API keys are encrypted in a vault — never shown in code or logs.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.03]">
          <GitBranch className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">GitHub</p>
            <p className="text-xs text-[var(--muted)]">
              {githubConnected
                ? `Connected as @${githubUser ?? 'user'} — repo push & code ownership`
                : 'Not connected — required before builds'}
            </p>
            {githubConnected && (
              <p className="text-[10px] font-mono text-[var(--muted)] mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Token: •••••••••••• (encrypted vault)
              </p>
            )}
          </div>
          {githubConnected ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : null}
        </div>

        {AUTO_MANAGED.map((svc) => (
          <div
            key={svc.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.02]"
          >
            <Key className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{svc.name}</p>
              <p className="text-xs text-[var(--muted)]">{svc.detail}</p>
              <p className="text-[10px] font-mono text-[var(--muted)] mt-1">
                <Lock className="w-3 h-3 inline mr-1" />
                Auto-managed key — injected at deploy
              </p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] font-bold shrink-0">
              Auto
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-[var(--card-border)] p-3">
        <p className="text-xs font-semibold text-[var(--muted)] mb-2">Optional integrations — coming soon</p>
        <div className="flex flex-wrap gap-1.5">
          {OPTIONAL_COMING.map((name) => (
            <span key={name} className="text-[10px] px-2 py-1 rounded-full bg-[var(--foreground)]/5 text-[var(--muted)]">
              {name}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-3">
        <p className="text-xs font-semibold mb-1">Prefer not to add paid API keys?</p>
        <FreeApiOptionsPanel compact />
      </div>

      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
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
