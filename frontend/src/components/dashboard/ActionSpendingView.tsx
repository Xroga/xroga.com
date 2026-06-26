'use client';

import { useAppStore } from '@/store/useAppStore';
import { ALL_ACTION_COSTS, estimateActionCost, tasksForActionBudget } from '@/lib/actionCosts';
import { useState } from 'react';
import Link from 'next/link';

const SAMPLE_SPEND = [
  { task: 'Chat / Text AI', spent: 12, builds: 'Research notes' },
  { task: 'Code Generation', spent: 9, builds: 'Login page draft' },
  { task: 'Image Generation', spent: 8, builds: 'Logo concepts' },
  { task: 'Full App Build (Swarm)', spent: 0, builds: '—' },
];

export function ActionSpendingView() {
  const actions = useAppStore((s) => s.actions);
  const [calcPrompt, setCalcPrompt] = useState('');
  const [calcBudget, setCalcBudget] = useState(String(actions?.remaining ?? 50));
  const estimate = estimateActionCost(calcPrompt || 'chat');
  const affordable = tasksForActionBudget(Math.max(0, parseInt(calcBudget, 10) || 0), 8);
  const used = (actions?.total ?? 50) - (actions?.remaining ?? 50);
  const pct = actions?.total ? Math.round((used / actions.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Action Spending</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Track what you spend, what you built, and what&apos;s left.</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-5">
          <p className="text-xs text-[var(--muted)]">Remaining</p>
          <p className="text-3xl font-bold text-[var(--accent)]">{actions?.remaining ?? 50}</p>
          <p className="text-xs text-[var(--muted)] mt-1">of {actions?.total ?? 50} total</p>
        </div>
        <div className="glass-panel rounded-xl p-5">
          <p className="text-xs text-[var(--muted)]">Used</p>
          <p className="text-3xl font-bold">{used}</p>
          <p className="text-xs text-[var(--muted)] mt-1">{pct}% of fuel burned</p>
        </div>
        <div className="glass-panel rounded-xl p-5">
          <p className="text-xs text-[var(--muted)]">Plan</p>
          <p className="text-3xl font-bold capitalize">{actions?.planTier ?? 'unpaid'}</p>
          <Link href="/dashboard/billing" className="text-xs text-[var(--accent)] hover:underline mt-1 inline-block">
            Manage billing →
          </Link>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-5">
        <h2 className="font-semibold mb-3">Pre-task calculator</h2>
        <p className="text-sm text-[var(--muted)] mb-3">Estimate actions before you run a task.</p>
        <input
          value={calcPrompt}
          onChange={(e) => setCalcPrompt(e.target.value)}
          placeholder="e.g. Build a React dashboard with auth..."
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-[var(--card-border)] text-sm mb-3"
        />
        <p className="text-sm">
          Est. <strong className="text-[var(--accent)]">{estimate.cost}</strong> actions for{' '}
          <strong>{estimate.label}</strong>
          {estimate.breakdown && (
            <span className="block text-xs text-[var(--muted)] mt-1">{estimate.breakdown.join(' · ')}</span>
          )}
        </p>
        <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
          <p className="text-xs text-[var(--muted)] mb-2">Or enter actions to see what you can do:</p>
          <input
            type="number"
            min={0}
            value={calcBudget}
            onChange={(e) => setCalcBudget(e.target.value)}
            className="w-28 px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm font-mono mb-2"
          />
          <ul className="text-xs space-y-1">
            {affordable.map((item) => (
              <li key={item.id} className="flex justify-between">
                <span className="text-[var(--muted)]">{item.task}</span>
                <span className="font-mono">{Math.floor((parseInt(calcBudget, 10) || 0) / item.cost)}×</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-border)] font-semibold text-sm">Recent spend by task</div>
        <div className="divide-y divide-[var(--card-border)]">
          {SAMPLE_SPEND.map((row) => (
            <div key={row.task} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-medium">{row.task}</p>
                <p className="text-xs text-[var(--muted)]">Built: {row.builds}</p>
              </div>
              <span className="font-mono text-[var(--accent)]">{row.spent} actions</span>
            </div>
          ))}
        </div>
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
