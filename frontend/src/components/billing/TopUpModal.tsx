'use client';

import Link from 'next/link';
import { X, Zap } from 'lucide-react';
import { GALACTIC_PLANS } from '@/lib/plans';
import { CheckoutButton } from './CheckoutButton';

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
}

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-3xl glass-panel-strong rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-xl font-semibold">Top Up Actions</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-[var(--muted)] mb-6">
          All 92 features unlocked on every plan. You only pay for compute fuel.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GALACTIC_PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`glass-panel rounded-xl p-4 ${plan.highlight ? 'border-[var(--accent)]/50 glow-green' : ''}`}
            >
              <h3 className="font-semibold">{plan.name}</h3>
              <p className="text-2xl font-bold mt-1">{plan.priceLabel}<span className="text-xs text-[var(--muted)]">/mo</span></p>
              <p className="text-xs text-[var(--muted)] mt-1">{plan.actionsLabel}</p>
              <CheckoutButton planTier={plan.tier} className="mt-4 w-full" onSuccess={onClose} />
            </div>
          ))}
        </div>
        <Link href="/pricing" className="block text-center text-sm text-[var(--accent)] mt-6 hover:underline">
          Compare all plans →
        </Link>
      </div>
    </div>
  );
}
