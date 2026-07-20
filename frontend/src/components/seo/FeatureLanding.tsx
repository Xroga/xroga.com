import Link from 'next/link';
import type { FeatureSeoPage } from '@/lib/featureSeo';
import { getFeatureBySlug } from '@/lib/featureSeo';
import { FeatureJsonLd } from '@/components/seo/FeatureJsonLd';

export function FeatureLanding({ page }: { page: FeatureSeoPage }) {
  const related = page.relatedSlugs
    .map((s) => getFeatureBySlug(s))
    .filter(Boolean) as FeatureSeoPage[];

  return (
    <>
      <FeatureJsonLd page={page} />
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <header className="border-b border-[var(--card-border)] px-4 sm:px-8 py-6">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <nav className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <Link href="/" className="font-bold text-[var(--accent)] hover:underline">
                Xroga AI
              </Link>
              <span>/</span>
              <Link href="/features" className="hover:text-[var(--accent)]">
                Features
              </Link>
              <span>/</span>
              <span className="text-[var(--foreground)]">{page.title}</span>
            </nav>
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
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-4 leading-tight">{page.headline}</h1>
          <p className="text-lg text-[var(--muted)] mb-8 leading-relaxed">{page.description}</p>

          <section className="mb-10">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--accent)] mb-4">
              What you get with Xroga AI
            </h2>
            <ul className="space-y-3">
              {page.bullets.map((b) => (
                <li
                  key={b}
                  className="flex gap-3 p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/40 text-sm leading-relaxed"
                >
                  <span className="text-[var(--accent)] shrink-0 font-bold">✓</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>

          {page.faq.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold mb-4">FAQ</h2>
              <div className="space-y-4">
                {page.faq.map((item) => (
                  <div
                    key={item.q}
                    className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/30"
                  >
                    <h3 className="font-semibold text-sm mb-2">{item.q}</h3>
                    <p className="text-sm text-[var(--muted)] leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {related.length > 0 && (
            <section className="mb-10">
              <h2 className="text-xl font-bold mb-4">Related Xroga AI features</h2>
              <div className="flex flex-wrap gap-2">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/features/${r.slug}`}
                    className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--card-border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    {r.title}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--card-border)]">
            <Link
              href="/auth/signup"
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] font-bold text-sm"
            >
              Try {page.title} — Start free
            </Link>
            <Link
              href="/pricing"
              className="px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-semibold text-sm hover:border-[var(--accent)]"
            >
              Pricing
            </Link>
            <Link
              href="/features"
              className="px-5 py-2.5 rounded-xl border border-[var(--card-border)] font-semibold text-sm hover:border-[var(--accent)]"
            >
              All Features
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
