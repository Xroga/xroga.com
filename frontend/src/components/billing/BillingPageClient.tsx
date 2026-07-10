'use client';

import Link from 'next/link';
import { GALACTIC_PLANS, COMING_SOON_PLANS } from '@/lib/plans';
import { FEATURE_COUNT } from '@/lib/features';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { useAppStore } from '@/store/useAppStore';
import { Shield, Layers, Sparkles, Lock, ArrowRight, Brain } from 'lucide-react';
import { GalacticPlanCard, PopularPlanCard } from '@/components/ui/Uiverse';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SubscriptionManagePanel } from '@/components/billing/SubscriptionManagePanel';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function BillingPageClient() {
  const tokenUsage = useAppStore((s) => s.tokenUsage);
  const planName = useAppStore((s) => s.planName);
  const planTier = useAppStore((s) => s.planTier);

  return (
    <PageFullscreenFrame>
      <div className="max-w-6xl mx-auto space-y-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Billing</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Manage your plan — all {FEATURE_COUNT} features stay unlocked on every tier.
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-6 border-[var(--primary)]/30">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Brain className="w-5 h-5 text-[var(--accent)]" />
            Current Plan & Tokens
          </h2>
          <p className="text-sm text-[var(--muted)] mt-2">
            Xroga AI Brain uses a monthly token quota. Features never gate — you only pay for compute.
          </p>
          <p className="mt-3 text-sm">
            <span className="font-semibold">{planName ?? 'Basic'}</span>
            {planTier && planTier !== 'unpaid' && (
              <span className="text-[var(--muted)] capitalize"> ({planTier})</span>
            )}
          </p>
          {tokenUsage && (
            <>
              <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden max-w-md">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-violet-500 transition-all"
                  style={{ width: `${Math.max(3, 100 - tokenUsage.percentUsed)}%` }}
                />
              </div>
              <p className="mt-2 text-sm">
                <span className="text-[var(--accent)] font-semibold tabular-nums">
                  {formatTokens(tokenUsage.totalTokensRemaining)}
                </span>
                <span className="text-[var(--muted)]">
                  {' '}
                  / {formatTokens(tokenUsage.totalLimit ?? 7_000_000)} tokens remaining ({tokenUsage.percentUsed}% used)
                </span>
              </p>
            </>
          )}
          <Link
            href="/dashboard/home"
            className="inline-flex items-center gap-2 mt-4 xv-footer-pill !text-sm !text-[var(--foreground)]"
          >
            View Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <SubscriptionManagePanel />

        <div>
          <h2 className="text-xl font-bold mb-2">Galactic Plans</h2>
          <p className="text-sm text-[var(--muted)] mb-6">
            Every tier includes 7M+ monthly tokens, emergency tokens, and full feature access.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {GALACTIC_PLANS.map((plan) =>
              plan.highlight ? (
                <PopularPlanCard
                  key={plan.tier}
                  name={plan.name}
                  price={plan.priceLabel}
                  description={plan.tagline ?? ''}
                  actions="7M+ tokens/mo"
                  cta={<CheckoutButton planTier={plan.tier} label={`Get ${plan.name}`} className="w-full" />}
                />
              ) : (
                <GalacticPlanCard
                  key={plan.tier}
                  name={plan.name}
                  price={plan.priceLabel}
                  actions="7M+ tokens/mo"
                  features={[`${plan.concurrency} concurrent tasks`, 'All features unlocked']}
                  cta={<CheckoutButton planTier={plan.tier} label={`Get ${plan.name}`} className="w-full" />}
                />
              )
            )}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            Coming Soon
          </h3>
          <div className="flex flex-wrap gap-3">
            {COMING_SOON_PLANS.map((p) => (
              <span key={p.name} className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-[var(--muted)]">
                {p.name} {p.price}
              </span>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div className="glass-panel rounded-xl p-4 flex gap-3">
            <Shield className="w-5 h-5 text-[var(--accent)] shrink-0" />
            <div>
              <p className="font-medium">Secure billing</p>
              <p className="text-xs text-[var(--muted)] mt-1">Powered by Paddle — cancel anytime</p>
            </div>
          </div>
          <div className="glass-panel rounded-xl p-4 flex gap-3">
            <Layers className="w-5 h-5 text-[var(--accent)] shrink-0" />
            <div>
              <p className="font-medium">All features unlocked</p>
              <p className="text-xs text-[var(--muted)] mt-1">No feature gating on any tier</p>
            </div>
          </div>
          <div className="glass-panel rounded-xl p-4 flex gap-3">
            <Lock className="w-5 h-5 text-[var(--accent)] shrink-0" />
            <div>
              <p className="font-medium">Token-based usage</p>
              <p className="text-xs text-[var(--muted)] mt-1">Pay for AI compute, not per-feature locks</p>
            </div>
          </div>
        </div>
      </div>
    </PageFullscreenFrame>
  );
}
