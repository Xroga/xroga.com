'use client';

/**
 * Homepage showcase strip, placed directly after the hero and its prompt bar.
 *
 * Cards use real captured screenshots rather than live frames, so this section does
 * not boot six application runtimes on the homepage. The interactive product loads
 * only once someone opens a preview.
 *
 * "Customize for me" is fully wired here: a signed-out visitor's template choice and
 * answers are preserved through signup and restored in the workspace afterwards, so
 * the button does real work rather than bouncing them to a login screen empty-handed.
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
          Start from something <em>powerful.</em>
        </h2>
        <p className="xv-hc-section-copy">
          Explore complete products built through the Xroga workflow. Preview every experience in desktop, tablet, and
          mobile — then make one your own with Xroga AI.
        </p>

        <div className="mx-auto mt-8 grid w-full max-w-6xl gap-5 text-left sm:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE_TEMPLATES.map((template, index) => (
            <ShowcaseCard
              key={template.id}
              template={template}
              // Only the first image is eager; the rest stay lazy.
              priority={index === 0}
            />
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
