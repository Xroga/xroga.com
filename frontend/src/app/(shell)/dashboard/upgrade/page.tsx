import Link from 'next/link';
import { Rocket, ArrowRight } from 'lucide-react';
import { GALACTIC_PLANS } from '@/lib/plans';
import { FEATURE_COUNT } from '@/lib/features';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { GalacticPlanPricingCard, PricingPlanGrid } from '@/components/billing/XrogaPricingCard';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';

export default function UpgradePage() {
  return (
    <PageFullscreenFrame>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Rocket className="w-7 h-7 text-[#4a7aff]" />
            Upgrade Your Plan
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            All {FEATURE_COUNT} features unlocked on every plan. Upgrade for more tokens and concurrency.
          </p>
        </div>

        <PricingPlanGrid>
          {GALACTIC_PLANS.map((plan) => (
            <GalacticPlanPricingCard
              key={plan.tier}
              plan={plan}
              cta={
                <CheckoutButton
                  planTier={plan.tier}
                  label={`Get ${plan.name} →`}
                  className="!w-full xv-pricing-cta xv-pricing-cta--outline !rounded-full"
                />
              }
            />
          ))}
        </PricingPlanGrid>

        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="xv-footer-pill !text-sm flex items-center gap-2 !text-[var(--foreground)]">
            Back to Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/pricing" className="xv-footer-pill !text-sm">
            Full pricing page
          </Link>
        </div>
      </div>
    </PageFullscreenFrame>
  );
}
