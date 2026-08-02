import type { Metadata } from 'next';
import Link from 'next/link';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { AtmosphericBackdrop } from '@/components/game-builder/AtmosphericBackdrop';
import { BuildActivity } from '@/components/game-builder/BuildActivity';
import { EngineLoadout } from '@/components/game-builder/EngineLoadout';
import { GameBuilderHeader } from '@/components/game-builder/GameBuilderHeader';
import { GameBuilderHero } from '@/components/game-builder/GameBuilderHero';
import { GameFaq } from '@/components/game-builder/GameFaq';
import { GeneratedSystems } from '@/components/game-builder/GeneratedSystems';
import { HudIcon } from '@/components/game-builder/HudIcons';
import { IterationDemo } from '@/components/game-builder/IterationDemo';
import { PlayableExamples } from '@/components/game-builder/PlayableExamples';
import { RepositoryPreview } from '@/components/game-builder/RepositoryPreview';
import { GAME_LIMITS } from '@/lib/gameBuilderContent';
import { buildMetadata } from '@/lib/seo';
import '@/styles/homepage-coding.css';
import '@/styles/game-cockpit.css';

/**
 * Metadata carried over unchanged from the previous version of this route: same
 * title, description, path and keywords, so the canonical URL, the sitemap entry
 * and any existing ranking signal are untouched by the redesign.
 */
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
   * Structured data: the product only, unchanged from before the redesign.
   *
   * Still deliberately no `FAQPage` block. `SiteJsonLd` in the root layout already
   * emits a site-wide FAQPage on every route, so adding one here would put two
   * conflicting FAQPage entries on a single URL. The visible FAQ is still crawled
   * as ordinary content.
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
    <main className="xv-gc-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd).replace(/</g, '\\u003c') }}
      />

      <AtmosphericBackdrop />

      <GameBuilderHeader />

      <div className="xv-gc-shell">
        <GameBuilderHero />

        <div className="xv-gc-sections">
          {/* 1 · 2 · 3 */}
          <div className="xv-gc-row xv-gc-row--a">
            <PlayableExamples />
            <GeneratedSystems />
            <BuildActivity variant="steps" />
          </div>

          {/* 4 · 5 · 6 */}
          <div className="xv-gc-row xv-gc-row--b">
            <EngineLoadout />
            <IterationDemo />
            <RepositoryPreview />
          </div>

          {/* FAQ — existing content and behaviour, restyled */}
          <section className="xv-gc-panel" aria-labelledby="gc-faq-title">
            <header className="xv-gc-panel__head">
              <h2 className="xv-gc-panel__title" id="gc-faq-title">
                <span className="xv-gc-panel__index">7.</span> Questions builders actually ask
              </h2>
            </header>
            <GameFaq />
          </section>

          {/* Limits — verbatim, and kept above the final call to action */}
          <aside className="xv-gc-panel xv-gc-limits" role="note" aria-labelledby="gc-limits-title">
            <HudIcon name="combat" size={20} />
            <div>
              <h2 className="xv-gc-panel__title" id="gc-limits-title">
                What Xroga does not promise
              </h2>
              <p>{GAME_LIMITS}</p>
            </div>
          </aside>

          {/* Final CTA — the same prompt component, not a decorative lookalike.
              `listenForAsk={false}` so a "use this prompt" click fills the hero
              bar and keeps focus there rather than jumping to the page foot. */}
          <section className="xv-gc-cta" aria-labelledby="gc-cta-title">
            <div>
              <h2 className="xv-gc-cta__title" id="gc-cta-title">
                Ready to build your game?
              </h2>
              <p className="xv-gc-cta__copy">Describe your idea and watch Xroga bring it to life.</p>
            </div>
            <div className="xv-gc-cta__prompt xv-gc-prompt-surface">
              <HomepageChatBar
                placeholders={['Describe your game…']}
                ariaLabel="Describe the game you want to build"
                fallbackPrompt="Build a game with Xroga AI"
                listenForAsk={false}
              />
            </div>
          </section>

          <nav className="xv-gc-foot" aria-label="Related pages">
            <Link href="/crypto-builder">Crypto Builder</Link>
            <Link href="/showcase">Showcase</Link>
            <Link href="/pricing">Plan and capacity</Link>
            <Link href="/docs">Docs</Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
