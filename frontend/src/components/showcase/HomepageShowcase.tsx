'use client';

/**
 * Homepage showcase strip.
 *
 * Uses the same ShowcaseCard as /showcase — including its live scaled preview of the
 * real product — but with no action handlers, so the card renders link-only. That is
 * deliberate: customizing needs an account, and a marketing section should not put a
 * button in front of people that immediately turns into an auth wall.
 *
 * The previews are lazy: each frame loads only once it is near the viewport, so this
 * section costs nothing on first paint.
 */

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { ShowcaseCard } from './ShowcaseCard';
import { SHOWCASE_TEMPLATES } from '@/lib/showcase/registry';

export function HomepageShowcase() {
  return (
    <section className="xv-hc-section" aria-labelledby="showcase-home-heading">
      <div className="xv-hc-section-inner">
        <p className="xv-hc-pixel-kicker">BUILT WITH XROGA AI</p>
        <h2 className="xv-hc-section-title" id="showcase-home-heading">
          Real products, <em>not screenshots.</em>
        </h2>
        <p className="xv-hc-section-copy">
          Every card below is the running product, live and scaled down. Open one, click through it, then customize it for
          your idea or copy it into your own repository.
        </p>

        <div className="mx-auto mt-8 grid w-full max-w-6xl gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE_TEMPLATES.map((template) => (
            <ShowcaseCard key={template.id} template={template} />
          ))}
        </div>

        <div className="mt-8">
          <Link href="/showcase" className="xv-hc-btn-primary inline-flex items-center gap-1.5">
            Explore all templates
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
