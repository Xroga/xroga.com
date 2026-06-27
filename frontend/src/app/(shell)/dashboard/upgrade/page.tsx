import Link from 'next/link';
import { Rocket, ArrowRight } from 'lucide-react';
import { GALACTIC_PLANS } from '@/lib/plans';
import { FEATURE_COUNT } from '@/lib/features';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { PopularPlanCard, GalacticPlanCard } from '@/components/ui/Uiverse';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';

export default function UpgradePage() {
  return (
    <PageFullscreenFrame>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Rocket className="w-7 h-7 text-[var(--accent)]" />
            Upgrade Your Plan
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            All {FEATURE_COUNT} features unlocked on every plan. Top up actions — pay only for fuel.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GALACTIC_PLANS.map((plan) => {
            const cta = <CheckoutButton planTier={plan.tier} label="BUY NOW" />;
            if (plan.highlight) {
              return (
                <PopularPlanCard
                  key={plan.tier}
                  name={plan.name}
                  price={plan.priceLabel}
                  actions={plan.actionsLabel}
                  description={plan.tagline}
                  cta={cta}
                />
              );
            }
            return (
              <GalacticPlanCard
                key={plan.tier}
                name={plan.name}
                price={plan.priceLabel}
                actions={plan.actionsLabel}
                features={[`${plan.concurrency} concurrent tasks`]}
                cta={cta}
              />
            );
          })}
        </div>

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
