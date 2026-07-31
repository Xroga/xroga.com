/**
 * Homepage showcase strip.
 *
 * Deliberately link-only — no customize/export dialogs here. Those need an account,
 * and the homepage should not open an auth wall from a marketing section. Everything
 * routes to /showcase or a product's own detail page.
 */

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { SHOWCASE_TEMPLATES, isLive, previewRouteFor } from '@/lib/showcase/registry';

export function HomepageShowcase() {
  return (
    <section className="xv-hc-section" aria-labelledby="showcase-home-heading">
      <div className="xv-hc-section-inner">
        <p className="xv-hc-pixel-kicker">BUILT WITH XROGA AI</p>
        <h2 className="xv-hc-section-title" id="showcase-home-heading">
          Real products, <em>not screenshots.</em>
        </h2>
        <p className="xv-hc-section-copy">
          Every build below is a working template you can open, click through, customize with Xroga AI, and copy into a
          repository you own.
        </p>

        <ul className="mx-auto mt-8 grid w-full max-w-5xl list-none gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE_TEMPLATES.map((template) => {
            const live = isLive(template);
            const previewRoute = previewRouteFor(template);
            return (
              <li key={template.id}>
                <Link
                  href={`/showcase/${template.slug}`}
                  className="flex h-full flex-col rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-shadow hover:shadow-elevated focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-10 rounded-full"
                    style={{ background: template.accent }}
                  />
                  <span className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                      {template.category}
                    </span>
                    {live ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)]">
                        <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                        Live preview
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-[var(--text-muted)]">In development</span>
                    )}
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-[var(--text-primary)]">{template.name}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-[var(--text-secondary)]">
                    {template.shortDescription}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                    {live && previewRoute ? 'Open it' : 'See what it will ship with'}
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <Link href="/showcase" className="xv-hc-btn-ghost">
            Browse the full showcase
          </Link>
        </div>
      </div>
    </section>
  );
}
