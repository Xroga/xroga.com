import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { ScrollReveal } from './ScrollReveal';
import { CapabilityHeroCard } from './CapabilityHeroCard';
import { OreBlock, PixelGlyph } from '@/components/crypto-builder/PixelArt';
import { capabilityIdentity, outcomeOre, processGlyph, processOre } from '@/lib/capabilityPageArt';
import type { CapabilityPageData } from '@/lib/capabilityPages';
import '@/styles/capability-page.css';
import { PageJsonLd } from '@/components/seo/PageJsonLd';

/**
 * The shared template behind all six capability pages (`/ai-coding-agent`,
 * `/ai-app-builder`, `/ai-website-builder`, `/build-saas-with-ai`,
 * `/github-ai-coding-agent`, `/vercel-ai-deployment`).
 *
 * The look is the same voxel/pixel language as `/crypto-builder`: nothing is
 * rounded, panels carry a two-pixel bevel lit from the top-left over a hard drop,
 * chrome is set in the pixel face, and outcomes are mineable ore blocks. Reusing that
 * vocabulary — including the actual `PixelGlyph` and `OreBlock` components — is what
 * makes the two surfaces read as one product rather than two experiments.
 *
 * Two rules the design is written around, both load-bearing:
 *
 * 1. The page follows the selected Xroga theme in all four variants. White and Beige
 *    render a daylight overworld; Gray and Black render night. `--surface-page` and
 *    `--text-primary` still decide the page background and heading ink, so a light
 *    theme genuinely produces a light page — the previous hardcoded `bg-[#050910]`
 *    was a real bug, and a permanently dark cave would simply reintroduce it.
 *
 * 2. Colour carries decoration, never meaning. Ore hues drive block art, bevels and
 *    glyphs; body copy and headings stay on the theme's text tokens, so contrast is
 *    inherited rather than re-guessed per ore.
 *
 * Body copy stays in the mono face, not the pixel face. Press Start 2P is roughly a
 * full em per character — a paragraph of it is decoration pretending to be text — so
 * the pixel face is restricted to chrome and headings, which is also where it reads
 * strongest.
 *
 * Every legal sentence — the outcomes, the process steps, the limits paragraph — is
 * carried verbatim from the page data. This is a visual rebuild, not a rewrite of
 * the claims.
 */
