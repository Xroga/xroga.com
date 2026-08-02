'use client';

import Link from 'next/link';
import { PLAYABLE_EXAMPLES, sceneById } from '@/lib/gameCockpitContent';
import { fillPrompt, selectPreset } from '@/lib/gameCockpitBus';
import { GamePreview } from './GamePreview';
import { HudIcon } from './HudIcons';

/**
 * The example library.
 *
 * Cards read as launcher entries rather than blog posts: a fixed-ratio art panel,
 * runtime and genre badges over the art, then title, one line, and two actions.
 * Each card's art is its own scene preset, so the four previews genuinely differ —
 * different skyline, palette and motion — rather than one image under four colour
 * overlays.
 *
 * "Play" points at the real showcase route; "Use this prompt" fills the hero prompt
 * bar and points the cockpit at that preset, which is the honest version of "play"
 * for a game that is not actually hosted here.
 */
export function PlayableExamples() {
  return (
    <section className="xv-gc-panel xv-gc-examples" aria-labelledby="gc-examples-title">
      <header className="xv-gc-panel__head">
        <h2 className="xv-gc-panel__title" id="gc-examples-title">
          <span className="xv-gc-panel__index">1.</span> Playable examples
        </h2>
        <Link href="/showcase" className="xv-gc-link">
          View all
          <HudIcon name="arrow" size={12} />
        </Link>
      </header>

      <ul className="xv-gc-examples__row">
        {PLAYABLE_EXAMPLES.map((example) => {
          const scene = sceneById(example.scene);
          return (
            <li key={example.title} className="xv-gc-card">
              <div className="xv-gc-card__art">
                {/* Static art here: four looping previews above the fold would be
                    motion for its own sake. The cockpit is the animated one. */}
                <GamePreview scene={scene} playing={false} className="xv-gc-scene--card" />
                <span className="xv-gc-card__badges">
                  <span className="xv-gc-badge">Web</span>
                  <span className="xv-gc-badge xv-gc-badge--muted">{example.runtime}</span>
                </span>
              </div>

              <div className="xv-gc-card__body">
                <h3 className="xv-gc-card__title">{example.title}</h3>
                <p className="xv-gc-card__text">{example.body}</p>
                <p className="xv-gc-card__genre">{example.genre}</p>

                <div className="xv-gc-card__actions">
                  <Link href="/showcase" className="xv-gc-link xv-gc-link--sm">
                    Play
                    <HudIcon name="play" size={10} />
                  </Link>
                  <button
                    type="button"
                    className="xv-gc-link xv-gc-link--sm"
                    onClick={() => {
                      selectPreset(example.scene);
                      fillPrompt(example.prompt);
                      window.scrollTo({
                        top: 0,
                        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                      });
                    }}
                  >
                    Use this prompt
                    <HudIcon name="arrow" size={10} />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
