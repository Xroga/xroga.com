'use client';

import Link from 'next/link';
import { Brain, X } from 'lucide-react';
import { CheckoutButton } from './CheckoutButton';

interface OutOfActionsModalProps {
  open: boolean;
  onClose: () => void;
}

export function OutOfActionsModal({ open, onClose }: OutOfActionsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md glass-panel-strong rounded-2xl p-8 text-center border border-red-500/30">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/5">
          <X className="w-5 h-5" />
        </button>
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <Brain className="w-7 h-7 text-red-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Monthly Token Quota Reached</h2>
        <p className="text-[var(--muted)] text-sm mb-6">
          You&apos;ve used your monthly token allocation. Upgrade your plan or claim emergency tokens from your dashboard.
        </p>
        <Link
          href="/dashboard"
          className="block w-full mb-3 px-4 py-2.5 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] font-semibold text-sm hover:bg-[var(--accent)]/25 transition-colors"
          onClick={onClose}
        >
          View Token Usage
        </Link>
        <CheckoutButton planTier="nova" label="Upgrade Plan" className="w-full mb-3" onSuccess={onClose} />
        <Link
          href="/pricing"
          className="block text-sm text-[var(--accent)] hover:underline"
          onClick={onClose}
        >
          View all Galactic Tiers →
        </Link>
      </div>
    </div>
  );
}
