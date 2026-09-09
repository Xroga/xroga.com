'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { api } from '@/lib/api';

type Phase = 'idle' | 'activating' | 'active' | 'waiting';

export function BillingSuccessExperience() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [usage, setUsage] = useState<{ remaining: number; total: number } | null>(null);

  const verify = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    setPhase('activating');
    const deadline = Date.now() + 18_000;
    while (!signal?.aborted && Date.now() < deadline) {
      try {
        const status = await api.billing.status();
        if (status.isPaid && status.plan === 'spark' && status.entitlement.state === 'paid_active') {
          const receiptKey = `xroga-pro-welcome:${status.renewalPeriodEnd ?? 'active'}`;
          if (signal?.aborted) return;
          setUsage({ remaining: status.usage.remaining, total: status.usage.total });
          setPhase(sessionStorage.getItem(receiptKey) ? 'idle' : 'active');
          sessionStorage.setItem(receiptKey, 'shown');
          const url = new URL(window.location.href);
          url.searchParams.delete('billing');
          window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
          return;
        }
      } catch {
        // The webhook can arrive after the browser redirect. Keep polling briefly.
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    if (!signal?.aborted) setPhase('waiting');
  }, []);

  useEffect(() => {
    if (new URL(window.location.href).searchParams.get('billing') !== 'success') return;
    const controller = new AbortController();
    void verify(controller.signal);
    return () => controller.abort();
  }, [verify]);

  if (phase === 'idle') return null;

  if (phase === 'activating' || phase === 'waiting') {
    return (
      <div className="fixed left-1/2 top-5 z-[120] w-[min(92vw,30rem)] -translate-x-1/2 rounded-2xl border border-[var(--card-border)] bg-[var(--background)]/95 p-4 shadow-2xl backdrop-blur" role="status">
        <div className="flex items-center gap-3">
          <RefreshCw className={`h-5 w-5 text-[var(--accent)] ${phase === 'activating' ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{phase === 'activating' ? 'Payment received — activating Xroga Pro…' : 'Activation is taking a little longer'}</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">Access changes only after Xroga verifies the signed payment event.</p>
          </div>
          {phase === 'waiting' && <button type="button" onClick={() => void verify()} className="text-xs font-semibold text-[var(--accent)]">Check again</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center overflow-hidden bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="xroga-pro-active">
      <div className="pointer-events-none absolute inset-0 motion-reduce:hidden" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <i key={index} className="absolute h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" style={{ left: `${5 + ((index * 37) % 90)}%`, top: `${8 + ((index * 23) % 80)}%`, animationDelay: `${index * 80}ms` }} />)}
      </div>
      <div className="relative w-full max-w-md rounded-3xl border border-[var(--accent)]/30 bg-[var(--background)] p-7 text-center shadow-2xl">
        <button type="button" onClick={() => setPhase('idle')} className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--foreground)]/5" aria-label="Close"><X className="h-4 w-4" /></button>
        <CheckCircle2 className="mx-auto h-11 w-11 text-[var(--accent)]" aria-hidden="true" />
        <h2 id="xroga-pro-active" className="mt-4 text-2xl font-semibold">Xroga Pro is active</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Your verified plan now includes {usage?.total ?? 1500} AI actions per 30 days{usage ? `, with ${usage.remaining} currently available` : ''}.</p>
        <Link href="/workspace" onClick={() => setPhase('idle')} className="mt-6 inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white">Start building</Link>
      </div>
    </div>
  );
}
