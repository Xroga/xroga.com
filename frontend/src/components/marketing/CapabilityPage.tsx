import Link from 'next/link';
import { ArrowRight, CheckCircle2, Rocket, ShieldAlert } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { ScrollReveal } from './ScrollReveal';
import { CapabilityHeroCard } from './CapabilityHeroCard';
import { capabilityIdentity, processIcon } from '@/lib/capabilityPageArt';
import type { CapabilityPageData } from '@/lib/capabilityPages';
import '@/styles/capability-page.css';

/**
 * The shared template behind all six capability pages (`/ai-coding-agent`,
 * `/ai-app-builder`, `/ai-website-builder`, `/build-saas-with-ai`,
 * `/github-ai-coding-agent`, `/vercel-ai-deployment`).
 *
 * The previous version was a single hardcoded-dark line with no structural
 * identity of its own — flat cards, a static radial-gradient blob, and `bg-[#050910]
 * text-white` regardless of the selected theme. That last part was a genuine bug,
 * the same class already fixed on several other surfaces this session: a White or
 * Beige visitor got a dark page whether they asked for one or not. Every colour here
 * now resolves through the page's semantic tokens, and the hue that used to be
 * hardcoded per element instead comes from one accent per page (see
 * `capabilityPageArt.ts`), so the page inverts correctly with the theme while still
 * having a distinct identity from its five siblings.
 *
 * Depth is CSS: 3D perspective on the hero card, a bento grid for outcomes, a
 * connected timeline for the process steps, and IntersectionObserver-driven reveals.
 * No WebGL, no motion library — this site was just measured down to a handful of
 * render-blocking requests, and a canvas scene here would be the wrong trade.
 *
 * Every legal sentence — the limits paragraph, the exact outcome and process copy —
 * is unchanged. This is a structural and visual rebuild, not a rewrite of the claims.
 */
export function CapabilityPage({ data }: { data: CapabilityPageData }) {
  const { icon: HeroIcon, accent } = capabilityIdentity(data.slug);

  return (
    <main className="xv-cap-root" data-accent={accent}>
      <div className="xv-cap-backdrop" aria-hidden="true">
        <div className="xv-cap-backdrop__grid" />
        <div className="xv-cap-backdrop__glow xv-cap-backdrop__glow--a" />
        <div className="xv-cap-backdrop__glow xv-cap-backdrop__glow--b" />
      </div>

      <header className="xv-cap-header">
        <div className="xv-cap-shell xv-cap-header__inner">
          <Logo href="/" height={34} />
          <nav className="xv-cap-nav" aria-label="Capability page">
            <Link href="/docs">Docs</Link>
            <Link href="/community">Community</Link>
            <Link href="/auth/signup" className="xv-cap-btn xv-cap-btn--primary xv-cap-btn--sm">
              Start building
            </Link>
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------------------- hero */}
      <section className="xv-cap-hero">
        <div className="xv-cap-shell xv-cap-hero__grid">
          <div className="xv-cap-hero__copy">
            <p className="xv-cap-eyebrow">
              <HeroIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {data.eyebrow}
            </p>
            <h1 className="xv-cap-h1">{data.title}</h1>
            <p className="xv-cap-lede">{data.intro}</p>
            <div className="xv-cap-cta-row">
              <Link href="/auth/signup" className="xv-cap-btn xv-cap-btn--primary">
                Start with a prompt
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/docs/getting-started" className="xv-cap-btn xv-cap-btn--ghost">
                Read the guide
              </Link>
            </div>
          </div>

          <CapabilityHeroCard slug={data.slug} />
        </div>
      </section>

      {/* --------------------------------------------------------- outcomes bento */}
      <section className="xv-cap-section" aria-labelledby="cap-outcomes-heading">
        <div className="xv-cap-shell">
          <ScrollReveal>
            <h2 id="cap-outcomes-heading" className="xv-cap-h2">
              Outcomes Xroga can help produce
            </h2>
          </ScrollReveal>

          <div className="xv-cap-bento">
            {data.outcomes.map((outcome, index) => (
              <ScrollReveal key={outcome} delay={index * 60} className="xv-cap-bento-item">
                <article className="xv-cap-card">
                  <CheckCircle2 className="xv-cap-card__icon" aria-hidden="true" />
                  <p className="xv-cap-card__text">{outcome}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- process timeline */}
      <section className="xv-cap-section xv-cap-section--tint" aria-labelledby="cap-process-heading">
        <div className="xv-cap-shell">
          <ScrollReveal>
            <h2 id="cap-process-heading" className="xv-cap-h2">
              How the work stays controlled
            </h2>
          </ScrollReveal>

          <ol className="xv-cap-timeline">
            {data.process.map((step, index) => {
              const StepIcon = processIcon(index);
              return (
                <ScrollReveal key={step.title} as="li" delay={index * 90} className="xv-cap-timeline__item">
                  <span className="xv-cap-timeline__node">
                    <StepIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="xv-cap-timeline__body">
                    <span className="xv-cap-timeline__num">0{index + 1}</span>
                    <h3 className="xv-cap-card__title">{step.title}</h3>
                    <p className="xv-cap-card__text">{step.body}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ limits */}
      <section className="xv-cap-section">
        <div className="xv-cap-shell">
          <ScrollReveal>
            <aside className="xv-cap-limits" role="note">
              <ShieldAlert className="xv-cap-limits__icon" aria-hidden="true" />
              <div>
                <h2 className="xv-cap-limits__title">What Xroga does not fabricate</h2>
                <p className="xv-cap-limits__body">{data.limits}</p>
              </div>
            </aside>
          </ScrollReveal>

          <div className="xv-cap-links">
            <Link href="/docs">
              Documentation <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link href="/pricing">
              Plan and capacity <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <Link href="/crypto-builder">
              Crypto Builder <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- cta */}
      <section className="xv-cap-section">
        <div className="xv-cap-shell">
          <ScrollReveal>
            <div className="xv-cap-final-cta">
              <div>
                <h2 className="xv-cap-h2">Bring the outcome. Xroga does the repository work.</h2>
                <p className="xv-cap-lede xv-cap-lede--tight">
                  Describe what you want built, and continue in the real workspace — inspecting your project,
                  implementing focused changes, and reporting the evidence a real check produced.
                </p>
              </div>
              <Link href="/auth/signup" className="xv-cap-btn xv-cap-btn--primary">
                <Rocket className="h-4 w-4" aria-hidden="true" />
                Open Xroga
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
