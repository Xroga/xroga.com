'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { GalacticPlanPricingCard, PricingCtaButton, PricingPlanGrid } from '@/components/billing/XrogaPricingCard';
import { GALACTIC_PLANS } from '@/lib/plans';

type BillingStatus = Awaited<ReturnType<typeof api.billing.status>>;

export function PricingPageClient() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await createClient().auth.getSession();
        setLoggedIn(Boolean(data.session));
        if (data.session) setStatus(await api.billing.status());
      } catch { setStatus(null); }
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[var(--accent)] mb-5">
            <Sparkles className="w-3.5 h-3.5" /><span>FREE TO START · PRO WHEN YOU NEED MORE</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Choose how you build</h1>
          <p className="text-[var(--muted)] max-w-2xl mx-auto leading-relaxed">
            Start free with no card. Upgrade to Xroga Pro for higher capacity and production workflows.
          </p>
        </div>

        <PricingPlanGrid className="mb-10">
          {GALACTIC_PLANS.map((plan) => {
            const free = plan.tier === 'free';
            const current = free ? status?.plan === 'free' : status?.plan === 'spark';
            const cta = free ? (
              <PricingCtaButton
                variant="outline"
                onClick={current ? undefined : () => router.push(loggedIn ? '/workspace' : '/auth/signup')}
                disabled={current}
                className={current ? 'opacity-70' : undefined}
              >
                {current ? 'Current plan' : status?.isPaid ? 'Included with your account' : 'Get started free'}
              </PricingCtaButton>
            ) : current ? (
              <PricingCtaButton variant="solid" disabled>Current plan</PricingCtaButton>
            ) : loggedIn ? (
              <CheckoutButton planTier="spark" label="Get Xroga Pro" className="!w-full xv-pricing-cta xv-pricing-cta--solid !rounded-full" />
            ) : (
              <PricingCtaButton variant="solid" onClick={() => router.push('/auth/signup')}>Get Xroga Pro</PricingCtaButton>
            );
            return <GalacticPlanPricingCard key={plan.tier} plan={plan} cta={cta} current={current} />;
          })}
        </PricingPlanGrid>

        <p className="text-center text-sm text-[var(--muted)]">Free has no billing provider and requires no card. Xroga Pro is $25/month recurring through Whop.</p>
        <div className="mt-10 text-center">
          <Link href={loggedIn ? '/workspace' : '/auth/signup'} className="inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] px-5 py-3 text-sm font-semibold hover:border-[var(--accent)]/50 transition-colors">
            {loggedIn ? 'Return to workspace' : 'Create your free account'} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
