import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Terms of Service',
  description: 'Xroga AI Terms of Service — subscriptions, acceptable use, and account policies.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] glass-panel-strong">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">← Xroga AI</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-6 text-sm leading-relaxed">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="text-[var(--muted)]">Last updated: {new Date().toLocaleDateString()}</p>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Service</h2>
          <p>
            Xroga AI provides an AI Swarm operating system for building apps, websites, games, automation, and media.
            Plans bill monthly for action fuel; all features are included on every paid tier.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. Payments</h2>
          <p>
            Payments are processed by Paddle. Supported methods include cards, PayPal, Google Pay, and UPI (where
            available). Prices may display in your local currency; Paddle handles conversion at checkout.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. Acceptable use</h2>
          <p>
            No illegal content, malware, spam, or adult/NSFW material. Xroga Browser enforces safe search and URL
            blocklists. Violations may result in immediate suspension.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. Cancellation</h2>
          <p>
            Cancel anytime from your dashboard. See our{' '}
            <Link href="/refund" className="text-[var(--accent)] hover:underline">Refund Policy</Link> for billing
            details.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. Contact</h2>
          <p>
            Questions: <a href="mailto:support@xroga.com" className="text-[var(--accent)]">support@xroga.com</a>
          </p>
        </section>
      </main>
    </div>
  );
}
