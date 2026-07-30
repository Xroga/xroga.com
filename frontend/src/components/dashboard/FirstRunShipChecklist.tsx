'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, KeyRound, GitBranch, Triangle, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Step = {
  id: 'github' | 'vercel' | 'keys' | 'ship';
  label: string;
  done: boolean;
  href: string;
  cta: string;
  icon: typeof GitBranch;
};

/**
 * Compact first-run path: Connect GitHub → Vercel → paste AI key → ship.
 * Full OAuth forms stay on Integrations; this only guides + links.
 */
export function FirstRunShipChecklist({ className }: { className?: string }) {
  const [loading, setLoading] = useState(true);
  const [githubOk, setGithubOk] = useState(false);
  const [vercelOk, setVercelOk] = useState(false);
  const [keysOk, setKeysOk] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [gh, ve, keys] = await Promise.all([
        api.github.status().catch(() => ({ connected: false })),
        api.vercel.status().catch(() => ({ connected: false })),
        api.integrations
          .providerKeys()
          .catch(() => ({ keys: [] as Array<{ provider?: string; connected?: boolean }> })),
      ]);
      setGithubOk(Boolean((gh as { connected?: boolean }).connected));
      setVercelOk(Boolean((ve as { connected?: boolean }).connected));
      const list =
        (keys as { keys?: Array<{ provider?: string; connected?: boolean }> }).keys ?? [];
      setKeysOk(
        list.some(
          (k) =>
            k.connected &&
            k.provider &&
            !String(k.provider).startsWith('supabase') &&
            !['apple_asc', 'google_play', 'cws', 'csc'].some((p) =>
              String(k.provider).includes(p),
            ),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('xroga-firstrun-checklist-dismissed') === '1') {
      setDismissed(true);
    }
  }, [refresh]);

  const allReady = githubOk && vercelOk;
  if (dismissed || (!loading && allReady && keysOk)) return null;

  const steps: Step[] = [
    {
      id: 'github',
      label: 'Connect GitHub',
      done: githubOk,
      href: '/dashboard/integrations#ship-setup',
      cta: githubOk ? 'Connected' : 'Connect',
      icon: GitBranch,
    },
    {
      id: 'vercel',
      label: 'Connect Vercel',
      done: vercelOk,
      href: '/dashboard/integrations#ship-setup',
      cta: vercelOk ? 'Connected' : 'Connect',
      icon: Triangle,
    },
    {
      id: 'keys',
      label: 'Add an AI key (optional for static sites)',
      done: keysOk,
      href: '/dashboard/integrations?focus=keys#ship-setup',
      cta: keysOk ? 'Saved' : 'Add key',
      icon: KeyRound,
    },
    {
      id: 'ship',
      label: 'Ship from the chatbar below',
      done: allReady,
      href: '/workspace',
      cta: allReady ? 'Ready' : 'Finish 1–2 first',
      icon: Rocket,
    },
  ];

  return (
    <div
      className={cn(
        'max-w-3xl space-y-2 rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/xroga-mark.png" alt="" aria-hidden="true" className="h-3.5 w-3.5" />
          <p className="text-xs font-semibold text-[var(--text-primary)]">First ship checklist</p>
        </div>
        <button
          type="button"
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => {
            sessionStorage.setItem('xroga-firstrun-checklist-dismissed', '1');
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
      <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
        GitHub → Vercel → optional AI key → prompt in the chatbar. Deploys go to{' '}
        <span className="font-medium text-[var(--text-primary)]">your</span> accounts.
      </p>
      <ul className="space-y-1">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li
              key={s.id}
              className={cn(
                'flex items-center gap-2 rounded-token-sm px-1.5 py-1 text-[11px] transition-colors',
                s.done && 'bg-[var(--success-dim)]',
              )}
            >
              {s.done ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              )}
              <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              <span className={cn('flex-1', s.done ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]')}>{s.label}</span>
              {!s.done && s.id !== 'ship' ? (
                <Link
                  href={s.href}
                  className="shrink-0 text-[10px] font-semibold text-[var(--accent)] hover:underline"
                >
                  {s.cta}
                </Link>
              ) : (
                <span className={cn('shrink-0 text-[10px]', s.done ? 'text-[var(--success)]' : 'text-[var(--text-muted)]')}>{s.cta}</span>
              )}
            </li>
          );
        })}
      </ul>
      {loading ? (
        <p className="text-[10px] text-[var(--text-muted)]">Checking connections…</p>
      ) : null}
    </div>
  );
}
