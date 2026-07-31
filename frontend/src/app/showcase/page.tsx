import type { Metadata } from 'next';
import Link from 'next/link';
import { buildMetadata } from '@/lib/seo';
import { SHOWCASE_TEMPLATES } from '@/lib/showcase/registry';
import { ShowcaseGrid } from '@/components/showcase/ShowcaseGrid';

export const metadata: Metadata = buildMetadata({
  title: 'Xroga AI Showcase — complete products built with Xroga AI',
  description:
    'Explore complete products built through Xroga AI. Preview every experience, customize one for your idea, or send it straight to your connected GitHub repository.',
  path: '/showcase',
  keywords: [
    'Xroga AI showcase',
    'AI website builder templates',
    'AI SaaS template',
    'real estate platform template',
    'booking platform template',
    'AI app templates',
  ],
});

export default function ShowcasePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--text-primary)]">
          Xroga
        </Link>
        <span aria-hidden className="mx-1.5">
          /
        </span>
        <span className="text-[var(--text-secondary)]">Showcase</span>
      </nav>

      <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)]">BUILT WITH XROGA AI</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
        See what Xroga can build.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
        Explore complete products built through Xroga AI. Preview every experience, customize one for your idea, or send
        it directly to your connected GitHub repository.
      </p>

      <div className="mt-10">
        <ShowcaseGrid templates={SHOWCASE_TEMPLATES} />
      </div>

      <p className="mt-10 max-w-2xl text-xs text-[var(--text-muted)]">
        Each card above is a live, scaled preview of the running product, not a screenshot. Sample content inside every
        product is clearly labelled and is not real customer, property, or booking data. The mobile template generates an
        Expo project — no app store listing or signed release exists — and the AI workspace runs in a labelled
        demonstration mode rather than calling a model.
      </p>
    </main>
  );
}
