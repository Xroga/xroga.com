import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { GALACTIC_PLANS, FREE_TRIAL_ACTIONS } from '@/lib/plans';
import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { Zap, Shield, Layers, Sparkles } from 'lucide-react';

export default function PricingPage() {
  return (
    <div className="min-h-screen cosmic-bg terminal-grid">
      <header className="sticky top-0 z-50 glass-panel-strong border-b border-[var(--card-border)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo href="/" size="md" />
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm text-[var(--muted)] hover:text-white">
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm px-4 py-2 rounded-xl bg-[var(--accent)] text-black font-semibold hover:opacity-90"
            >
              Start Free — {FREE_TRIAL_ACTIONS} Actions
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel text-xs text-[var(--accent)] mb-6 font-terminal">
            <Sparkles className="w-3 h-3" />
            GALACTIC TIERS — ALL 92 FEATURES UNLOCKED
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            Pay for <span className="gradient-text">fuel</span>, not features
          </h1>
          <p className="text-[var(--muted)] max-w-2xl mx-auto">
            Every plan unlocks the full Swarm — Architect, Builder, Reviewer, QA, and Truth Council.
            You only pay for Actions (compute fuel).
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-16">
          {GALACTIC_PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`glass-panel rounded-2xl p-6 flex flex-col ${
                plan.highlight ? 'border-[var(--accent)]/50 glow-green lg:scale-105' : ''
              }`}
            >
              {plan.highlight && (
                <span className="text-[10px] uppercase tracking-wider text-[var(--accent)] font-semibold mb-2">
                  Most Popular
                </span>
              )}
              <h2 className="text-xl font-bold">{plan.name}</h2>
              <p className="text-3xl font-bold mt-2">{plan.priceLabel}<span className="text-sm text-[var(--muted)]">/mo</span></p>
              <p className="text-xs text-[var(--muted)] mt-1">{plan.priceRange}</p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--muted)] flex-1">
                <li className="flex items-center gap-2"><Zap className="w-4 h-4 text-[var(--accent)]" />{plan.actionsLabel}</li>
                <li>{plan.concurrency >= 999 ? 'Unlimited' : plan.concurrency} concurrent tasks</li>
                <li>All 92 features</li>
                <li>5-Agent Swarm</li>
              </ul>
              <CheckoutButton planTier={plan.tier} className="mt-6 w-full" label={`Get ${plan.name}`} />
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Layers, title: '5-Agent Swarm', desc: 'Negotiates until zero defects — you only see the masterpiece.' },
            { icon: Shield, title: 'Zero-BS Guarantee', desc: 'Broken drafts never reach you. The Swarm fixes everything silently.' },
            { icon: Zap, title: `${FREE_TRIAL_ACTIONS} Free Actions`, desc: 'Sign up and test the full Swarm before you subscribe.' },
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
