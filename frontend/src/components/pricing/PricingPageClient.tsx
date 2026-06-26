'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/layout/Logo';
import { GALACTIC_PLANS, FREE_TRIAL_ACTIONS } from '@/lib/plans';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { useAppStore } from '@/store/useAppStore';
import { Zap, Shield, Layers, Sparkles } from 'lucide-react';

export function PricingPageClient() {
  const [loggedIn, setLoggedIn] = useState(false);
  const actions = useAppStore((s) => s.actions);

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
    <div className="min-h-screen">
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
                <Link href="/auth/login" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
                  Sign In
                </Link>
                <Link
                  href="/auth/signup"
                  className="text-sm px-4 py-2 rounded-xl bg-[var(--accent)] text-black font-semibold"
                >
                  Start Free
                </Link>
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
          <div className="glass-panel rounded-2xl p-6 flex flex-col border-[var(--primary)]/40">
            <h2 className="text-xl font-bold">Free Trial</h2>
            <p className="text-3xl font-bold mt-2">$0</p>
            <ul className="mt-4 space-y-2 text-sm text-[var(--muted)] flex-1">
              <li className="flex gap-2">
                <Zap className="w-4 h-4 text-[var(--accent)]" />
                {FREE_TRIAL_ACTIONS} Actions (one-time)
              </li>
              <li>1 concurrent task</li>
              <li>Full Swarm access</li>
            </ul>
            {loggedIn ? (
              <div className="mt-6 text-center py-2.5 rounded-xl glass-panel text-sm font-semibold text-[var(--accent)]">
                Your current plan: {actions?.planTier ?? 'unpaid'}
              </div>
            ) : (
              <Link
                href="/auth/signup"
                className="mt-6 block text-center py-2.5 rounded-xl glass-panel hover:border-[var(--accent)]/40 text-sm font-semibold"
              >
                Start Free
              </Link>
            )}
          </div>

          {GALACTIC_PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`glass-panel rounded-2xl p-6 flex flex-col ${
                plan.highlight ? 'border-[var(--accent)]/50 glow-frozen' : ''
              }`}
            >
              {plan.highlight && (
                <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold mb-2">
                  Popular
                </span>
              )}
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <p className="text-3xl font-bold mt-2">
                {plan.priceLabel}
                <span className="text-sm text-[var(--muted)]">/mo</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--muted)] flex-1">
                <li>{plan.actionsLabel}</li>
                <li>{plan.concurrency} concurrent tasks</li>
                <li>All 92 features</li>
              </ul>
              {loggedIn && actions?.planTier === plan.tier ? (
                <div className="mt-6 text-center py-2.5 rounded-xl border border-[var(--accent)]/40 text-sm font-semibold text-[var(--accent)]">
                  Current Plan
                </div>
              ) : (
                <CheckoutButton planTier={plan.tier} className="mt-6 w-full" label={`Get ${plan.name}`} />
              )}
            </div>
          ))}
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
