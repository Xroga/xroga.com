'use client';

import { useEffect, useRef } from 'react';

const LEAD_LINES = [
  ['Tell', 'Xroga'],
  ['what', 'you', 'want', 'to'],
  ['make.'],
] as const;

const DETAIL_WORDS =
  'It turns the brief into working code, shows you the checks, and ships through your connected accounts when you authorize it.'.split(' ');

const OWNERSHIP_WORDS = 'Your repository. Your credentials. Your product.'.split(' ');
const WORD_COUNT = LEAD_LINES.flat().length + DETAIL_WORDS.length + OWNERSHIP_WORDS.length;

/**
 * The homepage promise reveals in reading order and reverses when the visitor scrolls
 * back. Mutating classes on the existing words keeps scroll work outside React renders.
 */
export function HomepageScrollStatement() {
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
        const start = viewport * 0.92;
        const end = viewport * 0.18;
        const progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
        const clearThrough = Math.round(progress * WORD_COUNT);

        wordRefs.current.forEach((word, index) => {
          word?.classList.toggle('is-clear', index < clearThrough);
        });
        section.style.setProperty('--xv-home-copy-progress', progress.toFixed(3));
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

  let offset = 0;
  const words = (items: readonly string[], emphasis = false) => {
    const start = offset;
    offset += items.length;
    return items.map((word, index) => {
      const wordIndex = start + index;
      return (
        <span
          key={`${word}-${wordIndex}`}
          ref={(node) => { wordRefs.current[wordIndex] = node; }}
          className="xv-home-editorial__word"
          data-emphasis={emphasis || undefined}
        >
          {word}{' '}
        </span>
      );
    });
  };

  return (
    <section ref={sectionRef} className="xv-home-editorial" aria-labelledby="xv-home-editorial-heading">
      <div className="xv-home-editorial__inner">
        <p className="xv-home-editorial__eyebrow">A brief becomes a build</p>
        <h2 id="xv-home-editorial-heading" className="xv-home-editorial__lead">
          <span>{words(LEAD_LINES[0])}</span>
          <span>{words(LEAD_LINES[1])}</span>
          <em>{words(LEAD_LINES[2], true)}</em>
        </h2>
        <p className="xv-home-editorial__detail">{words(DETAIL_WORDS)}</p>
        <p className="xv-home-editorial__ownership">{words(OWNERSHIP_WORDS, true)}</p>
      </div>
    </section>
  );
}
