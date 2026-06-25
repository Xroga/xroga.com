import Link from 'next/link';
import { PricingCards } from '@/components/pricing/PricingCards';
import { Sparkles } from 'lucide-react';

export const metadata = {
  title: 'Pricing – Xroga',
  description: 'Choose your Galactic Tier. 5 plans, 92 features, unlimited possibilities.',
};

export default function PricingPage() {
  return (
    <div className="min-h-screen cosmic-bg">
      <header className="border-b border-[var(--card-border)] bg-black/20 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="w-5 h-5 text-violet-400" />
            Xroga
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="text-sm text-[var(--muted)] hover:text-white transition-colors">
              Log in
            </Link>
            <Link
              href="/auth/signup"
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
            Galactic Tiers
          </h1>
          <p className="text-[var(--muted)] mt-4 max-w-2xl mx-auto">
            Fuel your Swarm with Actions. Every plan unlocks all 92 features — choose the tier that matches your ambition.
          </p>
        </div>

        <PricingCards />
      </main>

      <footer className="border-t border-[var(--card-border)] py-8 text-center text-sm text-[var(--muted)]">
        <p>All plans include a 7-day free trial with 50 Actions. Cancel anytime.</p>
        <div className="flex justify-center gap-4 mt-2">
          <Link href="/changelog" className="hover:text-white">Changelog</Link>
          <Link href="/" className="hover:text-white">Home</Link>
        </div>
      </footer>
    </div>
  );
}
