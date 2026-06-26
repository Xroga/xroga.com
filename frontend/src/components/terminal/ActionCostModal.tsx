'use client';

import { useEffect } from 'react';
import { X, Info, Zap } from 'lucide-react';
import Link from 'next/link';
import { useTerminalChat } from '@/context/TerminalChatContext';
import {
  estimateActionCost,
  CORE_ACTION_COSTS,
  AGENT_WORKFLOW_COSTS,
  MEDIA_ACTION_COSTS,
} from '@/lib/actionCosts';

interface ActionCostModalProps {
  open: boolean;
  onClose: () => void;
}

export function ActionCostModal({ open, onClose }: ActionCostModalProps) {
  const { prompt } = useTerminalChat();
  const estimate = estimateActionCost(prompt || 'chat');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const sections = [
    { title: 'Core AI Tasks', items: CORE_ACTION_COSTS },
    { title: 'Agent Workflow', items: AGENT_WORKFLOW_COSTS.slice(0, 5) },
    { title: 'Media & Entertainment', items: MEDIA_ACTION_COSTS.slice(0, 5) },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] rounded-2xl modal-glass universe-fade-in flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-semibold">Action Costs</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-3 bg-[var(--accent)]/10 border-b border-white/10">
          <p className="text-sm">
            Your prompt estimates <strong>{estimate.cost} actions</strong> — {estimate.label}
          </p>
          {estimate.breakdown && (
            <p className="text-xs text-[var(--muted)] mt-1">{estimate.breakdown.join(' · ')}</p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {sections.map(({ title, items }) => (
            <div key={title}>
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2 flex items-center gap-1">
                <Info className="w-3 h-3" /> {title}
              </p>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 text-sm py-1 border-b border-white/5 last:border-0">
                    <span className="text-[var(--muted)] truncate">{item.task}</span>
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
