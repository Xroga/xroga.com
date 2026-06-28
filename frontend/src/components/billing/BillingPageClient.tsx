'use client';

import Link from 'next/link';
import { GALACTIC_PLANS, COMING_SOON_PLANS } from '@/lib/plans';
import { FEATURE_COUNT } from '@/lib/features';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { useAppStore } from '@/store/useAppStore';
import { Zap, Shield, Layers, Sparkles, Lock, ArrowRight } from 'lucide-react';
import { GalacticPlanCard, PopularPlanCard } from '@/components/ui/Uiverse';
import { ActionSpendingView } from '@/components/dashboard/ActionSpendingView';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { ChevronDown, PieChart } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export function BillingPageClient() {
  const actions = useAppStore((s) => s.actions);
  const [spendOpen, setSpendOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#action-spend') {
      setSpendOpen(true);
    }
  }, []);

  return (
    <PageFullscreenFrame>
      <div className="max-w-6xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Billing</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Top up your action fuel — all {FEATURE_COUNT} features stay unlocked on every tier.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 border-[var(--primary)]/30">
          <h2 className="font-semibold text-lg">Current Plan</h2>
          <p className="text-sm text-[var(--muted)] mt-2">
            Actions are Swarm fuel. Features never gate — you only pay for compute.
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
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 mt-4 xv-footer-pill !text-sm !text-[var(--foreground)]"
          >
            Back to Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div id="action-spend" className="glass-panel rounded-2xl overflow-hidden border-[var(--card-border)]">
          <button
            type="button"
            onClick={() => setSpendOpen(!spendOpen)}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <h2 className="font-semibold text-sm">Action Spend</h2>
                <p className="text-[10px] text-[var(--muted)]">Calculator, recent spend & cost reference</p>
              </div>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-[var(--muted)] transition-transform', spendOpen && 'rotate-180')} />
          </button>
          {spendOpen && (
            <div className="border-t border-[var(--card-border)] px-4 sm:px-6 pb-6 pt-2">
              <ActionSpendingView embedded />
            </div>
          )}
        </div>

        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[var(--accent)] mb-6 font-terminal">
            <Sparkles className="w-3 h-3" />
            ALL {FEATURE_COUNT} FEATURES ON EVERY PLAN
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {GALACTIC_PLANS.map((plan) => {
              const isCurrent = actions?.planTier === plan.tier;
              const cta = isCurrent ? (
                <div className="text-center py-2 text-sm font-semibold text-cyan-300">Current Plan</div>
              ) : (
                <CheckoutButton planTier={plan.tier} label="BUY NOW" />
              );

              if (plan.highlight) {
                return (
                  <PopularPlanCard
                    key={plan.tier}
                    name={plan.name}
                    price={plan.priceLabel}
                    actions={plan.actionsLabel}
                    description={plan.tagline ?? `${plan.concurrency} concurrent tasks`}
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
                  features={[`${plan.concurrency} concurrent tasks`, `All ${FEATURE_COUNT} features unlocked`]}
                  cta={cta}
                />
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-[var(--card-border)] p-4">
          <p className="text-xs font-semibold text-[var(--muted)] mb-3 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> $6 · $9 · $10/mo plans — coming soon
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
    </PageFullscreenFrame>
  );
}
