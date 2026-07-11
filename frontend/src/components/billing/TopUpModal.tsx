'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Zap, Sparkles, ArrowRight } from 'lucide-react';
import { GALACTIC_PLANS, COMING_SOON_PLANS } from '@/lib/plans';
import { CheckoutButton } from './CheckoutButton';
import { CurrencyToggle } from '@/hooks/usePlanPrice';
import { useT } from '@/components/providers/LanguageProvider';
import { useAppStore } from '@/store/useAppStore';
import {
  GalacticPlanPricingCard,
  PricingPlanGrid,
  XrogaPricingCard,
} from './XrogaPricingCard';

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  const router = useRouter();
  const t = useT();
  const usage = useAppStore((s) => s.tokenUsage);
  const planTier = useAppStore((s) => s.planTier);
  const remaining = usage?.totalTokensRemaining ?? 0;
  const total = usage?.totalLimit ?? 7_000_000;
  const percentUsed = usage?.percentUsed ?? 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full sm:max-w-5xl xv-topup-modal rounded-t-2xl sm:rounded-2xl border border-[var(--card-border)] max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-[var(--card-border)]/60 bg-[var(--card)]/95 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-[#2dd4bf]/15 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-[#2dd4bf]" />
                </div>
                <h2 className="text-lg font-bold">Token Balance & Plans</h2>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-[#4a7aff]/10 to-violet-500/5 border border-[#4a7aff]/25 p-3 mb-3">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[var(--muted)]">
                    Plan: <span className="text-[#2dd4bf] font-semibold capitalize">{planTier ?? 'trial'}</span>
                  </span>
                  <span className="font-bold font-mono">
                    {formatTokens(remaining)}{' '}
                    <span className="text-[var(--muted)] font-normal">/ {formatTokens(total)}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2dd4bf] to-violet-500 transition-all"
                    style={{ width: `${Math.min(100, percentUsed)}%` }}
                  />
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-1.5">{percentUsed.toFixed(0)}% used this month</p>
              </div>

              <p className="text-[10px] text-[var(--muted)]">{t('checkout.methods')}</p>
              <div className="mt-2">
                <CurrencyToggle />
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/5 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 bg-[var(--background)]/90">
          <p className="text-xs font-semibold text-[var(--muted)] mb-4 flex items-center gap-1.5 px-1">
            <Sparkles className="w-3.5 h-3.5 text-[#2dd4bf]" />
            Higher plans include more AI tokens & XRG
          </p>

          <PricingPlanGrid className="mb-4">
            <XrogaPricingCard
              compact
              borderVariant="trial"
              name="Free Trial"
              price="$0"
              subtitle="7M tokens/mo"
              features={['1 concurrent task', 'Full Xroga AI access']}
              cta={
                <div className="xv-pricing-cta xv-pricing-cta--solid text-center cursor-default">
                  <span className="capitalize">Plan: {planTier ?? 'trial'}</span>
                  <span className="block text-[10px] font-normal opacity-85 mt-0.5">
                    {formatTokens(remaining)} tokens left
                  </span>
                </div>
              }
            />
            {GALACTIC_PLANS.map((plan) => (
              <GalacticPlanPricingCard
                key={plan.tier}
                plan={plan}
                compact
                current={planTier === plan.tier}
                cta={
                  planTier === plan.tier ? (
                    <div className="text-center py-2 text-sm font-semibold text-[#2dd4bf]">Current Plan</div>
                  ) : (
                    <CheckoutButton
                      planTier={plan.tier}
                      label={`Get ${plan.name} →`}
                      className="!w-full xv-pricing-cta xv-pricing-cta--outline !rounded-full !py-2.5 !text-xs"
                      onSuccess={onClose}
                    />
                  )
                }
              />
            ))}
          </PricingPlanGrid>

          <div className="rounded-xl border border-dashed border-[var(--card-border)] px-4 py-3 opacity-80">
            <p className="text-[10px] font-semibold text-[var(--muted)] mb-2">Micro tiers — coming soon</p>
            <div className="flex gap-2">
              {COMING_SOON_PLANS.map((p) => (
                <div key={p.price} className="flex-1 text-center py-2 rounded-lg bg-white/[0.04] border border-[var(--card-border)]/50">
                  <p className="text-sm font-bold">{p.price}</p>
                  <p className="text-[8px] text-[var(--muted)]">/mo</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 justify-center px-5 py-4 border-t border-[var(--card-border)]/60 bg-[var(--card)]/90">
          <Link href="/pricing" onClick={onClose} className="xv-pricing-details-btn !text-xs">
            Full pricing details
          </Link>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/dashboard/home');
            }}
            className="xv-footer-pill !text-xs !text-[var(--foreground)] flex items-center gap-1"
          >
            Dashboard <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
