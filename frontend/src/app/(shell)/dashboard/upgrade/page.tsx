import Link from 'next/link';
import { Rocket, ArrowRight } from 'lucide-react';
import { GALACTIC_PLANS } from '@/lib/plans';
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
            Xroga AI Plan
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Start free, then move to Xroga Pro for $25 per 30-day cycle when you need more capacity.
          </p>
        </div>

        <PricingPlanGrid>
          {GALACTIC_PLANS.map((plan) => (
            <GalacticPlanPricingCard
              key={plan.tier}
              plan={plan}
              cta={plan.tier === 'free' ? (
                <Link href="/workspace" className="!w-full xv-pricing-cta xv-pricing-cta--outline !rounded-full">Start free →</Link>
              ) : (
                <CheckoutButton planTier="spark" label="Get Xroga Pro →" className="!w-full xv-pricing-cta xv-pricing-cta--outline !rounded-full" />
              )}
            />
          ))}
        </PricingPlanGrid>

        <div className="flex flex-wrap gap-3">
          <Link href="/workspace" className="xv-footer-pill !text-sm flex items-center gap-2 !text-[var(--foreground)]">
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
