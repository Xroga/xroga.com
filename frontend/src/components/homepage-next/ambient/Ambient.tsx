'use client';

/**
 * Section environments (Homepage Atmosphere V3, "Obsidian product atmosphere").
 *
 * No drawn motifs: each environment is built only from light on dark material. A static composition of tonal
 * surfaces (`base`) gives the section its depth and leads the eye to the product; one soft reflection (`sheen`) moves
 * slowly across the graphite like light crossing a machined surface; a fine static grain (`grain`) gives the black a
 * satin material instead of flat paint. Every section composes these differently (see Ambient.module.css).
 *
 * Only transform and opacity animate. The reflection runs only while the section is on screen, and under reduced
 * motion the composition simply rests, which is a finished state on its own.
 */
import { useEffect, useRef, useState } from 'react';
import a from './Ambient.module.css';

export type AmbientKind = 's02' | 's03' | 's04' | 'horizon';

export function Ambient({ kind }: { kind: AmbientKind }) {
  const ref = useRef<HTMLDivElement>(null);
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setAwake(e.isIntersecting), { rootMargin: '120px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={a.layer} data-kind={kind} data-awake={awake || undefined} aria-hidden="true">
      <div className={a.base} />
      <div className={a.sheen} />
      <div className={a.grain} />
    </div>
  );
}
