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
        'rounded-xl border border-[var(--card-border)] bg-[var(--card)]/60 p-3 space-y-2 max-w-3xl',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--foreground)]">
          First ship checklist
        </p>
        <button
          type="button"
          className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)]"
          onClick={() => {
            sessionStorage.setItem('xroga-firstrun-checklist-dismissed', '1');
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
      <p className="text-[11px] text-[var(--muted)] leading-snug">
        GitHub → Vercel → optional AI key → prompt in the chatbar. Deploys go to{' '}
        <span className="font-medium text-[var(--foreground)]">your</span> accounts.
      </p>
      <ul className="space-y-1.5">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.id} className="flex items-center gap-2 text-[11px]">
              {s.done ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              )}
              <Icon className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
              <span className="flex-1 text-[var(--foreground)]">{s.label}</span>
              {!s.done && s.id !== 'ship' ? (
                <Link
                  href={s.href}
                  className="text-[10px] font-semibold text-[var(--accent)] hover:underline shrink-0"
                >
                  {s.cta}
                </Link>
              ) : (
                <span className="text-[10px] text-[var(--muted)] shrink-0">{s.cta}</span>
              )}
            </li>
          );
        })}
      </ul>
      {loading ? (
        <p className="text-[10px] text-[var(--muted)]">Checking connections…</p>
      ) : null}
    </div>
  );
}
