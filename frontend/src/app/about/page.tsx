import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { buildMetadata, FAVICON_URL, SITE_URL } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'About Xroga AI & CEO Muhammad Ibrahim',
  description:
    'Meet Xroga AI — the AI Swarm Operating System built by Muhammad Ibrahim, a 19-year-old founder from Pakistan. Our mission, team, and what Xroga can do for you.',
  path: '/about',
  keywords: ['about Xroga', 'Muhammad Ibrahim CEO', 'Pakistan AI founder', 'Xroga mission'],
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Xroga AI',
  url: SITE_URL,
  logo: FAVICON_URL,
  description:
    'AI Swarm Operating System with multi-agent workflows, 710+ integrations, and browser automation.',
  founder: {
    '@type': 'Person',
    name: 'Muhammad Ibrahim',
    nationality: 'Pakistani',
    jobTitle: 'Founder & CEO',
    age: 19,
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
            <h1 className="text-3xl sm:text-4xl font-bold">Xroga AI & Our Mission</h1>
            <p className="text-[var(--muted)] max-w-2xl mx-auto">
              We are building the world&apos;s most capable AI Swarm Operating System — where specialized
              agents plan, build, review, and verify until the output is ready to ship.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-xl font-semibold">What is Xroga AI?</h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Xroga AI is not a single chatbot. It is a coordinated swarm of AI agents — Architect, Builder,
              Reviewer, QA Tester, and Truth Council — that negotiate until your task reaches zero defects.
              Connect 710+ integrations, automate browsers, generate code, media, research, and full applications
              with transparent action-based billing.
            </p>
          </section>

          <section className="glass-panel rounded-2xl p-6 space-y-3">
            <h2 className="text-xl font-semibold">What can Xroga do?</h2>
            <ul className="text-sm text-[var(--muted)] space-y-2 list-disc pl-5">
              <li>Build full-stack apps, websites, and mobile games from natural language</li>
              <li>Run browser automation — scrape, research, and automate workflows</li>
              <li>Generate images, video scripts, voice, and 3D assets</li>
              <li>Debug code, run QA simulations, and verify outputs before publish</li>
              <li>Connect GitHub, cloud, payments, and hundreds more services</li>
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
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm hover:opacity-90 transition-opacity"
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
