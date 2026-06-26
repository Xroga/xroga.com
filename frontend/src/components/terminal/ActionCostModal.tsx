'use client';

import { useEffect, useState } from 'react';
import { X, Info, Zap, Calculator } from 'lucide-react';
import Link from 'next/link';
import { useTerminalChat } from '@/context/TerminalChatContext';
import {
  estimateActionCost,
  CORE_ACTION_COSTS,
  AGENT_WORKFLOW_COSTS,
  MEDIA_ACTION_COSTS,
  tasksForActionBudget,
} from '@/lib/actionCosts';

interface ActionCostModalProps {
  open: boolean;
  onClose: () => void;
}

export function ActionCostModal({ open, onClose }: ActionCostModalProps) {
  const { prompt } = useTerminalChat();
  const estimate = estimateActionCost(prompt || 'chat');
  const [budgetInput, setBudgetInput] = useState('50');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const budget = Math.max(0, parseInt(budgetInput, 10) || 0);
  const affordable = tasksForActionBudget(budget, 10);

  const sections = [
    { title: 'Core AI Tasks', items: CORE_ACTION_COSTS },
    { title: 'AI Agent Workflow', items: AGENT_WORKFLOW_COSTS },
    { title: 'Media & Entertainment', items: MEDIA_ACTION_COSTS },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] rounded-2xl modal-glass universe-fade-in flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-semibold">Complete Action Cost Master List</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 bg-[var(--primary)]/10 border-b border-white/10 space-y-2">
          <p className="text-sm">
            Your prompt estimates <strong>{estimate.cost} actions</strong> — {estimate.label}
          </p>
          {estimate.breakdown && (
            <p className="text-xs text-[var(--muted)]">{estimate.breakdown.join(' · ')}</p>
          )}
        </div>

        <div className="px-5 py-4 border-b border-white/10 bg-white/[0.02]">
          <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center gap-1">
            <Calculator className="w-3.5 h-3.5" /> Reverse calculator
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-[var(--muted)]">If I have</label>
            <input
              type="number"
              min={0}
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm font-mono"
            />
            <span className="text-sm text-[var(--muted)]">actions, I can do:</span>
          </div>
          {budget > 0 ? (
            <ul className="mt-2 space-y-1 text-xs">
              {affordable.map((item) => (
                <li key={item.id} className="flex justify-between gap-2 py-0.5">
                  <span className="text-[var(--muted)]">{item.task}</span>
                  <span className="font-mono shrink-0">
                    {Math.floor(budget / item.cost)}× ({item.cost} each)
                  </span>
                </li>
              ))}
              {affordable.length === 0 && (
                <li className="text-[var(--muted)]">Not enough for any listed task — try chat (1 action).</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-[var(--muted)] mt-2">Enter an action count above.</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {sections.map(({ title, items }) => (
            <div key={title}>
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center gap-1">
                <Info className="w-3 h-3" /> {title}
              </p>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 text-sm py-1 border-b border-white/5 last:border-0">
                    <div className="min-w-0">
                      <span className="block truncate">{item.task}</span>
                      <span className="text-[10px] text-[var(--muted)] truncate block">{item.example}</span>
                    </div>
                    <span className="font-semibold shrink-0">{item.cost}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-white/10 text-center">
          <Link href="/dashboard/billing" onClick={onClose} className="text-sm text-[var(--accent)] hover:underline">
            View billing & plans →
          </Link>
        </div>
      </div>
    </div>
  );
}
