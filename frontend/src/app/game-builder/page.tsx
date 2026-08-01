import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { OreBlock, PixelGlyph } from '@/components/crypto-builder/PixelArt';
import { VoxelWorld } from '@/components/game-builder/VoxelWorld';
import { GameFaq } from '@/components/game-builder/GameFaq';
import {
  GAME_KINDS,
  GAME_LIMITS,
  GAME_PIPELINE,
  GAME_PLACEHOLDERS,
  GAME_PROMPTS,
  GAME_SPLASH,
  GAME_STACKS,
} from '@/lib/gameBuilderContent';
import { buildMetadata } from '@/lib/seo';
import '@/styles/homepage-coding.css';
import '@/styles/game-builder.css';

export const metadata: Metadata = buildMetadata({
  title: 'Game Builder — Build Games With AI in Code You Own',
  description:
    'Build 2D platformers, puzzle games, roguelikes, voxel sandboxes, idle games, and browser game jam entries with Xroga AI. Real systems in a repository you own — Phaser, Three.js, PixiJS, Canvas, Godot, and Unity.',
  path: '/game-builder',
  keywords: [
    'AI game builder',
    'build games with AI',
    'AI game development',
    'make a game with AI',
    'AI game maker',
    'browser game builder',
    'AI game jam',
    '2D platformer builder',
    'voxel game builder',
    'Phaser AI',
    'Three.js AI',
  ],
});