export function CapabilityPage({ data }: { data: CapabilityPageData }) {
  const { glyph, ore } = capabilityIdentity(data.slug);

  return (
    <main className="xv-cap-root" data-ore={ore}>
      <PageJsonLd path={`/${data.slug}`} name={data.title} description={data.description} />
      <div className="xv-cap-backdrop" aria-hidden="true">
        <div className="xv-cap-sky" />
        <div className="xv-cap-grid" />
      </div>

      <header className="xv-cap-header">
        <div className="xv-cap-shell xv-cap-header__inner">
          <Logo href="/" height={32} />
          <nav className="xv-cap-nav" aria-label="Capability page">
            <Link href="/docs" className="xv-cap-slot">
              <PixelGlyph name="book" size={12} />
              <span>Docs</span>
            </Link>
            <Link href="/community" className="xv-cap-slot">
              <PixelGlyph name="net" size={12} />
              <span>Community</span>
            </Link>
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
              <PixelGlyph name={glyph} size={12} />
              {data.eyebrow}
            </p>
            <h1 className="xv-cap-h1">{data.title}</h1>
            <p className="xv-cap-lede">{data.intro}</p>
            <div className="xv-cap-cta-row">
              <Link href="/auth/signup" className="xv-cap-btn xv-cap-btn--primary">
                Start with a prompt
                <PixelGlyph name="arrow" size={12} />
              </Link>
              <Link href="/docs/getting-started" className="xv-cap-btn xv-cap-btn--ghost">
                Read the guide
              </Link>
            </div>
          </div>

          <CapabilityHeroCard slug={data.slug} />
        </div>
      </section>

      {/* -------------------------------------------------- outcomes as ore blocks */}
      <section className="xv-cap-section" aria-labelledby="cap-outcomes-heading">
        <div className="xv-cap-shell">
          <ScrollReveal>
            <p className="xv-cap-kicker">Creative mode</p>
            <h2 id="cap-outcomes-heading" className="xv-cap-h2">
              Outcomes Xroga can help produce
            </h2>
          </ScrollReveal>

          <div className="xv-cap-blocks">
            {data.outcomes.map((outcome, index) => (
              <ScrollReveal key={outcome} delay={index * 60}>
                <article className="xv-cap-block" data-ore={outcomeOre(index)}>
                  <span className="xv-cap-block__art">
                    <OreBlock variant={index} size={44} />
                  </span>
                  <p className="xv-cap-block__text">{outcome}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ process as a crafting row */}
      <section className="xv-cap-section xv-cap-section--tint" aria-labelledby="cap-process-heading">
        <div className="xv-cap-shell">
          <ScrollReveal>
            <p className="xv-cap-kicker">Survival mode</p>
            <h2 id="cap-process-heading" className="xv-cap-h2">
              How the work stays controlled
            </h2>
          </ScrollReveal>

          <ol className="xv-cap-craft">
            {data.process.map((step, index) => (
              <ScrollReveal key={step.title} as="li" delay={index * 90} className="xv-cap-craft__item">
                <div className="xv-cap-craft__card" data-ore={processOre(index)}>
                  <div className="xv-cap-craft__top">
                    <span className="xv-cap-slotframe">
                      <PixelGlyph name={processGlyph(index)} size={20} />
                    </span>
                    <span className="xv-cap-craft__num">0{index + 1}</span>
                  </div>
                  <h3 className="xv-cap-block__title">{step.title}</h3>
                  <p className="xv-cap-block__text">{step.body}</p>
                </div>
                {index < data.process.length - 1 && (
                  <span className="xv-cap-craft__arrow" aria-hidden="true">
                    <PixelGlyph name="arrow" size={14} />
                  </span>
                )}
              </ScrollReveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ limits */}
      <section className="xv-cap-section">
        <div className="xv-cap-shell">
          <ScrollReveal>
            <aside className="xv-cap-limits" role="note">
              <PixelGlyph name="shield" size={18} className="xv-cap-limits__icon" />
              <div>
                <h2 className="xv-cap-limits__title">What Xroga does not fabricate</h2>
                <p className="xv-cap-block__text">{data.limits}</p>
              </div>
            </aside>
          </ScrollReveal>

          <div className="xv-cap-links">
            <Link href="/docs">
              Documentation <PixelGlyph name="arrow" size={10} />
            </Link>
            <Link href="/pricing">
              Plan and capacity <PixelGlyph name="arrow" size={10} />
            </Link>
            <Link href="/crypto-builder">
              Crypto Builder <PixelGlyph name="arrow" size={10} />
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------------- cta */}
      <section className="xv-cap-section">
        <div className="xv-cap-shell">
          <ScrollReveal>
            <div className="xv-cap-cta">
              <span className="xv-cap-cta__block" aria-hidden="true">
                <OreBlock variant={1} size={56} />
                <span className="xv-cap-cta__glyph">
                  <PixelGlyph name="pick" size={22} />
                </span>
              </span>
              <div>
                <h2 className="xv-cap-h2">Bring the outcome. Xroga does the repository work.</h2>
                <p className="xv-cap-lede xv-cap-lede--tight">
                  Describe what you want built, and continue in the real workspace — inspecting your project,
                  implementing focused changes, and reporting the evidence a real check produced.
                </p>
              </div>
              <Link href="/auth/signup" className="xv-cap-btn xv-cap-btn--primary">
                <PixelGlyph name="rocket" size={12} />
                Open Xroga
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </main>
  );
}
