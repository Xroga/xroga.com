'use client';

import { PanelLoader } from '@/components/ui/PanelLoader';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowUpRight, CreditCard, Gauge } from 'lucide-react';
import { api, type DashboardSummary } from '@/lib/api';
import { formatSafeDate, formatSafeDistance, safeDate } from '@/lib/safeDates';
import { cn } from '@/lib/utils';

const ACTION_LABELS: Record<string, string> = {
  swarm_completed: 'Build completed',
  generated_image: 'Media generated',
  file_uploaded: 'File uploaded',
  task_completed: 'Task completed',
  created_project: 'Project created',
  generated_video: 'Video generated',
  pushed_to_github: 'Pushed to GitHub',
};

function WidgetCard({ title, icon: Icon, children, className }: {
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

function PercentBar({ value, label }: { value: number | null; label: string }) {
  if (value == null) return <p className="text-sm text-[var(--muted)]">{label}: unavailable</p>;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="h-2 rounded-full bg-[var(--foreground)]/10 overflow-hidden">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function DashboardHomeView() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api.dashboard.summary()
      .then(setSummary)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PanelLoader height={40} />
        <div className="grid gap-4 md:grid-cols-2">
          <PanelLoader height={220} />
          <PanelLoader height={220} />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-3xl mx-auto glass-panel rounded-xl p-6">
        <h1 className="text-xl font-semibold">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Your account state could not be verified. No successful status has been assumed.</p>
        <button type="button" onClick={load} className="mt-4 px-3 py-2 rounded-lg border border-[var(--card-border)] text-sm">Try again</button>
      </div>
    );
  }

  const now = safeDate(summary.now) ?? new Date();
  const { billing, entitlement } = summary;
  const stateLabel = entitlement.state.replace(/_/g, ' ');

  return (
    <div className="max-w-6xl mx-auto space-y-6 universe-fade-in">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {formatSafeDate(now, 'EEEE, MMMM d, yyyy')} · {formatSafeDate(now, 'h:mm a')}
          </p>
        </div>
        <Link href="/workspace" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline">
          Open Workspace <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      {/* Plan & Usage. Given a heading and an anchor because it is no longer reachable
          from a sidebar row of its own — capacity and billing already lived here, so
          the nav entry was a second door to the same place rather than the only one. */}
      <section id="plan-usage" aria-labelledby="dash-plan-usage" className="space-y-3 scroll-mt-24">
        <h2 id="dash-plan-usage" className="text-sm font-semibold text-[var(--foreground)]">
          Plan &amp; Usage
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
        <WidgetCard title="AI Capacity" icon={Gauge}>
          <PercentBar label="Capacity remaining" value={entitlement.capacityRemainingPercent} />
          <PercentBar label="Available now" value={entitlement.availableNowPercent} />
          <p className="text-xs text-[var(--muted)] capitalize">Pacing: {entitlement.pacing?.replace(/_/g, ' ') ?? 'not active'}</p>
          {entitlement.nextUnlockAt && <p className="text-xs text-[var(--muted)]">Next unlock: {formatSafeDate(entitlement.nextUnlockAt, 'MMM d, h:mm a')}</p>}
          <Link href="/dashboard/billing" className="inline-flex text-xs font-semibold text-[var(--accent)] hover:underline">Review Plan & Usage</Link>
        </WidgetCard>

        <WidgetCard title="Billing & Plan" icon={CreditCard}>
          <dl className="space-y-2 text-sm">
            <div><dt className="inline text-[var(--muted)]">Plan: </dt><dd className="inline font-semibold">{billing.planName}</dd></div>
            <div><dt className="inline text-[var(--muted)]">Price: </dt><dd className="inline font-semibold">{billing.planPrice}</dd></div>
            <div><dt className="inline text-[var(--muted)]">Status: </dt><dd className="inline font-semibold capitalize">{stateLabel}</dd></div>
            <div><dt className="inline text-[var(--muted)]">Cycle ends: </dt><dd className="inline font-semibold">{billing.nextBilling ? formatSafeDate(billing.nextBilling, 'MMM d, yyyy') : 'not active'}</dd></div>
          </dl>
          {entitlement.state === 'promotional_eligible' && (
            <p className="text-xs text-[var(--muted)]">Activate by August 30, 2026 for 30 complete days free. No card and no automatic charge.</p>
          )}
          <Link href="/pricing" className="inline-flex px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40">View plan</Link>
        </WidgetCard>
        </div>
      </section>

      <WidgetCard title="Recent Activity" icon={Activity}>
        <ul className="grid gap-2.5 md:grid-cols-2">
          {summary.recentActivity.length === 0 ? (
            <li className="text-sm text-[var(--muted)] py-4">No recorded activity yet.</li>
          ) : summary.recentActivity.map((item, index) => (
            <li key={`${item.created_at}-${index}`} className="flex items-start gap-2 text-sm rounded-lg border border-[var(--card-border)] p-3">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
              <div className="min-w-0">
                <p>{ACTION_LABELS[item.action] ?? item.action.replace(/_/g, ' ')}</p>
                {item.projectName && <p className="text-xs text-[var(--accent)] truncate">{item.projectName}</p>}
                <p className="text-xs text-[var(--muted)]">{formatSafeDistance(item.created_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      </WidgetCard>
    </div>
  );
}
