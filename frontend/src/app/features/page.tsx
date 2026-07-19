import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { XROGA_FEATURES } from '@/lib/features';
import { FEATURE_SEO_PAGES } from '@/lib/featureSeo';

export const metadata: Metadata = buildMetadata({
  title: 'Features — #1 Coding Agent | GitHub + Vercel Ship Loop',
  description:
    'Xroga AI features for everyone: #1 coding agent chat, build websites & web apps (no coding knowledge required), GitHub push, Vercel deploy, secure API key sync, Workspace preview, and repo edit/delete without starting over.',
  path: '/features',
  keywords: [
    'Xroga features',
    'AI coding agent features',
    'build website with AI',
    'GitHub AI deploy',
    'Vercel AI deploy',
    'AI for non developers',
    'Droga AI',
    'xroga.com features',
  ],
});

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="border-b border-[var(--card-border)] px-4 sm:px-8 py-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-sm font-bold text-[var(--accent)] hover:underline">
            ← Xroga AI
          </Link>
          <div className="flex gap-3 text-sm">
            <Link href="/auth/login" className="hover:text-[var(--accent)]">
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="px-3 py-1 rounded-full bg-[var(--accent)] text-[var(--background)] font-semibold"
            >
              Sign Up Free
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">
          Xroga AI Features — #1 Coding Agent
        </h1>
        <p className="text-[var(--muted)] mb-8 leading-relaxed">
          Built for developers and people with no coding knowledge. Describe a web product, get
          working code on your GitHub, live on your Vercel, sync API keys securely, and keep
          updating the same repo — without starting over.
        </p>

        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">Featured capabilities</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {FEATURE_SEO_PAGES.map((f) => (
              <Link
                key={f.slug}
                href={`/features/${f.slug}`}
                className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/60 hover:border-[var(--accent)] transition-colors group"
              >
                <p className="font-semibold text-sm group-hover:text-[var(--accent)]">{f.title}</p>
                <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{f.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-bold mb-4">Full feature list</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {XROGA_FEATURES.map((f) => (
              <div
                key={f}
                className="flex items-start gap-2 p-3 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/50 text-sm"
              >
                <span className="text-[var(--accent)] shrink-0">✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/auth/signup"
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] font-bold text-sm"
          >
            Get Started — 7M Free Tokens
          </Link>
          <Link
            href="/integrations"
            className="px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-semibold text-sm hover:border-[var(--accent)]"
          >
            710+ Integrations
          </Link>
          <Link
            href="/pricing"
            className="px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-semibold text-sm hover:border-[var(--accent)]"
          >
            View Pricing
          </Link>
        </div>
      </main>
    </div>
  );
}
