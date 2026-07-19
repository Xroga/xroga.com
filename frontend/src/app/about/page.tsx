import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { buildMetadata, FAVICON_URL, SITE_URL } from '@/lib/seo';
import { COMPANY_CONTACT } from '@/lib/companyContact';

export const metadata: Metadata = buildMetadata({
  title: 'About Xroga AI & CEO Muhammad Ibrahim',
  description: COMPANY_CONTACT.productDescription,
  path: '/about',
  keywords: ['about Xroga', 'Muhammad Ibrahim CEO', 'Pakistan AI founder', 'Xroga mission'],
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: COMPANY_CONTACT.brand,
  url: SITE_URL,
  logo: FAVICON_URL,
  description: COMPANY_CONTACT.productDescription,
  email: COMPANY_CONTACT.email,
  telephone: COMPANY_CONTACT.phoneTel,
  founder: {
    '@type': 'Person',
    name: 'Muhammad Ibrahim',
    nationality: 'Pakistani',
    jobTitle: 'Founder & CEO',
    age: 19,
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: COMPANY_CONTACT.email,
    telephone: COMPANY_CONTACT.phoneTel,
    areaServed: 'Worldwide',
    availableLanguage: ['English'],
  },
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-[var(--background)]">
        <header className="border-b border-[var(--card-border)] glass-panel-strong">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <Image src={FAVICON_URL} alt="Xroga" width={40} height={40} unoptimized />
              <span className="font-bold">Xroga AI</span>
            </Link>
            <Link href="/auth/signup" className="text-sm text-[var(--accent)] hover:underline">
              Get Started →
            </Link>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
          <section className="text-center space-y-4">
            <Image
              src={FAVICON_URL}
              alt="Xroga AI"
              width={80}
              height={80}
              className="mx-auto"
              unoptimized
            />
            <h1 className="text-3xl sm:text-4xl font-bold">Xroga AI — #1 Coding Agent</h1>
            <p className="text-[var(--muted)] max-w-2xl mx-auto">
              For developers and people with no coding knowledge: describe a web product, get working
              code on your GitHub, live on your Vercel, then keep updating the same repo.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-xl font-semibold">What is Xroga AI?</h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              {COMPANY_CONTACT.productDescription}
            </p>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              It is not a single chatbot. A coordinated swarm — Converter, Builder roles (Apex, Horizon,
              Forge, Live), and QA — turns a prompt into previewable code, pushes your GitHub, and deploys
              on Vercel. Billing is monthly via Paddle with AI credit by plan.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-xl font-semibold">Contact</h2>
            <p className="text-sm text-[var(--muted)]">
              Email:{' '}
              <a href={`mailto:${COMPANY_CONTACT.email}`} className="text-[var(--accent)] hover:underline">
                {COMPANY_CONTACT.email}
              </a>
            </p>
            <p className="text-sm text-[var(--muted)]">
              Phone:{' '}
              <a href={`tel:${COMPANY_CONTACT.phoneTel}`} className="text-[var(--accent)] hover:underline">
                {COMPANY_CONTACT.phoneDisplay}
              </a>
            </p>
            <p className="text-sm text-[var(--muted)]">
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
              {' · '}
              <Link href="/refund" className="text-[var(--accent)] hover:underline">
                Refund
              </Link>
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-xl font-semibold">What can Xroga do?</h2>
            <ul className="text-sm text-[var(--muted)] space-y-2 list-disc pl-5">
              <li>Build websites, web apps, dashboards, and browser games from plain language</li>
              <li>Push working code to your GitHub and update the same repo (edit/delete)</li>
              <li>Deploy live on your Vercel account</li>
              <li>Sync your product API keys securely into Vercel env</li>
              <li>Works for developers and non-developers — no coding knowledge required to start</li>
            </ul>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-4">
            <h2 className="text-xl font-semibold">Who we are</h2>
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="w-16 h-16 rounded-full bg-[var(--accent)]/20 flex items-center justify-center text-2xl font-bold shrink-0">
                MI
              </div>
              <div>
                <h3 className="font-semibold">Muhammad Ibrahim — Founder & CEO</h3>
                <p className="text-xs text-[var(--accent)] mb-2">19 years old · Pakistan</p>
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  Muhammad Ibrahim founded Xroga AI with a single belief: AI should not just answer questions —
                  it should execute. From Pakistan at age 19, he built Xroga to give every creator, developer,
                  and business access to a full AI workforce that plans, builds, and verifies real work —
                  not demos.
                </p>
              </div>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Behind Xroga is a growing team of engineers, designers, and AI researchers united by one mission:
              make advanced AI execution accessible, honest, and affordable for everyone.
            </p>
          </section>

          <section className="text-center pt-4">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[var(--accent)] text-[var(--background)] font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Start Building with Xroga
            </Link>
          </section>
        </main>

        <footer className="border-t border-[var(--card-border)] py-8 text-center text-sm text-[var(--muted)]">
          © {new Date().getFullYear()} Xroga AI · Founded by Muhammad Ibrahim, Pakistan
        </footer>
      </div>
    </>
  );
}
