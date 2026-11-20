import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { COMPANY_CONTACT } from '@/lib/companyContact';
import { LegalPageShell } from '@/components/legal/LegalPageShell';
import { PageJsonLd } from '@/components/seo/PageJsonLd';

export const metadata: Metadata = buildMetadata({
  title: 'Contact',
  description:
    'Contact Xroga AI at hello@xroga.com for product, billing, account, refunds, privacy and partnership inquiries.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <><PageJsonLd path="/contact" name="Contact XROGA AI" description="Official XROGA AI product, billing, account, and partnership contact information." type="ContactPage" /><LegalPageShell title="Contact">
      <p className="text-[var(--muted)]">
        For product questions, billing, refunds, account help, privacy requests or partnerships,
        contact Xroga by email. This is our single public contact channel.
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
        <h2 className="text-lg font-semibold">Email for all inquiries</h2>
        <p>
          <a
            href={`mailto:${COMPANY_CONTACT.email}`}
            className="text-[var(--accent)] font-medium hover:underline text-base"
          >
            {COMPANY_CONTACT.email}
          </a>
        </p>
        <p className="text-[var(--muted)] text-xs">
          Billing / refunds: include your Whop payment or membership ID. Product: include your account email.
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
    </LegalPageShell></>
  );
}
