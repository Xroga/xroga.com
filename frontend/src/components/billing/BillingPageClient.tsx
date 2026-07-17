'use client';

import { GALACTIC_PLANS, COMING_SOON_PLANS } from '@/lib/plans';
import { FEATURE_COUNT } from '@/lib/features';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { GalacticPlanPricingCard, PricingPlanGrid } from '@/components/billing/XrogaPricingCard';
import { useAppStore } from '@/store/useAppStore';
import { Shield, Layers, Sparkles, Lock } from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SubscriptionManagePanel } from '@/components/billing/SubscriptionManagePanel';

export function BillingPageClient() {
  const planName = useAppStore((s) => s.planName);
  const planTier = useAppStore((s) => s.planTier);

  return (
    <PageFullscreenFrame>
      <div className="max-w-6xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Billing</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Manage your plan — all {FEATURE_COUNT} features stay unlocked on every tier.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 border-[var(--primary)]/30">
          <h2 className="font-semibold text-lg">Current Plan</h2>
          <p className="mt-3 text-sm">
            <span className="font-semibold">{planName ?? 'Basic'}</span>
            {planTier && planTier !== 'unpaid' && (
              <span className="text-[var(--muted)] capitalize"> ({planTier})</span>
            )}
          </p>
          <p className="text-xs text-[var(--muted)] mt-2">
            Legacy token meters and provider usage panels have been removed from billing.
          </p>
        </div>

        <SubscriptionManagePanel />

        <div>
          <h2 className="text-xl font-bold mb-2">Galactic Plans</h2>
          <p className="text-sm text-[var(--muted)] mb-6">
            Choose concurrency and plan tier. Token/XRG marketing quotas are retired.
          </p>
          <PricingPlanGrid>
            {GALACTIC_PLANS.map((plan) => (
              <GalacticPlanPricingCard
                key={plan.tier}
                plan={plan}
                current={planTier === plan.tier}
                cta={
                  planTier === plan.tier ? (
                    <div className="text-center py-2 text-sm font-semibold text-[#4a7aff]">Current Plan</div>
                  ) : (
                    <CheckoutButton
                      planTier={plan.tier}
                      label={`Get ${plan.name} →`}
                      className="!w-full xv-pricing-cta xv-pricing-cta--outline !rounded-full"
                    />
                  )
                }
              />
            ))}
          </PricingPlanGrid>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#4a7aff]" />
            Coming Soon
          </h3>
          <div className="flex flex-wrap gap-3">
            {COMING_SOON_PLANS.map((p) => (
              <span key={p.name} className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[var(--muted)]">
                {p.name} {p.price}
              </span>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div className="glass-panel rounded-xl p-4 flex gap-3">
            <Shield className="w-5 h-5 text-[#4a7aff] shrink-0" />
            <div>
              <p className="font-semibold">Secure checkout</p>
              <p className="text-[var(--muted)] text-xs mt-1">Billing runs through Paddle.</p>
            </div>
          </div>
          <div className="glass-panel rounded-xl p-4 flex gap-3">
            <Layers className="w-5 h-5 text-[#4a7aff] shrink-0" />
            <div>
              <p className="font-semibold">All features</p>
              <p className="text-[var(--muted)] text-xs mt-1">
                Every paid tier unlocks the full product surface.
              </p>
            </div>
          </div>
          <div className="glass-panel rounded-xl p-4 flex gap-3">
            <Lock className="w-5 h-5 text-[#4a7aff] shrink-0" />
            <div>
              <p className="font-semibold">Cancel anytime</p>
              <p className="text-[var(--muted)] text-xs mt-1">Manage or cancel from subscription settings.</p>
            </div>
          </div>
        </div>
      </div>
    </PageFullscreenFrame>
  );
}
