'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/layout/Logo';
import { GALACTIC_PLANS, FREE_TRIAL_ACTIONS } from '@/lib/plans';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { useAppStore } from '@/store/useAppStore';
import { Zap, Shield, Layers, Sparkles } from 'lucide-react';
import { GalacticPlanCard, PopularPlanCard, GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';

export function PricingPageClient() {
  const [loggedIn, setLoggedIn] = useState(false);
  const actions = useAppStore((s) => s.actions);
  const router = useRouter();

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(async ({ data: { session } }) => {
        setLoggedIn(!!session);
        if (session) {
          try {
            const { api } = await import('@/lib/api');
            const balance = await api.actions.balance();
            useAppStore.getState().setActions(balance);
          } catch {
            /* ignore */
          }
        }
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass-panel-strong border-b border-[var(--card-border)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo href={loggedIn ? '/dashboard' : '/'} variant="header" height={50} />
          <div className="flex items-center gap-4">
            {loggedIn ? (
              <Link href="/dashboard" className="text-sm text-[var(--accent)] hover:underline">
                Back to Dashboard
              </Link>
            ) : (
              <>
                <PlayNowButton className="xv-play-btn-sm" onClick={() => router.push('/auth/login')}>Sign In</PlayNowButton>
                <GradientStartButton className="xv-gradient-btn-sm" onClick={() => router.push('/auth/signup')}>Start Free</GradientStartButton>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[var(--accent)] mb-6 font-terminal">
            <Sparkles className="w-3 h-3" />
            ALL 92 FEATURES UNLOCKED ON EVERY PLAN
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Pay for <span className="gradient-text">fuel</span>, not features
          </h1>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-16">
          <GalacticPlanCard
            name="Free Trial"
            price="$0"
            actions={`${FREE_TRIAL_ACTIONS} Actions (one-time)`}
            features={['1 concurrent task', 'Full Swarm access']}
            cta={
              loggedIn ? (
                <div className="xv-plan-btn opacity-80 cursor-default text-center">
                  Plan: {actions?.planTier ?? 'unpaid'}
                </div>
              ) : (
                <GradientStartButton className="w-full text-sm" onClick={() => router.push('/auth/signup')}>
                  Start Free
                </GradientStartButton>
              )
            }
          />

          {GALACTIC_PLANS.map((plan) => {
            const isCurrent = loggedIn && actions?.planTier === plan.tier;
            const cta = isCurrent ? (
              <div className="text-center py-2 text-sm font-semibold text-cyan-300">Current Plan</div>
            ) : (
              <CheckoutButton planTier={plan.tier} label={`Get ${plan.name}`} />
            );

            if (plan.highlight) {
              return (
                <PopularPlanCard
                  key={plan.tier}
                  name={plan.name}
                  price={plan.priceLabel}
                  actions={plan.actionsLabel}
                  description="Best for growing startups"
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
                current={!!isCurrent}
                features={[`${plan.concurrency} concurrent tasks`, 'All 92 features']}
                cta={cta}
              />
            );
          })}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Layers, title: '80/20 AI Routing', desc: 'Cheap models plan & review; premium models build the final output.' },
            { icon: Shield, title: 'Zero Defects Swarm', desc: '5 agents negotiate until the output is flawless.' },
            { icon: Zap, title: 'Concurrency Scaling', desc: 'Run multiple Swarm tasks in parallel on higher tiers.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass-panel rounded-xl p-6">
              <Icon className="w-8 h-8 text-[var(--accent)] mb-3" />
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-[var(--muted)]">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
