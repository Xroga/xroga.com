'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Skeleton from 'react-loading-skeleton';
import {
  Coins,
  CreditCard,
  Zap,
  Activity,
  ArrowUpRight,
  Shield,
} from 'lucide-react';
import { api, type DashboardSummary } from '@/lib/api';
import { GALACTIC_PLANS } from '@/lib/plans';
import { GalacticPlanPricingCard, PricingPlanGrid } from '@/components/billing/XrogaPricingCard';
import { formatSafeDate, formatSafeDistance, safeDate } from '@/lib/safeDates';
import { cn } from '@/lib/utils';
import 'react-loading-skeleton/dist/skeleton.css';

const ACTION_LABELS: Record<string, string> = {
  swarm_completed: 'Code generated',
  ai_tokens_used: 'AI tokens used',
  generated_image: 'Image generated',
  file_uploaded: 'File uploaded',
  task_completed: 'Task completed',
  created_project: 'Project created',
  generated_video: 'Video generated',
  pushed_to_github: 'Pushed to GitHub',
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn('h-2.5 rounded-full bg-white/5 overflow-hidden', className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-violet-500 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function WidgetCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('glass-panel rounded-xl overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--accent)]" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </section>
  );
}

export function DashboardHomeView() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.dashboard
      .summary()
      .then(setSummary)
      // Keep last good summary on failure — never flash empty/0% usage after leave/return.
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleEmergencyTokens() {
    setClaiming(true);
    setClaimMsg(null);
    try {
      const result = await api.dashboard.claimEmergencyTokens();
      setClaimMsg(result.message);
      if (result.success) load();
    } catch (err) {
      setClaimMsg((err as Error).message);
    } finally {
      setClaiming(false);
    }
  }

  const now = safeDate(summary?.now) ?? new Date();
  const tokens = summary?.tokens;
  const xrg = summary?.xrg;
  const billing = summary?.billing;

  const inputPct = tokens
    ? Math.round((tokens.inputUsed / tokens.inputLimit) * 100)
    : 0;
  const outputPct = tokens
    ? Math.round((tokens.outputUsed / tokens.outputLimit) * 100)
    : 0;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton height={40} width={280} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton height={220} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
          <Skeleton height={220} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
          <Skeleton height={200} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
          <Skeleton height={200} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 universe-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {formatSafeDate(now, 'EEEE, MMMM d, yyyy')} · {formatSafeDate(now, 'h:mm a')}
          </p>
        </div>
        <Link
          href="/workspace"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
        >
          Open Workspace
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <WidgetCard title="Token Usage" icon={Zap}>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Remaining</span>
              <span className="font-mono font-medium">
                {formatTokens(tokens?.totalRemaining ?? 0)} / {formatTokens(tokens?.totalLimit ?? 7_000_000)}
              </span>
            </div>
            <ProgressBar percent={tokens?.percentUsed ?? 0} />
            <p className="text-xs text-[var(--muted)] text-right">{tokens?.percentUsed ?? 0}% used</p>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--muted)]">Input</span>
                <span className="font-mono text-xs">
                  {formatTokens(tokens?.inputUsed ?? 0)} / {formatTokens(tokens?.inputLimit ?? 4_700_000)} ({inputPct}%)
                </span>
              </div>
              <ProgressBar percent={inputPct} className="h-1.5" />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--muted)]">Output</span>
                <span className="font-mono text-xs">
                  {formatTokens(tokens?.outputUsed ?? 0)} / {formatTokens(tokens?.outputLimit ?? 2_300_000)} ({outputPct}%)
                </span>
              </div>
              <ProgressBar percent={outputPct} className="h-1.5" />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)] pt-1">
            <span>Days remaining: <strong className="text-[var(--foreground)]">{tokens?.daysRemaining ?? 0}</strong></span>
            <span>Est. daily: <strong className="text-[var(--foreground)]">{(tokens?.estimatedDailyUsage ?? 0).toLocaleString()}/day</strong></span>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleEmergencyTokens}
              disabled={claiming || !tokens?.emergencyAvailable}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                tokens?.emergencyAvailable
                  ? 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10'
                  : 'border-[var(--card-border)] text-[var(--muted)] cursor-not-allowed opacity-60'
              )}
            >
              <Shield className="w-3 h-3 inline mr-1" />
              Emergency Tokens (250K)
            </button>
            <button
              type="button"
              onClick={() => router.push('/pricing')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 transition-colors"
            >
              Upgrade Plan
            </button>
          </div>
          {claimMsg && <p className="text-xs text-[var(--muted)]">{claimMsg}</p>}
        </WidgetCard>

        {tokens?.byModel?.length ? (
          <WidgetCard title="Black Hole V∞ engine usage" icon={Activity} className="md:col-span-2">
            <p className="text-xs text-[var(--muted)] mb-3">
              Per-engine allocation from your 7M token pool — each Xroga AI tier has its own limit. Provider names
              are never shown; usage is deducted automatically on every build, update, and chat.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tokens.byModel.map((m) => (
                <div key={m.role} className="rounded-lg border border-[var(--card-border)] p-3 space-y-1.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold block truncate">{m.label}</span>
                      {m.tagline ? (
                        <span className="text-[10px] text-[var(--muted)] line-clamp-2">{m.tagline}</span>
                      ) : null}
                    </div>
                    <span className="text-[10px] text-[var(--muted)] shrink-0">{m.percentUsed}%</span>
                  </div>
                  <ProgressBar percent={m.percentUsed} className="h-1.5" />
                  <p className="text-[10px] font-mono text-[var(--muted)]">
                    {formatTokens(m.totalUsed)} / {formatTokens(m.totalLimit)} tokens
                  </p>
                </div>
              ))}
            </div>
          </WidgetCard>
        ) : null}

        <WidgetCard title="XRG Balance" icon={Coins}>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-[var(--accent)]">
              {(xrg?.availableXrg ?? 0).toLocaleString()}
            </span>
            <span className="text-sm text-[var(--muted)]">XRG</span>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Total: {(xrg?.totalXrg ?? 0).toLocaleString()} XRG
            {(xrg?.vestedXrg ?? 0) > 0 && (
              <> · + {(xrg?.vestedXrg ?? 0).toLocaleString()} vested (30 days)</>
            )}
          </p>
          {(xrg?.tokenBoostTotal ?? 0) > 0 && (
            <p className="text-xs text-emerald-400">
              +{(xrg?.tokenBoostTotal ?? 0).toLocaleString()} token boost from tasks
            </p>
          )}
          {xrg && xrg.consistencyBonusPercent > 0 && (
            <p className="text-xs text-violet-400">
              Consistency bonus: +{xrg.consistencyBonusPercent}% this month
            </p>
          )}
          <div className="pt-2 border-t border-[var(--card-border)] space-y-1">
            <p className="text-xs font-medium text-[var(--muted)]">Future use</p>
            <ul className="text-xs text-[var(--muted)] space-y-0.5">
              <li>· Crypto exchange launch (Q4 2026)</li>
              <li>· Staking rewards & governance</li>
              <li>· Marketplace purchases</li>
            </ul>
          </div>
          <Link
            href="/dashboard/tasks"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline mt-1"
          >
            Earn more XRG
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </WidgetCard>

        <WidgetCard title="Recent Activity" icon={Activity}>
          <ul className="space-y-2.5">
            {(summary?.recentActivity ?? []).length === 0 ? (
              <li className="text-sm text-[var(--muted)] text-center py-4">No activity yet</li>
            ) : (
              summary?.recentActivity.map((item, i) => (
                <li key={`${item.created_at}-${i}`} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
                  <div className="min-w-0">
                    <p>{ACTION_LABELS[item.action] ?? item.action.replace(/_/g, ' ')}</p>
                    {item.projectName && (
                      <p className="text-xs text-violet-400 truncate">{item.projectName}</p>
                    )}
                    <p className="text-xs text-[var(--muted)]">
                      {formatSafeDistance(item.created_at)}
                    </p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </WidgetCard>

        <WidgetCard title="Billing & Plan" icon={CreditCard}>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-[var(--muted)]">Current plan: </span>
              <strong>{billing?.planName ?? 'Basic'}</strong>
              <span className="text-[var(--muted)]"> ({billing?.planPrice ?? '$19/month'})</span>
            </p>
            <p>
              <span className="text-[var(--muted)]">Next billing: </span>
              <strong>{billing?.nextBilling ?? '—'}</strong>
            </p>
          </div>

          <div className="rounded-lg bg-white/5 p-3 text-xs space-y-1">
            <p className="font-medium">Usage summary</p>
            <p className="text-[var(--muted)]">
              {(billing?.tokensIncluded ?? 7_000_000).toLocaleString()} tokens included
            </p>
            <p>
              Used: {(billing?.tokensUsed ?? 0).toLocaleString()} ({tokens?.percentUsed ?? 0}%)
            </p>
            <p>
              Remaining: {(billing?.tokensRemaining ?? 0).toLocaleString()} ({100 - (tokens?.percentUsed ?? 0)}%)
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push('/pricing')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity"
            >
              Upgrade Plan
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/billing')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40 transition-colors"
            >
              Manage Billing
            </button>
          </div>
          <p className="text-[10px] text-[var(--muted)]">
            Use XRG tokens to pay subscription (coming soon)
          </p>
        </WidgetCard>
      </div>

      <section className="glass-panel rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#4a7aff]" />
            <h2 className="font-semibold text-sm">Pricing Plans</h2>
          </div>
          <Link href="/pricing" className="text-xs text-[#4a7aff] hover:underline">
            View all
          </Link>
        </div>
        <div className="p-4">
          <PricingPlanGrid>
            {GALACTIC_PLANS.map((plan) => (
              <GalacticPlanPricingCard
                key={plan.tier}
                plan={plan}
                compact
                cta={
                  <button
                    type="button"
                    onClick={() => router.push('/pricing')}
                    className="xv-pricing-cta xv-pricing-cta--outline"
                  >
                    Get {plan.name} →
                  </button>
                }
              />
            ))}
          </PricingPlanGrid>
        </div>
      </section>
    </div>
  );
}
