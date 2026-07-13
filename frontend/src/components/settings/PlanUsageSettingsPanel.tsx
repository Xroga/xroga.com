'use client';

import Link from 'next/link';
import { Brain, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { UpgradeProButton } from '@/components/ui/Uiverse';
import { SubscriptionManagePanel } from '@/components/billing/SubscriptionManagePanel';
import { useRouter } from 'next/navigation';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function PlanUsageSettingsPanel() {
  const router = useRouter();
  const tokenUsage = useAppStore((s) => s.tokenUsage);
  const planName = useAppStore((s) => s.planName);
  const planTier = useAppStore((s) => s.planTier);

  const total = tokenUsage?.totalLimit ?? 7_000_000;
  const remaining = tokenUsage?.totalTokensRemaining ?? total;
  const pct = tokenUsage?.percentUsed ?? 0;

  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-lg flex items-center gap-2">
        <Brain className="w-5 h-5 text-[var(--accent)]" />
        Plan & Usage
      </h2>

      <div className="p-5 rounded-xl border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent)]/10 to-transparent">
        <p className="font-medium text-lg">{planName ?? 'Basic'}</p>
        {planTier && planTier !== 'unpaid' && (
          <p className="text-xs text-[var(--muted)] capitalize mt-0.5">{planTier} tier</p>
        )}
        <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-violet-500 transition-all"
            style={{ width: `${Math.max(4, 100 - pct)}%` }}
          />
        </div>
        <p className="text-sm text-[var(--muted)] mt-2">
          <span className="text-[var(--accent)] font-semibold tabular-nums">{formatTokens(remaining)}</span>
          {' / '}
          {formatTokens(total)} tokens remaining ({pct}% used)
        </p>
        {tokenUsage && (
          <p className="text-xs text-[var(--muted)] mt-1">
            Input: {formatTokens(tokenUsage.inputTokensRemaining)} · Output:{' '}
            {formatTokens(tokenUsage.outputTokensRemaining)}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <UpgradeProButton onClick={() => router.push('/pricing')} />
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40 transition-colors"
          >
            Full dashboard <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <SubscriptionManagePanel />
    </div>
  );
}