export default function GameBuilderPage() {
  /**
   * Structured data: the product only.
   *
   * Deliberately no `FAQPage` block, even though this page renders a real FAQ.
   * `SiteJsonLd` in the root layout already emits a site-wide FAQPage on every
   * route, so adding one here put two conflicting FAQPage entries on a single URL —
   * and the global block's questions ("What is Xroga AI?", "How is Xroga different
   * from Cursor?") are not visible on this page. One FAQPage per URL whose Q&A is
   * actually on screen is the rule; two is worse than one, so this page does not add
   * a second. The visible FAQ still gets crawled as ordinary content.
   *
   * The site-wide FAQPage appearing on pages that do not display its questions is a
   * pre-existing issue worth fixing separately; it is not made worse here.
   */
  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Xroga Game Builder',
    applicationCategory: 'DeveloperApplication',
    applicationSubCategory: 'GameDevelopment',
    operatingSystem: 'Web',
    url: 'https://xroga.com/game-builder',
    description:
      'Build 2D platformers, puzzle games, roguelikes, voxel sandboxes, idle games, and browser game jam entries with Xroga AI, in a repository you own.',
  };


  return (
    <main className="xv-gb-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd).replace(/</g, '\\u003c') }}
      />

      <div className="xv-gb-backdrop" aria-hidden="true">
        <div className="xv-gb-sky" />
        <div className="xv-gb-stars" />
        <div className="xv-gb-grid" />
      </div>

      {/* ----------------------------------------------------- header: a hotbar */}
      <header className="xv-gb-header">
        <div className="xv-gb-shell xv-gb-header__inner">
          <Logo href="/" height={32} />
          <nav className="xv-gb-nav" aria-label="Game Builder">
            <Link href="/showcase" className="xv-gb-slot">
              <PixelGlyph name="gem" size={12} />
              <span>Showcase</span>
            </Link>
            <Link href="/docs" className="xv-gb-slot">
              <PixelGlyph name="book" size={12} />
              <span>Docs</span>
            </Link>
            <Link href="/auth/signup" className="xv-gb-btn xv-gb-btn--primary xv-gb-btn--sm">
              Start building
            </Link>
          </nav>
        </div>
      </header>

      {/* -------------------------------------------------------------- hero */}
      <section className="xv-gb-hero">
        <div className="xv-gb-shell xv-gb-hero__grid">
          <div className="xv-gb-hero__copy">
            <p className="xv-gb-eyebrow">
              <PixelGlyph name="pick" size={12} />
              XROGA GAME BUILDER
            </p>

            <div className="xv-gb-title-wrap">
              <h1 className="xv-gb-h1">
                Build games that <em>actually play.</em>
              </h1>
              <span className="xv-gb-splash" aria-hidden="true">
                {GAME_SPLASH}
              </span>
            </div>

            <p className="xv-gb-lede">
              Describe the game you want — a platformer, a roguelike, a voxel world, a jam entry — and Xroga builds
              the real systems in a repository you own: input, state, collision, rendering, and progression.
            </p>

            <div className="xv-gb-chat">
              <HomepageChatBar
                placeholders={GAME_PLACEHOLDERS}
                suggestions={GAME_PROMPTS}
                ariaLabel="Describe the game you want to build"
                fallbackPrompt="Build a game with Xroga AI"
              />
            </div>
          </div>

          <VoxelWorld />
        </div>
      </section>

      {/* ------------------------------------------------ genres as ore blocks */}
      <section className="xv-gb-section" aria-labelledby="gb-kinds-heading">
        <div className="xv-gb-shell">
          <p className="xv-gb-kicker">Creative mode</p>
          <h2 id="gb-kinds-heading" className="xv-gb-h2">
            What you can build here
          </h2>
          <p className="xv-gb-section-copy">
            Every one of these is a real project in your repository, not a preview locked inside an editor.
          </p>

          <div className="xv-gb-blocks">
            {GAME_KINDS.map(({ title, body, ore, glyph, tag }, index) => (
              <article key={title} className="xv-gb-block" data-ore={ore}>
                <div className="xv-gb-block__top">
                  <span className="xv-gb-block__art">
                    <OreBlock variant={index} size={48} />
                    <span className="xv-gb-block__glyph">
                      <PixelGlyph name={glyph} size={18} />
                    </span>
                  </span>
                  <span className="xv-gb-tag">{tag}</span>
                </div>
                <h3 className="xv-gb-block__title">{title}</h3>
                <p className="xv-gb-block__text">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ engines/stacks */}
      <section className="xv-gb-section xv-gb-section--tint" aria-labelledby="gb-stack-heading">
        <div className="xv-gb-shell">
          <p className="xv-gb-kicker">Choose your tools</p>
          <h2 id="gb-stack-heading" className="xv-gb-h2">
            Engines and runtimes it can target
          </h2>
          <p className="xv-gb-section-copy">
            Xroga is not affiliated with or endorsed by these projects. They are named as targets you can ask for.
          </p>

          <ul className="xv-gb-stacks">
            {GAME_STACKS.map((stack) => (
              <li key={stack.name} className="xv-gb-stack">
                <span className="xv-gb-stack__kind">{stack.kind}</span>
                <span className="xv-gb-stack__name">{stack.name}</span>
                <span className="xv-gb-stack__note">{stack.note}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------- pipeline as crafting row */}
      <section className="xv-gb-section" aria-labelledby="gb-loop-heading">
        <div className="xv-gb-shell">
          <p className="xv-gb-kicker">Survival mode</p>
          <h2 id="gb-loop-heading" className="xv-gb-h2">
            Design → build → play → ship
          </h2>

          <ol className="xv-gb-craft">
            {GAME_PIPELINE.map(({ title, body, glyph }, index) => (
              <li key={title} className="xv-gb-craft__item">
                <div className="xv-gb-craft__card">
                  <div className="xv-gb-craft__top">
                    <span className="xv-gb-slotframe">
                      <PixelGlyph name={glyph} size={20} />
                    </span>
                    <span className="xv-gb-craft__num">0{index + 1}</span>
                  </div>
                  <h3 className="xv-gb-block__title">{title}</h3>
                  <p className="xv-gb-block__text">{body}</p>
                </div>
                {index < GAME_PIPELINE.length - 1 && (
                  <span className="xv-gb-craft__arrow" aria-hidden="true">
                    <PixelGlyph name="arrow" size={14} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ----------------------------------------------------------------- faq */}
      <section className="xv-gb-section xv-gb-section--tint" aria-labelledby="gb-faq-heading">
        <div className="xv-gb-shell">
          <p className="xv-gb-kicker">Before you start</p>
          <h2 id="gb-faq-heading" className="xv-gb-h2">
            Questions builders actually ask
          </h2>
          <GameFaq />
        </div>
      </section>

      {/* -------------------------------------------------------------- limits */}
      <section className="xv-gb-section">
        <div className="xv-gb-shell">
          <aside className="xv-gb-limits" role="note">
            <PixelGlyph name="shield" size={18} className="xv-gb-limits__icon" />
            <div>
              <h2 className="xv-gb-limits__title">What Xroga does not promise</h2>
              <p className="xv-gb-block__text">{GAME_LIMITS}</p>
            </div>
          </aside>

          <div className="xv-gb-cta">
            <span className="xv-gb-cta__block" aria-hidden="true">
              <OreBlock variant={2} size={56} />
              <span className="xv-gb-cta__glyph">
                <PixelGlyph name="pick" size={22} />
              </span>
            </span>
            <div>
              <h2 className="xv-gb-h2">Bring the idea. Xroga writes the game.</h2>
              <p className="xv-gb-section-copy">
                Start with one sentence and keep iterating in the real workspace — the code stays in your repository
                the whole time.
              </p>
            </div>
            <Link href="/auth/signup" className="xv-gb-btn xv-gb-btn--primary">
              <PixelGlyph name="rocket" size={12} />
              Open Xroga
            </Link>
          </div>

          <div className="xv-gb-links">
            <Link href="/crypto-builder">
              Crypto Builder <PixelGlyph name="arrow" size={10} />
            </Link>
            <Link href="/showcase">
              Showcase <PixelGlyph name="arrow" size={10} />
            </Link>
            <Link href="/pricing">
              Plan and capacity <PixelGlyph name="arrow" size={10} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
