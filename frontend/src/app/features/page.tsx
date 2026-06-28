import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { XROGA_FEATURES } from '@/lib/features';

export const metadata: Metadata = buildMetadata({
  title: 'Features — #1 AI Swarm with 92+ Capabilities',
  description:
    'Explore Xroga AI features: multi-agent Architect·Builder·Reviewer·QA swarms, browser automation, 710+ integrations, deploy to Vercel, build apps, games, websites, and software — the top AI platform.',
  path: '/features',
  keywords: [
    'Xroga features',
    'AI swarm features',
    'best AI features',
    '#1 AI platform features',
    'multi-agent AI tools',
    'AI build apps',
    'AI automation features',
  ],
});

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] px-4 sm:px-8 py-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold text-[var(--accent)] hover:underline">
            ← Xroga AI
          </Link>
          <div className="flex gap-3 text-sm">
            <Link href="/auth/login" className="hover:text-[var(--accent)]">
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--background)] font-semibold"
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">
          Xroga AI Features — #1 AI Swarm Platform
        </h1>
        <p className="text-[var(--muted)] mb-8 leading-relaxed">
          Every plan unlocks the full stack. Multi-agent swarms trained for realistic planning, routing,
          and zero-defect delivery — websites, apps, games, software, and automations.
        </p>

        <div className="grid sm:grid-cols-2 gap-2 mb-10">
          {XROGA_FEATURES.map((f) => (
            <div
              key={f}
              className="flex items-start gap-2 p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/50 text-sm"
            >
              <span className="text-[var(--accent)] shrink-0">✓</span>
              <span>{f}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/auth/signup"
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] font-bold text-sm"
          >
            Get Started — 50 Free Actions
          </Link>
          <Link
            href="/pricing"
            className="px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-semibold text-sm hover:border-[var(--accent)]"
          >
            View Pricing
          </Link>
        </div>
      </main>
    </div>
  );
}
