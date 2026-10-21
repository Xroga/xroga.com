'use client';

/**
 * S03 and S04: product-led environments.
 *
 * The sections' own interfaces are the visual story, so the environment does one job: it gives the existing product shell a
 * supporting surface. A single very dark graphite field is derived from the live geometry of the product (everything after
 * the heading), a few pixels larger than it and carrying the shell's own corner radius, so it reads as a finish step of the
 * interface rather than a new object: near-black ground → graphite support field → the UI's own card surfaces. Local edge
 * definition and contact shading separate the shell from the page; the field dissolves into the ground below the product so
 * the next section begins on the shared homepage ground.
 *
 * Motion is only ever a response to something that really happens:
 *  - S03: a short, neutral emphasis of the field's top edge when the mode changes (Search & Visibility ↔ Launch & Marketing);
 *  - S04: a one-time stage entrance when the section first comes into view, and a short neutral edge emphasis when the
 *    publishing state changes (App Store ↔ Google Play ↔ Chrome Web Store).
 * There is no continuous animation. Decorative only: pointer-events none, aria-hidden, behind the content, still under
 * reduced motion.
 */
import { useEffect, useRef, useState } from 'react';
import s from './StudioScene.module.css';

export function StudioScene({ kind }: { kind: 's03' | 's04' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const root = ref.current;
    const sec = root?.parentElement;
    if (!root || !sec) return;
    const measure = () => {
      const base = sec.getBoundingClientRect();
      const inner = sec.querySelector<HTMLElement>(':scope > div:not([aria-hidden="true"])');
      if (!inner) return;
      // the product is everything after the heading; its bottom is the last visible child, not the section padding
      const body = Array.from(inner.children).filter((c) => c.tagName !== 'HEADER').map((c) => c.getBoundingClientRect()).filter((r) => r.height > 40);
      if (!body.length) return;
      const left = Math.min(...body.map((r) => r.left)) - base.left;
      const right = Math.max(...body.map((r) => r.right)) - base.left;
      const top = Math.min(...body.map((r) => r.top)) - base.top;
      const bottom = Math.max(...body.map((r) => r.bottom)) - base.top;
      const set = (k: string, v: number) => root.style.setProperty(k, `${Math.round(v)}px`);
      set('--cl', left);
      set('--ct', top);
      set('--cw', right - left);
      set('--ch', bottom - top);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    const inner = sec.querySelector(':scope > div:not([aria-hidden="true"])');
    if (inner) ro.observe(inner);
    // S03: the mode. S04: the selected publishing state. Each change gives the surface one short emphasis.
    let last = kind === 's03' ? (sec.dataset.view ?? '') : '';
    const mo = new MutationObserver((records) => {
      measure();
      if (kind === 's03') {
        const now = sec.dataset.view ?? '';
        if (now !== last) {
          last = now;
          setPulse((n) => n + 1);
        }
      } else if (records.some((r) => r.attributeName === 'aria-selected' && (r.target as HTMLElement).getAttribute('aria-selected') === 'true')) {
        setPulse((n) => n + 1);
      }
    });
    if (kind === 's03') mo.observe(sec, { attributes: true, attributeFilter: ['data-view'] });
    else mo.observe(sec, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '0px 0px -12% 0px' });
    io.observe(root);
    const settle = window.setTimeout(measure, 900); // the entrance choreography settles after first paint
    return () => {
      window.clearTimeout(settle);
      ro.disconnect();
      mo.disconnect();
      io.disconnect();
    };
  }, [kind]);

  return (
    <div ref={ref} className={`${s.scene} ${kind === 's03' ? s.s03 : s.s04}`} data-kind={kind} data-seen={seen || undefined} aria-hidden="true">
      <div className={s.field}>
        <i key={pulse} className={s.emphasis} data-pulse={pulse > 0 || undefined} />
      </div>
      <div className={s.contact} />
      <div className={s.closure} />
    </div>
  );
}
