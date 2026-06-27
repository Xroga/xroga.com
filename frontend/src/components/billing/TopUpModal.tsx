'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Zap, Fuel, Sparkles, Lock, ArrowRight } from 'lucide-react';
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-4xl glass-panel-strong rounded-2xl p-6 max-h-[92vh] overflow-y-auto border border-[var(--card-border)]">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-[var(--accent)]" />
              <h2 className="text-xl font-bold">Top Up Actions</h2>
            </div>
            <p className="text-sm text-[var(--muted)] max-w-lg">
              Actions are your Swarm fuel — each AI task (chat, build, scrape, image) burns actions.{' '}
              <strong className="text-[var(--foreground)]">All {FEATURE_COUNT} features are free on every plan.</strong> You only
              pay for compute fuel.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setTab('explain')}
            className={`text-xs px-3 py-1.5 rounded-full border ${tab === 'explain' ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--card-border)] text-[var(--muted)]'}`}
          >
            How it works
          </button>
          <button
            type="button"
            onClick={() => setTab('plans')}
            className={`text-xs px-3 py-1.5 rounded-full border ${tab === 'plans' ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]' : 'border-[var(--card-border)] text-[var(--muted)]'}`}
          >
            Choose a plan
          </button>
        </div>

        {tab === 'explain' && (
          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            {[
              {
                icon: Fuel,
                title: '1. Actions = fuel',
                desc: 'Every Swarm command uses actions. Bigger builds (apps, games) use more; chat uses 1.',
              },
              {
                icon: Sparkles,
                title: '2. All features included',
                desc: `Browser, automation, 710+ integrations, and all ${FEATURE_COUNT} features — unlocked on every paid tier.`,
              },
              {
                icon: Zap,
                title: '3. Top up anytime',
                desc: 'Upgrade your monthly fuel. Unused actions reset each billing cycle on subscription plans.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-[var(--card-border)] p-4 bg-white/[0.02]">
                <Icon className="w-5 h-5 text-[var(--accent)] mb-2" />
                <p className="text-sm font-semibold mb-1">{title}</p>
                <p className="text-xs text-[var(--muted)] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {GALACTIC_PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`rounded-xl p-4 border transition-all ${
                plan.highlight
                  ? 'border-[var(--accent)]/60 bg-[var(--accent)]/8 ring-1 ring-[var(--accent)]/30'
                  : 'border-[var(--card-border)] glass-panel'
              }`}
            >
              {plan.highlight && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] mb-2 block">
                  ★ Most Popular
                </span>
              )}
              <h3 className="font-bold text-lg">{plan.name}</h3>
              {plan.tagline && <p className="text-[10px] text-[var(--muted)] mb-2">{plan.tagline}</p>}
              <p className="text-2xl font-bold">
                {plan.priceLabel}
                <span className="text-xs font-normal text-[var(--muted)]">/mo</span>
              </p>
              <p className="text-sm text-[var(--accent)] font-semibold mt-1">{plan.actionsLabel}</p>
              <p className="text-[10px] text-[var(--muted)] mt-1">{plan.concurrency} concurrent tasks</p>
              <CheckoutButton planTier={plan.tier} className="mt-4 w-full" onSuccess={onClose} />
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-[var(--card-border)] p-4 mb-6">
          <p className="text-xs font-semibold text-[var(--muted)] mb-3 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Budget plans — coming soon
          </p>
          <div className="flex flex-wrap gap-2">
            {COMING_SOON_PLANS.map((p) => (
              <div
                key={p.price}
                className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-center min-w-[72px] opacity-70"
              >
                <p className="text-sm font-bold">{p.price}</p>
                <p className="text-[9px] text-[var(--muted)]">/mo · {p.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/dashboard');
            }}
            className="xv-footer-pill !text-sm flex items-center gap-2 !text-[var(--foreground)]"
          >
            Back to Dashboard <ArrowRight className="w-4 h-4" />
          </button>
          <Link href="/pricing" onClick={onClose} className="xv-footer-pill !text-sm">
            Full pricing page
          </Link>
        </div>
      </div>
    </div>
  );
}
