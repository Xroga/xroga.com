import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, GitBranch, Rocket, Wand2 } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { SHOWCASE_TEMPLATES } from '@/lib/showcase/registry';
import { ShowcaseExplorer } from '@/components/showcase/ShowcaseExplorer';

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

const STEPS = [
  {
    icon: Wand2,
    title: 'Customize with AI',
    body: 'Answer a few questions about your project. Xroga turns them into instructions you can read and edit before anything runs.',
  },
  {
    icon: GitBranch,
    title: 'Land it in your repo',
    body: 'The template is copied into a repository you own, on a new branch, with a pull request. Existing files are never overwritten.',
  },
  {
    icon: Rocket,
    title: 'Keep building',
    body: 'You own the code from the first commit. Every template is a working starting point, not a locked theme.',
  },
];

export default function ShowcasePage() {
  const liveCount = SHOWCASE_TEMPLATES.filter((template) => template.status === 'live').length;
  const categories = Array.from(new Set(SHOWCASE_TEMPLATES.map((template) => template.category)));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--text-primary)]">
          Xroga
        </Link>
        <span aria-hidden className="mx-1.5">
          /
        </span>
        <span className="text-[var(--text-secondary)]">Showcase</span>
      </nav>

      {/* Header */}
      <header className="max-w-3xl">
        <p className="text-xs font-bold tracking-[0.16em] text-[var(--accent)]">BUILT WITH XROGA AI</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl lg:text-5xl">
          Templates you can actually use.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
          {liveCount} complete products, each one running right here — click through them, resize them, then customize one
          for your idea or copy it into your own repository.
        </p>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
          {[
            { label: 'Products', value: String(liveCount) },
            { label: 'Categories', value: String(categories.length) },
            { label: 'Placeholder screenshots', value: 'None' },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{stat.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-[var(--text-primary)]">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-10">
        <ShowcaseExplorer />
      </div>

      {/* How it works */}
      <section aria-labelledby="showcase-how" className="mt-16">
        <h2 id="showcase-how" className="text-lg font-semibold text-[var(--text-primary)]">
          From template to your repository
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-token-sm bg-[var(--accent-dim,var(--surface-inset))] text-[var(--accent)]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Step {index + 1}
                </p>
                <h3 className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Closing CTA */}
      <section className="mt-12 overflow-hidden rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-6 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Want something that is not here?
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
          Describe it in the workspace. Templates are a head start, not a limit — Xroga builds from a plain description
          just as readily.
        </p>
        <Link
          href="/workspace"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          Describe your build
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>

      <p className="mt-10 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
        Every preview on this page is the running product, scaled — not a screenshot. Sample content inside each product
        is clearly labelled and is not real customer, property, or booking data. The mobile template generates an Expo
        project; no app store listing or signed release exists. The AI workspace runs in a labelled demonstration mode
        and does not call a model.
      </p>
    </main>
  );
}
