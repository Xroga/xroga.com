'use client';

import { useEffect, useRef } from 'react';

const PRIMARY_COPY =
  'Tell Xroga what you want to make. It turns the brief into working code, shows you the checks, and ships through your connected accounts when you authorize it.';

const OWNERSHIP_COPY = 'Your repository. Your credentials. Your product.';

const WORDS = PRIMARY_COPY.split(' ');

/**
 * A reversible scroll reveal. Words become crisp as the statement moves through the
 * viewport and soften again when the user scrolls back above it. Updating classes on
 * the existing spans avoids a React render on every scroll frame.
 */
export function AiAppBuilderScrollStatement() {
  const sectionRef = useRef<HTMLElement>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = section.getBoundingClientRect();
        const viewport = window.innerHeight;
        const start = viewport * 0.9;
        const end = viewport * 0.28;
        const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
        const clearThrough = Math.round(progress * WORDS.length);

        wordRefs.current.forEach((word, index) => {
          word?.classList.toggle('is-clear', index < clearThrough);
        });
        section.style.setProperty('--xab-copy-progress', progress.toFixed(3));
      });
    };

    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  return (
    <section ref={sectionRef} className="xab-manifesto" aria-labelledby="xab-manifesto-heading">
      <div className="xab-shell xab-manifesto__inner">
        <p className="xab-manifesto__index" aria-hidden="true">01 / BUILD WITH CONTROL</p>
        <h2 id="xab-manifesto-heading" className="xab-manifesto__statement">
          {WORDS.map((word, index) => (
            <span
              key={`${word}-${index}`}
              ref={(node) => { wordRefs.current[index] = node; }}
              className="xab-manifesto__word"
            >
              {word}{' '}
            </span>
          ))}
        </h2>
        <p className="xab-manifesto__ownership">{OWNERSHIP_COPY}</p>
      </div>
    </section>
  );
}
