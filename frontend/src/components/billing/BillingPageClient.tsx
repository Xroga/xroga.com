'use client';

import Link from 'next/link';
import { GALACTIC_PLANS } from '@/lib/plans';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { useAppStore } from '@/store/useAppStore';
import { Zap, Shield, Layers, Sparkles } from 'lucide-react';
import { GalacticPlanCard, PopularPlanCard } from '@/components/ui/Uiverse';

export function BillingPageClient() {
  const actions = useAppStore((s) => s.actions);

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Billing</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Manage your plan and action fuel.</p>
      </div>

      <div className="glass-panel rounded-2xl p-6 border-[var(--primary)]/30">
        <h2 className="font-semibold text-lg">Current Plan</h2>
        <p className="text-sm text-[var(--muted)] mt-2">
          Upgrade anytime — all 92 features stay unlocked on every tier.
        </p>
        {actions && (
          <p className="mt-3 text-sm">
            <span className="font-semibold capitalize">{actions.planTier}</span>
            {' · '}
            <span className="text-[var(--accent)]">{actions.remaining.toLocaleString()}</span>
            {' / '}
            {actions.total.toLocaleString()} actions remaining
          </p>
        )}
        <Link href="/pricing" className="inline-block mt-4 text-sm text-[var(--accent)] hover:underline">
          Compare Galactic Tiers →
        </Link>
      </div>

      <div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[var(--accent)] mb-6 font-terminal">
          <Sparkles className="w-3 h-3" />
          ALL 92 FEATURES ON EVERY PLAN
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {GALACTIC_PLANS.map((plan) => {
            const isCurrent = actions?.planTier === plan.tier;
            const cta = isCurrent ? (
              <div className="text-center py-2 text-sm font-semibold text-cyan-300">Current Plan</div>
            ) : (
              <CheckoutButton planTier={plan.tier} label="Subscribe" />
            );

            if (plan.highlight) {
              return (
                <PopularPlanCard
                  key={plan.tier}
                  name={plan.name}
                  price={plan.priceLabel}
                  actions={plan.actionsLabel}
                  description={`${plan.concurrency} concurrent tasks · All 92 features`}
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
                current={isCurrent}
                features={[`${plan.concurrency} concurrent tasks`, 'All 92 features unlocked']}
                cta={
                  isCurrent ? (
                    <div className="xv-plan-btn opacity-80 cursor-default">Current Plan</div>
                  ) : (
                    <CheckoutButton planTier={plan.tier} label="Subscribe" />
                  )
                }
              />
            );
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {[
          { icon: Layers, title: '80/20 AI Routing', desc: 'Cheap models plan & review; premium models build the final output.' },
          { icon: Shield, title: 'Zero Defects Swarm', desc: '5 agents negotiate until the output is flawless.' },
          { icon: Zap, title: 'Concurrency Scaling', desc: 'Run multiple Swarm tasks in parallel on higher tiers.' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="glass-panel rounded-xl p-6 universe-float">
            <Icon className="w-8 h-8 text-[var(--accent)] mb-3" />
            <h3 className="font-semibold mb-2">{title}</h3>
            <p className="text-sm text-[var(--muted)]">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
