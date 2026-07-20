import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { COMPANY_CONTACT } from '@/lib/companyContact';
import { LegalPageShell } from '@/components/legal/LegalPageShell';

export const metadata: Metadata = buildMetadata({
  title: 'Privacy Policy',
  description:
    'Xroga AI Privacy Policy — how we collect, use, and protect account, usage, and billing data.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p className="text-[var(--muted)]">Last updated: July 19, 2026</p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">1. Who we are</h2>
        <p>{COMPANY_CONTACT.productDescription}</p>
        <p>
          Controller: {COMPANY_CONTACT.legalName} ({COMPANY_CONTACT.region}). Contact:{' '}
          <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-[var(--accent)] hover:underline">
            {COMPANY_CONTACT.email}
          </a>
          ,{' '}
          <a href={`tel:${COMPANY_CONTACT.phoneTel}`} className="text-[var(--accent)] hover:underline">
            {COMPANY_CONTACT.phoneDisplay}
          </a>
          . See{' '}
          <Link href="/contact" className="text-[var(--accent)] hover:underline">
            Contact
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">2. Data we collect</h2>
        <ul className="list-disc pl-5 space-y-1 text-[var(--muted)]">
          <li>Account: email, display name, auth identifiers (via Supabase Auth).</li>
          <li>Product usage: prompts, project files, AI token/credit usage for quota and billing fairness.</li>
          <li>Integrations you connect: GitHub / Vercel tokens stored to push and deploy on your behalf.</li>
          <li>Payments: processed by Lemon Squeezy — we do not store full card numbers.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">3. How we use data</h2>
        <p className="text-[var(--muted)]">
          To provide the service (builds, deploys, quota), secure accounts, prevent abuse, improve
          reliability, and communicate about billing or critical product changes. We do not sell
          personal data.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">4. Processors</h2>
        <p className="text-[var(--muted)]">
          Infrastructure and AI providers may process prompts/code as needed to fulfill requests
          (e.g. hosting, database, model APIs). Payment data is handled by Lemon Squeezy as merchant of
          record where applicable.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">5. Retention & rights</h2>
        <p className="text-[var(--muted)]">
          We keep account and usage records while your account is active and as required for
          billing/legal. You may request access or deletion via{' '}
          <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-[var(--accent)] hover:underline">
            {COMPANY_CONTACT.email}
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">6. Acceptable content</h2>
        <p className="text-[var(--muted)]">
          Adult/NSFW, illegal, and abusive content is not permitted. We may suspend accounts that
          violate our{' '}
          <Link href="/terms" className="text-[var(--accent)] hover:underline">
            Terms
          </Link>
          .
        </p>
      </section>
    </LegalPageShell>
  );
}
