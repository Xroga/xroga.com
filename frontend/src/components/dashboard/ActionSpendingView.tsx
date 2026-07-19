'use client';

import { useAppStore } from '@/store/useAppStore';
import Link from 'next/link';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function ActionSpendingView({ embedded }: { embedded?: boolean }) {
  const usage = useAppStore((s) => s.tokenUsage);

  return (
    <div className={embedded ? 'py-4' : 'max-w-3xl mx-auto space-y-6'}>
      <div className="glass-panel rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm">Token Usage</h2>
        {usage ? (
          <>
            <p className="text-sm">
              <span className="text-[var(--accent)] font-semibold tabular-nums">
                {formatTokens(usage.totalTokensRemaining)}
              </span>
              <span className="text-[var(--muted)]">
                {' '}
                / {formatTokens(usage.totalLimit ?? 7_000_000)} tokens remaining ({usage.percentUsed}% used)
              </span>
            </p>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-violet-500"
                style={{ width: `${Math.max(4, 100 - usage.percentUsed)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted)]">
              Input: {formatTokens(usage.inputTokensRemaining)} left · Output:{' '}
              {formatTokens(usage.outputTokensRemaining)} left
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">Loading token usage…</p>
        )}
        <Link href="/dashboard" className="text-xs text-[var(--accent)] hover:underline">
          Open full dashboard →
        </Link>
      </div>
    </div>
  );
}
