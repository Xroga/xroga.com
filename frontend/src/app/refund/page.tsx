import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Refund Policy',
  description: 'Xroga AI refund policy — pause instead of cancel, immediate stop billing, and subscription terms.',
  path: '/refund',
});

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] glass-panel-strong">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">← Xroga AI</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-8 text-sm leading-relaxed">
        <h1 className="text-3xl font-bold">Refund Policy</h1>
        <p className="text-[var(--muted)]">Last updated: {new Date().toLocaleDateString()}</p>

        <section className="glass-panel rounded-2xl p-6 border border-[var(--accent)]/30 space-y-3">
          <h2 className="text-lg font-semibold text-[var(--accent)]">Pause instead of cancel</h2>
          <p>
            Cancel anytime — <strong>or</strong>, if you just need a break, <strong>pause your subscription for up to 3
            months</strong>. We keep your data safe, stop all billing, and you can reactivate instantly without losing
            progress.
          </p>
          <p className="text-[var(--muted)]">
            Many members pause when they are busy, not because they dislike the product. Pausing avoids losing your
            projects and makes it easy to return.
          </p>
          <Link href="/dashboard/billing" className="inline-flex text-[var(--accent)] hover:underline text-sm font-medium">
            Manage subscription in Billing →
          </Link>
        </section>

        <section className="glass-panel rounded-2xl p-6 border border-[var(--card-border)] space-y-3">
          <h2 className="text-lg font-semibold">No retroactive refunds — immediate stop</h2>
          <p>
            Cancel anytime directly from your dashboard. Cancellation takes effect immediately and{' '}
            <strong>you will not be billed again</strong>.
          </p>
          <p>
            We do not offer retroactive refunds for the current billing period. You retain full access until your paid
            period ends.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Payment methods</h2>
          <p>
            Checkout is powered by Paddle — cards, PayPal, Google Pay, and UPI (region-dependent). Disputes should be
            raised through Paddle or support@xroga.com within 14 days of charge.
          </p>
        </section>

        <p className="text-[var(--muted)] text-xs">
          See also <Link href="/terms" className="text-[var(--accent)] hover:underline">Terms of Service</Link> and{' '}
          <Link href="/privacy" className="text-[var(--accent)] hover:underline">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
