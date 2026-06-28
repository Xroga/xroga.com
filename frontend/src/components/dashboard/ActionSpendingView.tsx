'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ALL_ACTION_COSTS, tasksForActionBudget, budgetTaskLine } from '@/lib/actionCosts';
import { api } from '@/lib/api';
import Link from 'next/link';
import { UiverseTableCard } from '@/components/ui/UiverseTableCard';

export function ActionSpendingView() {
  const actions = useAppStore((s) => s.actions);
  const [calcBudget, setCalcBudget] = useState(String(actions?.remaining ?? 50));
  const [recentSpend, setRecentSpend] = useState<
    { task: string; spent: number; builds: string }[]
  >([]);
  const budget = Math.max(0, parseInt(calcBudget, 10) || 0);
  const affordable = tasksForActionBudget(budget);
  const used = (actions?.total ?? 50) - (actions?.remaining ?? 50);
  const pct = actions?.total ? Math.round((used / actions.total) * 100) : 0;

  useEffect(() => {
    setCalcBudget(String(actions?.remaining ?? 50));
  }, [actions?.remaining]);

  useEffect(() => {
    Promise.all([api.profile.activity().catch(() => []), api.swarm.history().catch(() => [])])
      .then(([activity, history]) => {
        const rows: { task: string; spent: number; builds: string }[] = [];
        for (const log of activity.slice(0, 8)) {
          const cost = typeof log.details?.cost === 'number' ? log.details.cost : 1;
          rows.push({
            task: log.action.replace(/_/g, ' '),
            spent: cost,
            builds: (log.projects?.name as string) ?? String(log.details?.description ?? '—').slice(0, 60),
          });
        }
        for (const run of history.slice(0, 5)) {
          if (rows.length >= 10) break;
          rows.push({
            task: run.status === 'completed' ? 'Swarm task' : `Swarm (${run.status})`,
            spent: 1,
            builds: run.prompt.slice(0, 60) + (run.prompt.length > 60 ? '…' : ''),
          });
        }
        setRecentSpend(rows.length ? rows : []);
      })
      .catch(() => setRecentSpend([]));
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Action Spending</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Track what you spend, what you built, and what&apos;s left.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-5 xv-fuel-card">
          <p className="text-xs text-[var(--muted)]">Remaining</p>
          <p className="text-3xl font-bold text-[var(--accent)]">{actions?.remaining ?? 50}</p>
          <p className="text-xs text-[var(--muted)] mt-1">of {actions?.total ?? 50} total</p>
        </div>
        <div className="glass-panel rounded-xl p-5 xv-fuel-card">
          <p className="text-xs text-[var(--muted)]">Used</p>
          <p className="text-3xl font-bold">{used}</p>
          <p className="text-xs text-[var(--muted)] mt-1">{pct}% of fuel burned</p>
        </div>
        <div className="glass-panel rounded-xl p-5 xv-fuel-card">
          <p className="text-xs text-[var(--muted)]">Plan</p>
          <p className="text-3xl font-bold capitalize">{actions?.planTier ?? 'unpaid'}</p>
          <Link href="/dashboard/billing" className="text-xs text-[var(--accent)] hover:underline mt-1 inline-block">
            Manage billing →
          </Link>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-5 space-y-3">
        <h2 className="font-semibold">Action calculator</h2>
        <p className="text-xs text-[var(--muted)]">
          Enter your action budget — see every task you can afford and what you cannot yet do.
        </p>
        <input
          type="number"
          min={0}
          value={calcBudget}
          onChange={(e) => setCalcBudget(e.target.value)}
          className="w-32 px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm font-mono"
        />
        <UiverseTableCard
          title="action calculator"
          rows={affordable.map((item) => ({
            left: item.task,
            right: budgetTaskLine(item, budget),
          }))}
        />
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-sm px-1">Recent spend by task</h2>
        {recentSpend.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--muted)] text-center glass-panel rounded-xl">
            No spend yet — run your first Swarm task from the dashboard terminal.
          </p>
        ) : (
          <UiverseTableCard
            title="recent spend"
            rows={recentSpend.map((row) => ({
              left: row.task,
              right: `${row.spent} · ${row.builds.slice(0, 20)}`,
            }))}
          />
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-sm px-1">Action cost reference</h2>
        <UiverseTableCard
          title="all action costs"
          rows={ALL_ACTION_COSTS.map((item) => ({
            left: item.task,
            right: String(item.cost),
          }))}
        />
      </div>
    </div>
  );
}
