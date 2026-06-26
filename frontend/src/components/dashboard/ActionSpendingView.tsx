'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { ALL_ACTION_COSTS, tasksForActionBudget, budgetTaskLine } from '@/lib/actionCosts';
import { api } from '@/lib/api';
import Link from 'next/link';

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

      <div className="glass-panel rounded-xl p-5">
        <h2 className="font-semibold mb-3">Action calculator</h2>
        <p className="text-xs text-[var(--muted)] mb-3">
          Enter your action budget — see every task you can afford (1 action chat included) and what you cannot yet do.
        </p>
        <input
          type="number"
          min={0}
          value={calcBudget}
          onChange={(e) => setCalcBudget(e.target.value)}
          className="w-32 px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm font-mono mb-3"
        />
        <ul className="text-xs space-y-1 max-h-64 overflow-y-auto">
          {affordable.map((item) => {
            const canDo = budget >= item.cost;
            return (
              <li
                key={item.id}
                className={`flex justify-between gap-2 py-1 border-b border-[var(--card-border)]/30 ${!canDo ? 'opacity-50' : ''}`}
              >
                <span className={canDo ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'}>
                  {item.task}
                  <span className="text-[var(--muted)] ml-1">({item.cost})</span>
                </span>
                <span className={`font-mono shrink-0 ${canDo ? 'text-[var(--accent)]' : 'text-red-400/80'}`}>
                  {budgetTaskLine(item, budget)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)] font-semibold text-sm">
          Recent spend by task
        </div>
        {recentSpend.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[var(--muted)] text-center">
            No spend yet — run your first Swarm task from the dashboard terminal.
          </p>
        ) : (
          <div className="divide-y divide-[var(--card-border)]">
            {recentSpend.map((row, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium capitalize">{row.task}</p>
                  <p className="text-xs text-[var(--muted)]">Built: {row.builds}</p>
                </div>
                <span className="font-mono text-[var(--accent)]">{row.spent} actions</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-xl p-5">
        <h2 className="font-semibold mb-3">Action cost reference</h2>
        <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto text-xs">
          {ALL_ACTION_COSTS.map((item) => (
            <div key={item.id} className="flex justify-between py-1.5 border-b border-[var(--card-border)]/50">
              <span>{item.task}</span>
              <span className="font-mono">{item.cost}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
