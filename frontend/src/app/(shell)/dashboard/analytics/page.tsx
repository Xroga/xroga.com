'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PlatformReadyPanel } from '@/components/dashboard/PlatformReadyPanel';

type ShipAnalytics = Awaited<ReturnType<typeof api.dashboard.shipAnalytics>>;

export default function AnalyticsPage() {
  const [data, setData] = useState<ShipAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.dashboard.shipAnalytics();
        setData(res);
      } catch (e) {
        setError((e as Error).message || 'Could not load ship analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Ship analytics</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Real outcomes from your builds — shipped, handoff, blocked, failed. Not vanity marketing
          metrics.
        </p>
      </div>

      <PlatformReadyPanel />

      {loading ? (
        <p className="text-sm text-[var(--muted)] flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading runs…
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(
              [
                ['Runs', data.totals.runs],
                ['Shipped', data.totals.shipped],
                ['Handoff', data.totals.handoff],
                ['Blocked', data.totals.blocked],
                ['Failed', data.totals.failed],
              ] as const
            ).map(([label, n]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--card-border)] p-3 text-center"
              >
                <p className="text-lg font-bold">{n}</p>
                <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
              </div>
            ))}
          </div>

          {Object.keys(data.byKind).length > 0 ? (
            <div className="rounded-xl border border-[var(--card-border)] p-4">
              <h2 className="text-sm font-semibold mb-2">By product kind</h2>
              <ul className="text-xs space-y-1">
                {Object.entries(data.byKind).map(([k, n]) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="font-mono">{k}</span>
                    <span className="text-[var(--muted)]">{n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-xl border border-[var(--card-border)] overflow-hidden">
            <div className="px-4 py-2 border-b border-[var(--card-border)] text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Recent ships
            </div>
            {data.recent.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted)]">
                No swarm runs yet.{' '}
                <Link href="/workspace" className="text-[var(--accent)] font-semibold">
                  Open workspace
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-[var(--card-border)]">
                {data.recent.map((r) => (
                  <li key={r.id} className="px-4 py-3 text-sm flex flex-wrap gap-2 items-baseline">
                    <span className="font-semibold truncate flex-1 min-w-[12rem]">{r.prompt}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wide text-[var(--accent)]">
                      {r.ship}
                    </span>
                    {r.scaffoldKind ? (
                      <span className="text-[10px] font-mono text-[var(--muted)]">
                        {r.scaffoldKind}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-[var(--muted)]">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
