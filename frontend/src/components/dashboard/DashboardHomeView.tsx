'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Skeleton from 'react-loading-skeleton';
import { CreditCard, Activity, ArrowUpRight, Cpu } from 'lucide-react';
import { api, type DashboardSummary } from '@/lib/api';
import { GALACTIC_PLANS } from '@/lib/plans';
import { GalacticPlanPricingCard, PricingPlanGrid } from '@/components/billing/XrogaPricingCard';
import { formatSafeDate, formatSafeDistance, safeDate } from '@/lib/safeDates';
import { cn } from '@/lib/utils';
import 'react-loading-skeleton/dist/skeleton.css';

const ACTION_LABELS: Record<string, string> = {
  swarm_completed: 'Build completed',
  generated_image: 'Media generated',
  file_uploaded: 'File uploaded',
  task_completed: 'Task completed',
  created_project: 'Project created',
  generated_video: 'Video generated',
  pushed_to_github: 'Pushed to GitHub',
};

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

  const load = useCallback(() => {
    setLoading(true);
    api.dashboard
      .summary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = safeDate(summary?.now) ?? new Date();
  const billing = summary?.billing;
  const tokens = summary?.tokens;
  const modelPools = tokens?.byModel ?? [];

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <Skeleton height={40} width={280} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton height={220} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
          <Skeleton height={220} baseColor="#1a1a2e" highlightColor="#2a2a3e" />
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

      {tokens && (
        <WidgetCard title="AI Capacity" icon={Cpu} className="md:col-span-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <p>
                <span className="text-[var(--muted)]">Monthly pool: </span>
                <strong>{tokens.totalUsed.toLocaleString()}</strong>
                <span className="text-[var(--muted)]"> / {tokens.totalLimit.toLocaleString()} tokens</span>
              </p>
              <p className="text-xs text-[var(--muted)]">{tokens.percentUsed}% used</p>
            </div>
            <div className="h-2 rounded-full bg-[var(--foreground)]/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all"
                style={{ width: `${Math.min(100, tokens.percentUsed)}%` }}
              />
            </div>
            {modelPools.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {modelPools.map((pool) => (
                  <li
                    key={pool.role}
                    className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{pool.label}</span>
                      <span className="text-[var(--muted)]">{pool.percentUsed}%</span>
                    </div>
                    {pool.tagline && (
                      <p className="text-[var(--muted)] mt-0.5">{pool.tagline}</p>
                    )}
                    <p className="mt-1 text-[var(--muted)]">
                      {pool.totalUsed.toLocaleString()} / {pool.totalLimit.toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </WidgetCard>
      )}

      <div className="grid gap-4 md:grid-cols-2">
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
