import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { COMPANY_CONTACT } from '@/lib/companyContact';
import { LegalPageShell } from '@/components/legal/LegalPageShell';

export const metadata: Metadata = buildMetadata({
  title: 'Refund Policy',
  description:
    'Xroga AI Refund Policy — cancellation, pause options, and how Paddle billing disputes work.',
  path: '/refund',
});

export default function RefundPage() {
  return (
    <LegalPageShell title="Refund Policy">
      <p className="text-[var(--muted)]">Last updated: July 19, 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Product</h2>
        <p>{COMPANY_CONTACT.productDescription}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cancel anytime</h2>
        <p className="text-[var(--muted)]">
          Cancel from your dashboard billing settings. Cancellation stops future renewals. You keep
          access until the end of the period already paid.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pause instead of cancel</h2>
        <p className="text-[var(--muted)]">
          If you need a break, contact us to pause for up to 3 months where available. Billing
          stops while paused; your projects remain so you can return without starting over.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Refunds</h2>
        <p className="text-[var(--muted)]">
          We generally do not offer retroactive refunds for the current billing period after AI
          capacity has been available to your account. If you were charged in error, charged twice,
          or experienced a verified service failure preventing use, email us within 14 days of the
          charge with your Paddle receipt ID.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payments & disputes</h2>
        <p className="text-[var(--muted)]">
          Checkout is powered by Paddle. Payment method options depend on your region. For
          chargebacks or payment disputes, contact Paddle and{' '}
          <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-[var(--accent)] hover:underline">
            {COMPANY_CONTACT.email}
          </a>{' '}
          so we can help resolve quickly.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Contact for billing</h2>
        <p className="text-[var(--muted)]">
          Email:{' '}
          <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-[var(--accent)] hover:underline">
            {COMPANY_CONTACT.email}
          </a>
          <br />
          Phone:{' '}
          <a href={`tel:${COMPANY_CONTACT.phoneTel}`} className="text-[var(--accent)] hover:underline">
            {COMPANY_CONTACT.phoneDisplay}
          </a>
          <br />
          <Link href="/contact" className="text-[var(--accent)] hover:underline">
            Full contact page
          </Link>
          {' · '}
          <Link href="/terms" className="text-[var(--accent)] hover:underline">
            Terms
          </Link>
          {' · '}
          <Link href="/privacy" className="text-[var(--accent)] hover:underline">
            Privacy
          </Link>
        </p>
      </section>
    </LegalPageShell>
  );
}
