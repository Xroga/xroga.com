import Link from 'next/link';
import { Zap, Shield, Layers, Sparkles } from 'lucide-react';

const plans = [
  { name: 'Spark', price: '$19', actions: '2,000', concurrency: '2 Tasks' },
  { name: 'Nova', price: '$59', actions: '6,000', concurrency: '5 Tasks' },
  { name: 'Zenith', price: '$150', actions: '20,000', concurrency: '15 Tasks' },
  { name: 'Singularity', price: '$499', actions: '50,000+', concurrency: 'Unlimited' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--card-border)] backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">Xroga</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/auth/login" className="text-sm text-[var(--muted)] hover:text-white transition-colors">
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-6xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-xs text-violet-300 mb-6">
            <Sparkles className="w-3 h-3" />
            AI Swarm Operating System
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-balance">
            If you can describe it,{' '}
            <span className="gradient-text">Xroga builds it</span>
          </h1>
          <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto mb-10">
            92 features, 100+ specialized AIs, and a Truth Council that negotiates, critiques,
            and iterates until perfection — before you see the result.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 font-medium transition-all glow-purple"
            >
              Start Building Free
            </Link>
            <Link
              href="#pricing"
              className="px-8 py-3 rounded-xl border border-[var(--card-border)] hover:bg-white/5 font-medium transition-colors"
            >
              View Plans
            </Link>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-3 gap-6">
          {[
            { icon: Layers, title: '5-Agent Swarm', desc: 'Architect, Builder, Reviewer, QA, and Truth Council work in parallel until zero defects.' },
            { icon: Shield, title: 'Zero-BS Guarantee', desc: 'Never see broken code, flawed videos, or hallucinated facts. The Swarm fixes everything silently.' },
            { icon: Zap, title: 'Pay for Fuel Only', desc: 'All 92 features unlocked in every plan. You only pay for Actions — units of AI compute.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
              <Icon className="w-8 h-8 text-violet-400 mb-4" />
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-sm text-[var(--muted)]">{desc}</p>
            </div>
          ))}
        </section>

        <section id="pricing" className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-3xl font-bold text-center mb-4">Galactic Tiers</h2>
          <p className="text-center text-[var(--muted)] mb-10">All features unlocked. Pay only for Actions.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div key={plan.name} className="p-6 rounded-xl border border-[var(--card-border)] bg-[var(--card)] hover:border-violet-500/50 transition-colors">
                <h3 className="font-semibold text-lg mb-1">{plan.name}</h3>
                <p className="text-3xl font-bold mb-4">{plan.price}<span className="text-sm text-[var(--muted)]">/mo</span></p>
                <ul className="space-y-2 text-sm text-[var(--muted)]">
                  <li>{plan.actions} Actions</li>
                  <li>{plan.concurrency}</li>
                  <li>All 92 features</li>
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--card-border)] py-8 text-center text-sm text-[var(--muted)]">
        © {new Date().getFullYear()} Xroga. The world&apos;s #1 AI Swarm Operating System.
      </footer>
    </div>
  );
}
