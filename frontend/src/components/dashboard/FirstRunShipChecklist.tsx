'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Step = {
  id: 'github' | 'vercel' | 'keys' | 'ship';
  label: string;
  detail: string;
  done: boolean;
  href: string;
  cta: string;
  /** Real provider mark where one exists, so the step is recognisable at a glance. */
  logo: string;
  optional?: boolean;
};

/**
 * Compact first-run path: Connect GitHub → Vercel → paste AI key → ship.
 * Presented as a single-step card rather than a flat list: it opens on the first
 * step that still needs work and advances as steps complete, while the arrows let
 * the user browse every step manually. Full OAuth forms stay on Integrations.
 */
export function FirstRunShipChecklist({ className }: { className?: string }) {
  const [loading, setLoading] = useState(true);
  const [githubOk, setGithubOk] = useState(false);
  const [vercelOk, setVercelOk] = useState(false);
  const [keysOk, setKeysOk] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  /** Once the user drives the arrows we stop re-aiming the card for them. */
  const userNavigatedRef = useRef(false);

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

  const steps: Step[] = [
    {
      id: 'github',
      label: 'Connect GitHub',
      detail: 'Xroga pushes your code to a repository you own.',
      done: githubOk,
      href: '/dashboard/integrations#ship-setup',
      cta: 'Connect',
      logo: '/brand/logos/github.svg',
    },
    {
      id: 'vercel',
      label: 'Connect Vercel',
      detail: 'Deploys go live on your own Vercel project and domain.',
      done: vercelOk,
      href: '/dashboard/integrations#ship-setup',
      cta: 'Connect',
      logo: '/brand/logos/vercel.svg',
    },
    {
      id: 'keys',
      label: 'Add an AI key',
      detail: 'Optional for static sites. Needed for live AI product features.',
      done: keysOk,
      href: '/dashboard/integrations?focus=keys#ship-setup',
      cta: 'Add key',
      logo: '/brand/logos/openai.svg',
      optional: true,
    },
    {
      id: 'ship',
      label: 'Ship from the chatbar',
      detail: 'Describe what you want and Xroga builds, verifies, and publishes it.',
      done: allReady,
      href: '/workspace',
      cta: allReady ? 'Ready' : 'Finish GitHub + Vercel first',
      logo: '/brand/xroga-mark.png',
    },
  ];

  // Aim the card at the first step still needing attention, until the user takes over.
  useEffect(() => {
    if (loading || userNavigatedRef.current) return;
    const firstOpen = [githubOk, vercelOk, keysOk, allReady].findIndex((done) => !done);
    setIndex(firstOpen === -1 ? steps.length - 1 : firstOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, githubOk, vercelOk, keysOk, allReady]);

  if (dismissed || (!loading && allReady && keysOk)) return null;

  const total = steps.length;
  const step = steps[Math.min(index, total - 1)];
  const completedCount = steps.filter((s) => s.done).length;

  function go(delta: number) {
    userNavigatedRef.current = true;
    setIndex((current) => Math.min(total - 1, Math.max(0, current + delta)));
  }

  return (
    <section
      aria-label="First ship checklist"
      className={cn(
        'mx-auto w-full max-w-md rounded-token-lg border border-[var(--border-subtle)]',
        'bg-[var(--surface-raised)] p-4 shadow-subtle',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-primary)]">First ship checklist</span>
          <span className="text-[10px] font-medium text-[var(--text-muted)]">
            {completedCount}/{total} done
          </span>
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

      <div className="mt-3 flex items-center gap-3">
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-token-md border',
            step.done
              ? 'border-transparent bg-[var(--success-dim)]'
              : // The provider marks in /brand/logos are white-only assets (hardcoded
                // fill="#ffffff"), so the chip stays dark in every theme — otherwise the
                // logo is invisible on the light surfaces.
                'border-transparent bg-[#12141c]',
          )}
        >
          {step.done ? (
            <Check className="h-5 w-5 text-[var(--success)]" aria-hidden="true" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={step.logo} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            {step.label}
            {step.optional && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                optional
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]">{step.detail}</p>
        </div>

        {step.done ? (
          <span className="shrink-0 text-[10px] font-semibold text-[var(--success)]">Done</span>
        ) : step.id === 'ship' ? (
          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{step.cta}</span>
        ) : (
          <Link
            href={step.href}
            className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            {step.cta}
          </Link>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Previous step"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <ol className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${total}`}>
          {steps.map((s, i) => (
            <li key={s.id}>
              {/* Visual dot stays small, but the button keeps a ~24px pointer target. */}
              <button
                type="button"
                onClick={() => {
                  userNavigatedRef.current = true;
                  setIndex(i);
                }}
                aria-label={`${s.label}${s.done ? ' (done)' : ''}`}
                aria-current={i === index ? 'step' : undefined}
                className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'block h-1.5 rounded-full transition-all',
                    i === index ? 'w-5 bg-[var(--text-primary)]' : 'w-1.5',
                    i !== index && (s.done ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]'),
                  )}
                />
              </button>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === total - 1}
          aria-label="Next step"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {loading ? (
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">Checking connections…</p>
      ) : null}
    </section>
  );
}
