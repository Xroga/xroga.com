import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { COMPANY_CONTACT } from '@/lib/companyContact';
import { LegalPageShell } from '@/components/legal/LegalPageShell';

export const metadata: Metadata = buildMetadata({
  title: 'Terms and Conditions',
  description:
    'Xroga AI Terms and Conditions — subscriptions via Lemon Squeezy, acceptable use, and service scope.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms and Conditions">
      <p className="text-[var(--muted)]">Last updated: July 19, 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Service description</h2>
        <p>{COMPANY_CONTACT.productDescription}</p>
        <p className="text-[var(--muted)]">
          Output quality depends on your prompt, plan capacity, connected integrations, and model
          availability. Xroga does not guarantee that every prompt produces a production-ready
          system without follow-up edits.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Accounts</h2>
        <p className="text-[var(--muted)]">
          You must provide accurate signup information and keep credentials secure. You are
          responsible for activity under your account.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. Payments (Lemon Squeezy)</h2>
        <p className="text-[var(--muted)]">
          Paid plans are billed through Lemon Squeezy (merchant of record where applicable). Supported
          methods may include cards, PayPal, Google Pay, and other local methods. Prices may show
          in local currency; Lemon Squeezy handles conversion and taxes where required. Plan AI credit /
          token capacity is described on{' '}
          <Link href="/pricing" className="text-[var(--accent)] hover:underline">
            Pricing
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">4. Acceptable use</h2>
        <p className="text-[var(--muted)]">
          No illegal content, malware, spam, fraud, or adult/NSFW material. Do not attempt to abuse
          AI quotas, scrape the service, or infringe others&apos; IP. We may suspend or terminate
          accounts that violate these terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">5. Intellectual property</h2>
        <p className="text-[var(--muted)]">
          Subject to third-party model/provider terms and applicable law, you own the project
          outputs generated for your account. Xroga retains rights to the platform, branding, and
          software.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">6. Cancellation & refunds</h2>
        <p className="text-[var(--muted)]">
          Cancel anytime from your dashboard. Details are in our{' '}
          <Link href="/refund" className="text-[var(--accent)] hover:underline">
            Refund Policy
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">7. Contact</h2>
        <p className="text-[var(--muted)]">
          Email{' '}
          <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-[var(--accent)] hover:underline">
            {COMPANY_CONTACT.email}
          </a>
          · Phone{' '}
          <a href={`tel:${COMPANY_CONTACT.phoneTel}`} className="text-[var(--accent)] hover:underline">
            {COMPANY_CONTACT.phoneDisplay}
          </a>
          ·{' '}
          <Link href="/contact" className="text-[var(--accent)] hover:underline">
            Contact page
          </Link>
          .
        </p>
      </section>
    </LegalPageShell>
  );
}
