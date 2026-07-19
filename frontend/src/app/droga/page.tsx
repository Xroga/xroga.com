import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata, SITE_URL, BRAND_TYPO_KEYWORDS } from '@/lib/seo';
import { FEATURE_SEO_PAGES } from '@/lib/featureSeo';

export const metadata: Metadata = buildMetadata({
  title: 'Droga AI? You Found Xroga AI — #1 Coding Agent',
  description:
    'Searching for Droga AI, Roga AI, or Zroga? You found Xroga AI (xroga.com) — the #1 coding agent for developers and non-developers. Build web apps, push to GitHub, deploy on Vercel, sync API keys, and update the same repo.',
  path: '/droga',
  keywords: [
    ...BRAND_TYPO_KEYWORDS,
    'droga ai alternative',
    'droga ai website',
    'is droga ai xroga',
    'xroga vs droga',
    'xroga coding agent',
  ],
});

const typoJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Droga AI — Xroga AI',
  description: 'Official Xroga AI page for users searching Droga AI, Roga AI, or similar spellings.',
  url: `${SITE_URL}/droga`,
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'Xroga AI',
    alternateName: ['Droga AI', 'Roga AI', 'Zroga AI', 'XROGA', 'xroga.com'],
    url: SITE_URL,
    applicationCategory: 'DeveloperApplication',
  },
};

export default function DrogaTypoPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(typoJsonLd) }} />
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-[var(--card-border)] px-4 sm:px-8 py-6">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="text-sm font-bold text-[var(--accent)] hover:underline">
              ← Xroga AI (xroga.com)
            </Link>
            <Link
              href="/auth/signup"
              className="px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--background)] font-semibold text-sm"
            >
              Sign Up Free
            </Link>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
          <p className="text-sm text-[var(--accent)] font-semibold mb-2">Did you mean Xroga AI?</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-4 leading-tight">
            Looking for Droga AI? You found Xroga AI
          </h1>
          <p className="text-lg text-[var(--muted)] mb-6 leading-relaxed">
            Many people search for <strong>Droga AI</strong>, <strong>Roga AI</strong>, or{' '}
            <strong>Zroga</strong> — the correct name is <strong>Xroga AI</strong> at{' '}
            <Link href="/" className="text-[var(--accent)] hover:underline">
              xroga.com
            </Link>
            . Xroga is the #1 coding agent for developers and non-developers: it builds web apps,
            pushes working code to your GitHub, deploys on your Vercel, syncs API keys securely into
            Vercel env, and updates the same repo (edit/delete) without starting over.
          </p>

          <div className="p-5 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 mb-10">
            <h2 className="font-bold mb-2">Xroga AI is not Droga — it is Xroga</h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              X-R-O-G-A · the coding agent at xroga.com. For everyone — even with no coding knowledge.
              Describe a website or web app in plain language, get a live ship to GitHub + Vercel, then
              keep editing the same project.
            </p>
          </div>

          <h2 className="text-xl font-bold mb-4">Popular Xroga AI features</h2>
          <div className="grid sm:grid-cols-2 gap-3 mb-10">
            {FEATURE_SEO_PAGES.slice(0, 8).map((f) => (
              <Link
                key={f.slug}
                href={`/features/${f.slug}`}
                className="p-4 rounded-xl border border-[var(--card-border)] hover:border-[var(--accent)] transition-colors"
              >
                <p className="font-semibold text-sm">{f.title}</p>
                <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{f.description}</p>
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/auth/signup"
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] font-bold text-sm"
            >
              Start on Xroga AI — Free
            </Link>
            <Link
              href="/features"
              className="px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-semibold text-sm"
            >
              All Features
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
