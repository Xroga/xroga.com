'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/layout/Logo';
import { GALACTIC_PLANS, COMING_SOON_PLANS, TRIAL_TOKEN_POOL } from '@/lib/plans';
import { XROGA_FEATURES, FEATURE_COUNT } from '@/lib/features';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import {
  GalacticPlanPricingCard,
  PricingPlanGrid,
  XrogaPricingCard,
} from '@/components/billing/XrogaPricingCard';
import { useAppStore } from '@/store/useAppStore';
import { Zap, Shield, Layers, Sparkles, ChevronDown, ChevronUp, Lock, ArrowRight } from 'lucide-react';
import { GradientStartButton, PlayNowButton } from '@/components/ui/Uiverse';
import { PowerSmashButton } from '@/components/ui/XrogaButtons';
import { CurrencyToggle } from '@/hooks/usePlanPrice';
import { COMPANY_CONTACT } from '@/lib/companyContact';

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
            <span className="text-[#4a7aff] shrink-0">✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PricingPageClient() {
  const [loggedIn, setLoggedIn] = useState(false);
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
            const { billing } = summary;
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
              <PowerSmashButton size="sm" onClick={() => router.push('/workspace')}>
                Workspace
              </PowerSmashButton>
            ) : (
              <>
                <PlayNowButton className="xv-play-btn-sm" onClick={() => router.push('/auth/login')}>
                  Sign In
                </PlayNowButton>
                <GradientStartButton className="xv-gradient-btn-sm" onClick={() => router.push('/auth/signup')}>
                  Start Free
                </GradientStartButton>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[#4a7aff] mb-6 font-terminal">
            <Sparkles className="w-3 h-3" />
            ALL {FEATURE_COUNT} FEATURES UNLOCKED ON EVERY PLAN
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Plans built for <span className="gradient-text">builders</span>
          </h1>
          <p className="text-[var(--muted)] max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Pay for tokens and concurrency — not gated features. Spark starts at 6.17M tokens/mo.
            Free trial is ~0.55M tokens (not a full Spark pool).
          </p>
          <div className="mt-4 flex justify-center">
            <CurrencyToggle />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-12">
          {[
            {
              icon: Layers,
              title: 'All features included',
              desc: `Every tier gets the full Xroga stack — all ${FEATURE_COUNT} features.`,
            },
            {
              icon: Zap,
              title: 'Concurrency scaling',
              desc: 'Higher plans run more swarm tasks in parallel — Spark 2 → Singularity 100.',
            },
            {
              icon: Shield,
              title: 'Honest token pools',
              desc: 'Each card shows the real monthly token pool. Trial is tiny; Spark is 6.17M.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass-panel rounded-xl p-4 border border-[var(--card-border)]">
              <Icon className="w-5 h-5 text-[#4a7aff] mb-2" />
              <p className="text-sm font-semibold mb-1">{title}</p>
              <p className="text-xs text-[var(--muted)] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <PricingPlanGrid className="mb-16">
          <XrogaPricingCard
            name="Free Trial"
            price="$0"
            subtitle="Try before you subscribe"
            tokensLabel="~0.55M trial tokens"
            features={[
              '1 concurrent task',
              `~${(TRIAL_TOKEN_POOL / 1_000_000).toFixed(2)}M trial tokens`,
              'Full Xroga AI access',
            ]}
            cta={
              loggedIn ? (
                <div className="xv-pricing-cta xv-pricing-cta--solid text-center cursor-default">
                  <span className="capitalize">Plan: {planTier ?? 'trial'}</span>
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
              <div className="text-center py-2 text-sm font-semibold text-[#4a7aff]">Current Plan</div>
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

        <div className="flex flex-wrap justify-center gap-3 mt-12">
          {loggedIn ? (
            <button
              type="button"
              onClick={() => router.push('/workspace')}
              className="xv-footer-pill !text-sm flex items-center gap-2 !text-[var(--foreground)] px-6 py-3"
            >
              Back to Workspace <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <GradientStartButton className="xv-gradient-btn-sm" onClick={() => router.push('/auth/signup')}>
              Start Free
            </GradientStartButton>
          )}
        </div>

        <footer className="mt-14 pt-8 border-t border-[var(--card-border)] text-center text-xs text-[var(--muted)] space-y-2">
          <p>
            {COMPANY_CONTACT.productDescription.slice(0, 160)}…
          </p>
          <nav className="flex flex-wrap justify-center gap-x-3 gap-y-1" aria-label="Legal">
            <Link href="/contact" className="text-[var(--accent)] hover:underline">
              Contact
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/refund" className="hover:underline">
              Refund
            </Link>
            <a href={`mailto:${COMPANY_CONTACT.email}`} className="hover:underline">
              {COMPANY_CONTACT.email}
            </a>
            <a href={`tel:${COMPANY_CONTACT.phoneTel}`} className="hover:underline">
              {COMPANY_CONTACT.phoneDisplay}
            </a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
