'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Zap, Fuel, Sparkles, Lock, ArrowRight, Check } from 'lucide-react';
import { GALACTIC_PLANS, COMING_SOON_PLANS } from '@/lib/plans';
import { CheckoutButton } from './CheckoutButton';
import { FEATURE_COUNT } from '@/lib/features';

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
}

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  const router = useRouter();
  const [tab, setTab] = useState<'plans' | 'explain'>('explain');

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="relative w-full sm:max-w-3xl glass-panel-strong rounded-t-2xl sm:rounded-2xl border border-[var(--card-border)] max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-[var(--card-border)]/60">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-[var(--accent)]/15 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <h2 className="text-lg font-bold">Top Up Actions</h2>
              </div>
              <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
                Swarm fuel for every task.{' '}
                <span className="text-[var(--foreground)] font-medium">
                  All {FEATURE_COUNT} features free on every plan.
                </span>{' '}
                Pay only for compute.
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/5 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-1 mt-4 p-1 rounded-full bg-white/[0.04] border border-[var(--card-border)]/50 w-fit">
            {(['explain', 'plans'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
                  tab === key
                    ? 'bg-[var(--accent)] text-[var(--background)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {key === 'explain' ? 'How it works' : 'Choose a plan'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'explain' && (
            <div className="space-y-2 mb-5">
              {[
                { icon: Fuel, title: 'Actions = fuel', desc: 'Chat uses 1 action. Bigger builds use more.' },
                { icon: Sparkles, title: 'All features included', desc: `${FEATURE_COUNT} features + 710 integrations on every tier.` },
                { icon: Check, title: 'Top up anytime', desc: 'Upgrade monthly fuel. Resets each billing cycle.' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 py-2.5 px-3 rounded-xl bg-white/[0.02]">
                  <Icon className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-[var(--muted)]">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            {GALACTIC_PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 border transition-all ${
                  plan.highlight
                    ? 'border-[var(--accent)]/50 bg-[var(--accent)]/6'
                    : 'border-[var(--card-border)]/60 bg-white/[0.02]'
                }`}
              >
                <div className="flex-1 min-w-[140px]">
                  {plan.highlight && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] block mb-0.5">
                      ★ Most Popular
                    </span>
                  )}
                  <p className="font-bold">{plan.name}</p>
                  <p className="text-[10px] text-[var(--muted)]">{plan.tagline}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold">
                    {plan.priceLabel}
                    <span className="text-[10px] font-normal text-[var(--muted)]">/mo</span>
                  </p>
                  <p className="text-xs text-[var(--accent)] font-semibold">{plan.actionsLabel}</p>
                </div>
                <div className="w-full sm:w-auto shrink-0">
                  <CheckoutButton planTier={plan.tier} className="!w-full sm:!w-auto min-w-[100px]" onSuccess={onClose} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-[var(--card-border)]/70 px-4 py-3">
            <p className="text-[10px] font-semibold text-[var(--muted)] mb-2 flex items-center gap-1">
              <Lock className="w-3 h-3" /> $6 · $9 · $10/mo — coming soon
            </p>
            <div className="flex gap-2">
              {COMING_SOON_PLANS.map((p) => (
                <div key={p.price} className="flex-1 text-center py-2 rounded-lg bg-white/[0.03] border border-[var(--card-border)]/50 opacity-75">
                  <p className="text-sm font-bold">{p.price}</p>
                  <p className="text-[8px] text-[var(--muted)]">/mo</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 justify-center px-5 py-4 border-t border-[var(--card-border)]/60 bg-white/[0.02]">
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/dashboard');
            }}
            className="xv-footer-pill !text-xs flex items-center gap-1.5 !text-[var(--foreground)]"
          >
            Back to Dashboard <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <Link href="/pricing" onClick={onClose} className="xv-footer-pill !text-xs">
            Full pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
