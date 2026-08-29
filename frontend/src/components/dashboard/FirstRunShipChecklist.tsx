'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, X } from 'lucide-react';
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
 * Presented as one row showing a single step rather than a flat list: it opens on
 * the first step that still needs work and advances as steps complete, while the
 * dots reach any step directly. Full OAuth forms stay on Integrations.
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


  return (
    /**
     * One row, not three.
     *
     * This previously stacked a title row, a step row, and a navigation row, which
     * came to roughly 130px directly above the composer — the single biggest thing
     * pushing the input down the viewport. Everything it carried is still here:
     * progress, the step, its action, per-step navigation, and dismiss. They now sit
     * on one line, at about a third of the height.
     *
     * The arrows are gone rather than shrunk. The dots were always clickable and
     * reach any step in one press, so the arrows were a second control for the same
     * job; dropping them buys the width that lets the detail sentence stay.
     */
    <section
      aria-label="First ship checklist"
      className={cn('xv-first-run-checklist', className)}
    >
      <span
        className={cn(
          'xv-first-run-checklist__mark',
          step.done
            ? 'bg-[var(--success-dim)]'
            : // The provider marks in /brand/logos are white-only assets (hardcoded
              // fill="#ffffff"), so the chip stays dark in every theme — otherwise the
              // logo is invisible on the light surfaces.
              'bg-[#12141c]',
        )}
      >
        {step.done ? (
          <Check className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden="true" />
        ) : (
          <Image src={step.logo} alt="" aria-hidden="true" width={14} height={14} className="h-3.5 w-3.5 object-contain" />
        )}
      </span>

      <div className="xv-first-run-checklist__copy">
        <span className="xv-first-run-checklist__label">
          {step.label}
        </span>
        {step.optional && (
          <span className="xv-first-run-checklist__optional">
            optional
          </span>
        )}
        {/* The detail is the first thing to drop when the row is tight — the label and
            the action are what make the step actionable. */}
        <span className="xv-first-run-checklist__detail">
          {step.detail}
        </span>
      </div>

      <span className="xv-first-run-checklist__count">
        {completedCount}/{total}
      </span>

      <ol className="xv-first-run-checklist__steps" aria-label={`Step ${index + 1} of ${total}`}>
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
              className="flex h-6 w-3.5 items-center justify-center rounded-full focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'block h-1.5 rounded-full transition-all',
                  i === index ? 'w-4 bg-[var(--text-primary)]' : 'w-1.5',
                  i !== index && (s.done ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]'),
                )}
              />
            </button>
          </li>
        ))}
      </ol>

      {step.done ? (
        <span className="shrink-0 text-[10px] font-semibold text-[var(--success)]">Done</span>
      ) : step.id === 'ship' ? (
        <span className="hidden shrink-0 text-[10px] text-[var(--text-muted)] sm:block">{step.cta}</span>
      ) : (
        <Link
          href={step.href}
          className="xv-first-run-checklist__action"
        >
          {step.cta}
        </Link>
      )}

      <button
        type="button"
        aria-label="Dismiss checklist"
        title="Dismiss"
        className="xv-first-run-checklist__dismiss"
        onClick={() => {
          sessionStorage.setItem('xroga-firstrun-checklist-dismissed', '1');
          setDismissed(true);
        }}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </section>
  );
}
