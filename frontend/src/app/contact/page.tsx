import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { COMPANY_CONTACT } from '@/lib/companyContact';
import { LegalPageShell } from '@/components/legal/LegalPageShell';

export const metadata: Metadata = buildMetadata({
  title: 'Contact',
  description:
    'Contact Xroga AI support — email and phone for billing, product, and Paddle subscription questions.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <LegalPageShell title="Contact">
      <p className="text-[var(--muted)]">
        Reach the Xroga team for product questions, billing (Paddle), account help, or partnership
        inquiries. We respond during Pakistan business hours.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Product / service</h2>
        <p>{COMPANY_CONTACT.productDescription}</p>
        <p className="text-[var(--muted)]">
          Learn more on{' '}
          <Link href="/about" className="text-[var(--accent)] hover:underline">
            About
          </Link>
          ,{' '}
          <Link href="/features" className="text-[var(--accent)] hover:underline">
            Features
          </Link>
          , and{' '}
          <Link href="/pricing" className="text-[var(--accent)] hover:underline">
            Pricing
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Email</h2>
        <p>
          <a
            href={`mailto:${COMPANY_CONTACT.email}`}
            className="text-[var(--accent)] font-medium hover:underline text-base"
          >
            {COMPANY_CONTACT.email}
          </a>
        </p>
        <p className="text-[var(--muted)] text-xs">
          Billing / refunds: include your Paddle receipt ID. Product: include your account email.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Phone</h2>
        <p>
          <a
            href={`tel:${COMPANY_CONTACT.phoneTel}`}
            className="text-[var(--accent)] font-medium hover:underline text-base"
          >
            {COMPANY_CONTACT.phoneDisplay}
          </a>
        </p>
        <p className="text-[var(--muted)] text-xs">
          Voice / WhatsApp-capable mobile for support. Prefer email for detailed billing cases.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Policies</h2>
        <ul className="list-disc pl-5 space-y-1 text-[var(--muted)]">
          <li>
            <Link href="/terms" className="text-[var(--accent)] hover:underline">
              Terms and Conditions
            </Link>
          </li>
          <li>
            <Link href="/privacy" className="text-[var(--accent)] hover:underline">
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link href="/refund" className="text-[var(--accent)] hover:underline">
              Refund Policy
            </Link>
          </li>
        </ul>
      </section>
    </LegalPageShell>
  );
}
