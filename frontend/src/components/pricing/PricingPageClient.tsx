'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Sparkles, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { Logo } from '@/components/layout/Logo';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { LiquidPricingCard } from '@/components/pricing/LiquidPricingCard';
import { XROGA_FEATURES, FEATURE_COUNT } from '@/lib/features';
import {
  GradientStartButton,
  PlayNowButton,
} from '@/components/ui/Uiverse';
import { PowerSmashButton } from '@/components/ui/XrogaButtons';
import { COMPANY_CONTACT } from '@/lib/companyContact';

type Entitlement = Awaited<
  ReturnType<typeof api.billing.entitlement>
>;

function formatDate(value: string | null): string {
  if (!value) return 'Unavailable';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function PricingPageClient() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [entitlement, setEntitlement] =
    useState<Entitlement | null>(null);
  const [activating, setActivating] = useState(false);

  const router = useRouter();

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await createClient().auth.getSession();

        setLoggedIn(Boolean(data.session));

        if (data.session) {
          const status = await api.billing.entitlement();
          setEntitlement(status);
        }
      } catch {
        setEntitlement(null);
      }
    })();
  }, []);

  async function activatePromotion() {
    setActivating(true);

    try {
      await api.billing.activatePromotion();

      const status = await api.billing.entitlement();

      setEntitlement(status);

      toast.success(
        `Your complete 30-day promotional period ends ${formatDate(
          status.endsAt
        )}.`
      );
    } catch (error) {
      toast.error(
        (error as Error).message ||
          'Promotion activation is temporarily unavailable.'
      );
    } finally {
      setActivating(false);
    }
  }

  const promotionActive =
    entitlement?.state === 'promotional_active';

  const paidActive =
    entitlement?.state === 'paid_active';

  return (
    <div className="min-h-screen flex flex-col">
      {/* ============================= */}
      {/* HEADER */}
      {/* ============================= */}

      <header className="sticky top-0 z-50 glass-panel-strong border-b border-[var(--card-border)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Logo
            href={loggedIn ? '/dashboard' : '/'}
            variant="header"
            height={48}
          />

          {loggedIn ? (
            <PowerSmashButton
              size="sm"
              onClick={() => router.push('/workspace')}
            >
              Workspace
            </PowerSmashButton>
          ) : (
            <div className="flex items-center gap-2">
              <PlayNowButton
                className="xv-play-btn-sm"
                onClick={() => router.push('/auth/login')}
              >
                Sign In
              </PlayNowButton>

              <GradientStartButton
                className="xv-gradient-btn-sm"
                onClick={() => router.push('/auth/signup')}
              >
                Start
              </GradientStartButton>
            </div>
          )}
        </div>
      </header>

      {/* ============================= */}
      {/* PAGE */}
      {/* ============================= */}

      <main className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* ============================= */}
        {/* HERO / TITLE */}
        {/* ============================= */}

        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[var(--accent)] mb-5">
            <Sparkles className="w-3.5 h-3.5" />

            <span>
              ONE PLAN · ALL {FEATURE_COUNT} FEATURES
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            Build and ship with Xroga AI
          </h1>

          <p className="text-[var(--muted)] max-w-2xl mx-auto leading-relaxed">
            Activate by 30 August 2026 for one complete
            30-day period free. No card is required and
            there is no automatic charge when the
            promotional period ends.
          </p>
        </div>

        {/* ============================= */}
        {/* PRICING SECTION */}
        {/* ============================= */}

        <section
          className="grid md:grid-cols-[1.1fr_.9fr] gap-5 mb-10"
          aria-label="Xroga plan"
        >
          {/* ============================= */}
          {/* NEW PREMIUM PRICING CARD */}
          {/* ============================= */}

          <LiquidPricingCard
            badge="Plus"
            title="Xroga AI"
            price="$19"
            priceSuffix="per 30-day"
            billingText="billing period"
            features={[
              'All product-building features',
              'Unlimited app integrations',
              'Smart execution and publishing',
              'Advanced dashboard analytics',
              'AI-powered product workflows',
            ]}
           note={
  <>
    Need higher limits?{' '}
    <a
      href="mailto:hello@xroga.com"
      className="font-semibold text-black hover:underline"
    >
      hello@xroga.com
    </a>
  </>
}
            action={
              !loggedIn ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push('/auth/signup')
                  }
                >
                  Get started
                </button>
              ) : entitlement?.state ===
                'promotional_eligible' ? (
                <button
                  type="button"
                  onClick={activatePromotion}
                  disabled={activating}
                >
                  {activating
                    ? 'Activating…'
                    : 'Get started'}
                </button>
              ) : promotionActive || paidActive ? (
                <button
                  type="button"
                  onClick={() =>
                    router.push('/workspace')
                  }
                >
                  Open workspace
                </button>
              ) : (
                <CheckoutButton
                  planTier="spark"
                  label="Get started"
                />
              )
            }
          />

          {/* ============================= */}
          {/* CAPACITY / PROMOTION CARD */}
          {/* ============================= */}

          <div className="glass-panel rounded-2xl border border-[var(--card-border)] p-6 space-y-5">
            <div className="flex gap-3">
              <Zap className="w-5 h-5 text-[var(--accent)] shrink-0" />

              <div>
                <p className="font-semibold">
                  Capacity, not messages
                </p>

                <p className="text-sm text-[var(--muted)] mt-1">
                  No fixed message allowance, model picker,
                  artificial credits, or guaranteed token
                  total.
                </p>
              </div>
            </div>

            <div className="border-t border-[var(--card-border)] pt-5 text-sm text-[var(--muted)]">
              <p className="font-semibold text-[var(--foreground)] mb-1">
                Promotion terms
              </p>

              <p>
                Activation closes at the end of 30 August
                2026 UTC. Activating on 29 or 30 August
                still starts a complete 30-day period.
              </p>
            </div>

            {/* PROMOTION ACTIVE */}

            {promotionActive && (
              <div className="border-t border-[var(--card-border)] pt-5 text-sm">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Promotional period active
                </p>

                <p className="mt-1 text-[var(--muted)]">
                  Ends{' '}
                  {formatDate(
                    entitlement?.endsAt ?? null
                  )}
                  . No automatic charge follows.
                </p>
              </div>
            )}

            {/* PAID ACTIVE */}

            {paidActive && (
              <div className="border-t border-[var(--card-border)] pt-5 text-sm">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Paid plan active
                </p>

                <p className="mt-1 text-[var(--muted)]">
                  Your Xroga AI subscription is active.
                </p>
              </div>
            )}

            {/* OTHER ENTITLEMENT STATES */}

            {entitlement &&
              !promotionActive &&
              !paidActive && (
                <div className="border-t border-[var(--card-border)] pt-5 text-sm">
                  <p className="text-[var(--muted)]">
                    Current state
                  </p>

                  <p className="font-semibold capitalize">
                    {entitlement.state.replaceAll(
                      '_',
                      ' '
                    )}
                  </p>
                </div>
              )}
          </div>
        </section>

        {/* ============================= */}
        {/* INCLUDED CAPABILITIES */}
        {/* ============================= */}

        <section className="glass-panel rounded-2xl p-6 mb-10">
          <h2 className="text-lg font-bold mb-4">
            Included capabilities
          </h2>

          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-[var(--muted)]">
            {XROGA_FEATURES.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2"
              >
                <Check className="w-3.5 h-3.5 mt-0.5 text-[var(--accent)] shrink-0" />

                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ============================= */}
        {/* BOTTOM CTA */}
        {/* ============================= */}

        <div className="text-center">
          <Link
            href={
              loggedIn
                ? '/workspace'
                : '/auth/signup'
            }
            className="inline-flex items-center gap-2 rounded-full border border-[var(--card-border)] px-5 py-3 text-sm font-semibold hover:border-[var(--accent)]/50 transition-colors"
          >
            {loggedIn
              ? 'Return to Workspace'
              : 'Create your account'}

            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* ============================= */}
        {/* FOOTER */}
        {/* ============================= */}

        <footer className="mt-14 pt-8 border-t border-[var(--card-border)] text-center text-xs text-[var(--muted)]">
          <nav
            className="flex flex-wrap justify-center gap-3"
            aria-label="Legal"
          >
            <Link href="/contact">
              Contact
            </Link>

            <Link href="/terms">
              Terms
            </Link>

            <Link href="/privacy">
              Privacy
            </Link>

            <Link href="/refund">
              Refund
            </Link>

            <a
              href={`mailto:${COMPANY_CONTACT.email}`}
            >
              {COMPANY_CONTACT.email}
            </a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
