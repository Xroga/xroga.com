'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import {
  DEFAULT_SCENE,
  SCENE_PRESETS,
  TRUST_POINTS,
  sceneById,
  type CockpitSceneId,
} from '@/lib/gameCockpitContent';
import { fillPrompt, focusIteration, onPreset, revealElement } from '@/lib/gameCockpitBus';
import { CreatorCockpit } from './CreatorCockpit';
import { HudIcon } from './HudIcons';

const PLACEHOLDERS = [
  'Describe your game…',
  'A cyber ninja in a neon city…',
  'Survive on a low-gravity island…',
  'Space racer with upgrades…',
  'Roguelike in a dark dungeon…',
];

/**
 * The hero: copy and prompt on the left, Creator Cockpit on the right.
 *
 * This is the one client boundary that has to wrap both columns, because choosing
 * an idea on the left is what changes the cockpit on the right — that link is the
 * point of the section. Everything below the hero stays in its own smaller
 * boundary, or on the server.
 *
 * The prompt bar is the untouched `HomepageChatBar`: same submission path, same
 * pending-prompt stash, same signup routing. Only its surrounding chrome is styled
 * here, so the flow that carries a prompt into the workspace is not duplicated.
 */
export function GameBuilderHero() {
  const [sceneId, setSceneId] = useState<CockpitSceneId>(DEFAULT_SCENE.id);
  const promptRef = useRef<HTMLDivElement>(null);
  const scene = sceneById(sceneId);

  // A card further down the page can point the cockpit at its preset.
  useEffect(() => onPreset(setSceneId), []);

  function chooseIdea(preset: (typeof SCENE_PRESETS)[number]) {
    setSceneId(preset.id);
    fillPrompt(preset.prompt);
  }

  return (
    <section className="xv-gc-hero" aria-labelledby="gc-hero-title">
      <div className="xv-gc-hero__grid">
        {/* ------------------------------------------------------------ copy */}
        <div className="xv-gc-hero__copy">
          <p className="xv-gc-eyebrow">
            <HudIcon name="cube" size={12} />
            AI Game Builder
          </p>

          <h1 className="xv-gc-h1" id="gc-hero-title">
            Describe a game.
            <br />
            Play it <em>minutes</em> later.
          </h1>

          <p className="xv-gc-lede">
            Xroga turns your ideas into working games with real controls, mechanics, progression and clean code in
            your repository.
          </p>

          <div className="xv-gc-prompt xv-gc-prompt-surface" ref={promptRef}>
            <HomepageChatBar
              placeholders={PLACEHOLDERS}
              ariaLabel="Describe the game you want to build"
              fallbackPrompt="Build a game with Xroga AI"
            />
          </div>

          <div className="xv-gc-ideas">
            <p className="xv-gc-ideas__label" id="gc-ideas-label">
              Try an idea
            </p>
            <ul className="xv-gc-ideas__list" aria-labelledby="gc-ideas-label">
              {SCENE_PRESETS.map((preset) => (
                <li key={preset.id}>
                  <button
                    type="button"
                    className="xv-gc-idea"
                    aria-pressed={preset.id === sceneId}
                    onClick={() => chooseIdea(preset)}
                  >
                    <HudIcon name="spark" size={12} />
                    <span>{preset.chipLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="xv-gc-hero__actions">
            <button
              type="button"
              className="xv-gc-btn xv-gc-btn--primary xv-gc-btn--lg"
              onClick={() => {
                fillPrompt(scene.prompt);
                revealElement(promptRef.current);
              }}
            >
              Build my game
              <HudIcon name="arrow" size={14} />
            </button>
            <Link href="/showcase" className="xv-gc-btn xv-gc-btn--ghost xv-gc-btn--lg">
              Play an example
              <HudIcon name="play" size={11} />
            </Link>
          </div>

          <ul className="xv-gc-trust">
            {TRUST_POINTS.map((point) => (
              <li key={point}>
                <HudIcon name="check" size={12} />
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* --------------------------------------------------------- cockpit */}
        <div className="xv-gc-hero__cockpit">
          <CreatorCockpit scene={scene} onEditWithAi={focusIteration} />
        </div>
      </div>
    </section>
  );
}
