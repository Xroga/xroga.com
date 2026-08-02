'use client';

import { useEffect, useRef, useState } from 'react';
import { ITERATION, sceneById } from '@/lib/gameCockpitContent';
import { onIterate } from '@/lib/gameCockpitBus';
import { GamePreview } from './GamePreview';
import { HudIcon } from './HudIcons';

/**
 * Conversational iteration: one instruction, a visible change.
 *
 * Before and after are two genuinely different scenes — a desert preset and a cold
 * one — rather than the same art with a filter, so the "frozen city" in the
 * instruction is actually what you see afterwards. Submitting the instruction flips
 * the panel to After and lists the three changes as text, because a visual-only
 * difference is not readable to everyone.
 *
 * The cockpit's "Edit with AI" button focuses this input, which is why the
 * component listens on the bus.
 */
export function IterationDemo() {
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(
    () =>
      onIterate(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        sectionRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        window.setTimeout(() => inputRef.current?.focus(), reduce ? 0 : 350);
      }),
    []
  );

  const before = sceneById(ITERATION.before.scene);
  // The "after" world is the frozen city the instruction asks for. Built by
  // recolouring a preset rather than adding a fifth one, since it exists only here.
  const after = {
    ...before,
    id: 'frozen' as never,
    shape: 'city' as const,
    palette: {
      sky1: '#0b1a2e',
      sky2: '#1e3f63',
      far: '#20405f',
      mid: '#152c44',
      near: '#0e1e30',
      ground: '#08131f',
      neon1: '#7fd7ff',
      neon2: '#cfefff',
      glow: '#a8d8ff',
    },
  };

  return (
    <section className="xv-gc-panel xv-gc-iterate" aria-labelledby="gc-iterate-title" ref={sectionRef}>
      <header className="xv-gc-panel__head">
        <h2 className="xv-gc-panel__title" id="gc-iterate-title">
          <span className="xv-gc-panel__index">5.</span> Iterate through conversation
        </h2>
      </header>

      <div className="xv-gc-iterate__pair">
        <figure className="xv-gc-iterate__shot" data-side="before" data-dim={applied ? 'true' : 'false'}>
          <figcaption className="xv-gc-iterate__tag">Before</figcaption>
          <GamePreview scene={before} playing={false} className="xv-gc-scene--card" />
        </figure>

        <span className="xv-gc-iterate__arrow" aria-hidden="true">
          <HudIcon name="arrow" size={16} />
        </span>

        <figure className="xv-gc-iterate__shot" data-side="after" data-dim={applied ? 'false' : 'true'}>
          <figcaption className="xv-gc-iterate__tag xv-gc-iterate__tag--after">After</figcaption>
          <GamePreview scene={after} playing={false} className="xv-gc-scene--card" />
        </figure>
      </div>

      <form
        className="xv-gc-iterate__form"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(true);
        }}
      >
        <label className="xv-gc-sr" htmlFor="gc-iterate-input">
          Change request for the demonstration
        </label>
        <input
          id="gc-iterate-input"
          ref={inputRef}
          className="xv-gc-iterate__input"
          defaultValue={ITERATION.instruction}
          aria-describedby="gc-iterate-note"
        />
        <button type="submit" className="xv-gc-iterate__send" aria-label="Apply the change in this demonstration">
          <HudIcon name="arrow" size={14} />
        </button>
      </form>

      <p className="xv-gc-note" id="gc-iterate-note">
        Interface demonstration. Applying it here updates this panel only — real iteration happens in the workspace,
        against your repository.
      </p>

      <ul className="xv-gc-iterate__changes" data-applied={applied ? 'true' : 'false'} aria-live="polite">
        {applied
          ? ITERATION.changes.map((change) => (
              <li key={change}>
                <HudIcon name="check" size={12} />
                {change}
              </li>
            ))
          : null}
      </ul>
    </section>
  );
}
