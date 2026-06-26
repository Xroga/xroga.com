'use client';

import { CompactAnalytics } from '@/components/dashboard/CompactAnalytics';

export function AnalyticsView() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Performance metrics appear here once you deploy projects via Swarm.
        </p>
      </div>
      <CompactAnalytics />
      <div className="glass-panel rounded-xl p-8 text-center xv-analytics-cta universe-fade-in">
        <p className="text-sm font-medium mb-1">Waiting for your first live deployment</p>
        <p className="text-xs text-[var(--muted)]">
          Build and publish a website, app, or game — traffic, builds, and action ROI will populate automatically.
        </p>
      </div>
    </div>
  );
}
