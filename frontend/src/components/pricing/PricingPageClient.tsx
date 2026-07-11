'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/layout/Logo';
import { GALACTIC_PLANS, COMING_SOON_PLANS } from '@/lib/plans';
import { XROGA_FEATURES, FEATURE_COUNT } from '@/lib/features';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import {
  GalacticPlanPricingCard,
  PricingPlanGrid,
  XrogaPricingCard,
} from '@/components/billing/XrogaPricingCard';
import { useAppStore } from '@/store/useAppStore';
import { Zap, Shield, Layers, Sparkles, ChevronDown, ChevronUp, Fuel, Lock, ArrowRight } from 'lucide-react';
import { GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';
import { PowerSmashButton } from '@/components/ui/XrogaButtons';
import { CurrencyToggle } from '@/hooks/usePlanPrice';

function FeaturesExpand() {
  const [open, setOpen] = useState(false);
  const shown = open ? XROGA_FEATURES : XROGA_FEATURES.slice(0, 12);
  return (
    <div className="glass-panel rounded-2xl p-6 mb-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold">All {FEATURE_COUNT} features on every plan</h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="xv-footer-pill !text-xs flex items-center gap-1"
        >
          {open ? (
            <>
              Show less <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              View all {FEATURE_COUNT} features <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-[var(--muted)]">
        {shown.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span className="text-[#2dd4bf] shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PricingPageClient() {
  const [loggedIn, setLoggedIn] = useState(false);
  const tokenUsage = useAppStore((s) => s.tokenUsage);
  const planTier = useAppStore((s) => s.planTier);
  const router = useRouter();

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(async ({ data: { session } }) => {
        setLoggedIn(!!session);
        if (session) {
          try {
            const { api } = await import('@/lib/api');
            const summary = await api.dashboard.summary();
            const { tokens, billing } = summary;
            useAppStore.getState().setTokenUsage({
              inputTokensUsed: tokens.inputUsed,
              outputTokensUsed: tokens.outputUsed,
              totalTokensUsed: tokens.totalUsed,
              inputTokensRemaining: tokens.inputRemaining,
              outputTokensRemaining: tokens.outputRemaining,
              totalTokensRemaining: tokens.totalRemaining,
              percentUsed: tokens.percentUsed,
              quotaPeriodStart: tokens.quotaPeriodStart,
              emergencyTokensAvailable: tokens.emergencyAvailable,
              emergencyTokensClaimedThisMonth: tokens.emergencyClaimed,
              totalLimit: tokens.totalLimit,
            });
            useAppStore.getState().setPlanInfo(billing.planTier, billing.planName);
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
              <PowerSmashButton size="sm" onClick={() => router.push('/dashboard')}>
                Dashboard
              </PowerSmashButton>
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[#2dd4bf] mb-6 font-terminal">
            <Sparkles className="w-3 h-3" />
            ALL {FEATURE_COUNT} FEATURES UNLOCKED ON EVERY PLAN
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Pay for <span className="gradient-text">tokens</span>, not features
          </h1>
          <p className="text-[var(--muted)] max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            <strong className="text-[var(--foreground)]">Monthly token quota</strong> powers Xroga AI Brain. Every plan unlocks
            all {FEATURE_COUNT} features — browser, automation, 710+ integrations. You only pay for compute.
          </p>
          <div className="mt-4 flex justify-center">
            <CurrencyToggle />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-12">
          {[
            { icon: Fuel, title: 'Tokens = fuel', desc: 'Each chat, code generation, or AI task uses tokens from your monthly quota.' },
            { icon: Sparkles, title: 'All features included', desc: `Every tier gets the full Xroga stack — all ${FEATURE_COUNT} features, no upsells.` },
            { icon: Zap, title: '7M+ tokens/month', desc: 'Upgrade for higher concurrency. Pulse is our most popular plan for daily builders.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass-panel rounded-xl p-4 border border-[var(--card-border)]">
              <Icon className="w-5 h-5 text-[#2dd4bf] mb-2" />
              <p className="text-sm font-semibold mb-1">{title}</p>
              <p className="text-xs text-[var(--muted)] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <PricingPlanGrid className="mb-16">
          <XrogaPricingCard
            borderVariant="trial"
            name="Free Trial"
            price="$0"
            subtitle="7M tokens/mo"
            features={['1 concurrent task', 'Full Xroga AI access']}
            cta={
              loggedIn ? (
                <div className="xv-pricing-cta xv-pricing-cta--solid text-center cursor-default">
                  <span className="capitalize">Plan: {planTier ?? 'trial'}</span>
                  {tokenUsage && (
                    <span className="block text-[10px] font-normal opacity-85 mt-0.5">
                      {(tokenUsage.totalTokensRemaining / 1_000_000).toFixed(1)}M tokens left
                    </span>
                  )}
                </div>
              ) : (
                <GradientStartButton className="w-full text-sm" onClick={() => router.push('/auth/signup')}>
                  Start Free
                </GradientStartButton>
              )
            }
          />

          {GALACTIC_PLANS.map((plan) => {
            const isCurrent = loggedIn && planTier === plan.tier;
            const cta = isCurrent ? (
              <div className="text-center py-2 text-sm font-semibold text-[#2dd4bf]">Current Plan</div>
            ) : (
              <CheckoutButton
                planTier={plan.tier}
                label={`Get ${plan.name} →`}
                className="!w-full xv-pricing-cta xv-pricing-cta--outline !rounded-full"
              />
            );

            return (
              <GalacticPlanPricingCard key={plan.tier} plan={plan} current={!!isCurrent} cta={cta} />
            );
          })}
        </PricingPlanGrid>

        <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-6 mb-12 text-center">
          <p className="text-xs font-semibold text-[var(--muted)] mb-4 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5" /> Budget tiers — coming soon
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {COMING_SOON_PLANS.map((p) => (
              <div
                key={p.price}
                className="px-4 py-3 rounded-xl bg-white/5 border border-[var(--card-border)] min-w-[88px] opacity-80"
              >
                <p className="text-lg font-bold">{p.price}</p>
                <p className="text-[10px] text-[var(--muted)]">/mo · {p.label}</p>
              </div>
            ))}
          </div>
        </div>

        <FeaturesExpand />

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Layers, title: '80/20 AI Routing', desc: 'Cheap models plan & review; premium models build the final output.' },
            { icon: Shield, title: 'Zero Defects Swarm', desc: '5 agents negotiate until the output is flawless.' },
            { icon: Zap, title: 'Concurrency Scaling', desc: 'Run multiple Swarm tasks in parallel on higher tiers.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass-panel rounded-xl p-6">
              <Icon className="w-8 h-8 text-[#2dd4bf] mb-3" />
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-[var(--muted)]">{desc}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3 mt-12">
          {loggedIn ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="xv-footer-pill !text-sm flex items-center gap-2 !text-[var(--foreground)] px-6 py-3"
            >
              Back to Dashboard <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <GradientStartButton className="xv-gradient-btn-sm" onClick={() => router.push('/auth/signup')}>
              Start Free — 7M tokens
            </GradientStartButton>
          )}
        </div>
      </main>
    </div>
  );
}
