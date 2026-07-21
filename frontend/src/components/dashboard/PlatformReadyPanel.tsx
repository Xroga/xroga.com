'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type ReadyPayload = {
  ready: boolean;
  requiredOk: number;
  requiredTotal: number;
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    required: boolean;
    hint?: string;
  }>;
};

/** Operator gate: are platform secrets / OAuth apps green before users build? */
export function PlatformReadyPanel({ className }: { className?: string }) {
  const [data, setData] = useState<ReadyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await api.dashboard.platformReady();
        setData(res);
        setError(null);
      } catch (e) {
        setError((e as Error).message || 'Could not load platform readiness');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className={cn('rounded-xl border border-[var(--card-border)] p-4 space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-[var(--accent)]" />
        <h3 className="text-sm font-bold">Platform ready (operators)</h3>
        {data ? (
          <span
            className={cn(
              'ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border',
              data.ready
                ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
                : 'border-amber-500/40 text-amber-600 bg-amber-500/10',
            )}
          >
            {data.requiredOk}/{data.requiredTotal} required
          </span>
        ) : null}
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        Operator checklist for Fly secrets / OAuth apps — not shown to end users on Integrations.
        Boolean checks only; secret values are never shown.
      </p>
      {loading ? (
        <p className="text-xs text-[var(--muted)] flex items-center gap-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {data ? (
        <ul className="space-y-1.5">
          {data.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-[11px]">
              {c.ok ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-[var(--muted)] shrink-0 mt-0.5" />
              )}
              <span className="flex-1">
                <span className="text-[var(--foreground)] font-medium">{c.label}</span>
                {c.required ? (
                  <span className="text-[var(--muted)]"> · required</span>
                ) : (
                  <span className="text-[var(--muted)]"> · optional</span>
                )}
                {!c.ok && c.hint ? (
                  <span className="block text-[var(--muted)] font-mono">{c.hint}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
