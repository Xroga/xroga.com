'use client';

/**
 * S02 · the studio around the computer.
 *
 * Not a pattern and not a shader: a lit room. The browser/AI Employee computer stands on a graphite floor in front of a
 * large curved titanium backdrop (a cyclorama). The backdrop is nearly all darkness; it becomes visible only where one
 * broad, soft studio light grazes it, and then its brushed grain shows. That single reflection travels slowly across
 * the wall, the curved cove and the floor and gives way again, like a softbox being moved, while the computer's rim
 * light and its reflection in the floor answer it.
 *
 * Everything is measured from the real layout (the computer's rectangle), so the room is built around the product at
 * every width. The heading zone stays clean. Only transform and opacity animate (compositor work); the loop pauses
 * offscreen, and under reduced motion the light rests at a composed position.
 */
import { useEffect, useRef, useState } from 'react';
import s from './S02Scene.module.css';

export function S02Scene() {
  const ref = useRef<HTMLDivElement>(null);
  const [awake, setAwake] = useState(false);
  const [mode, setMode] = useState<'browser' | 'workforce'>('browser');

  useEffect(() => {
    const root = ref.current;
    const sec = root?.parentElement;
    if (!root || !sec) return;
    const measure = () => {
      const base = sec.getBoundingClientRect();
      const stage = sec.querySelector<HTMLElement>('#s02-stage');
      // the computer is the stage's tall child; the selector row above it is not part of the set
      const kids = stage ? Array.from(stage.children) : [];
      const rects = kids.map((k) => k.getBoundingClientRect()).filter((r) => r.height > 120);
      const r = rects[0] ?? stage?.getBoundingClientRect();
      if (!r) return;
      root.style.setProperty('--cl', `${Math.round(r.left - base.left)}px`);
      root.style.setProperty('--ct', `${Math.round(r.top - base.top)}px`);
      root.style.setProperty('--cw', `${Math.round(r.width)}px`);
      root.style.setProperty('--ch', `${Math.round(r.height)}px`);
      root.style.setProperty('--sh', `${Math.round(base.height)}px`);
    };
    const syncMode = () => setMode(sec.dataset.mode === 'workforce' ? 'workforce' : 'browser');
    measure();
    syncMode();
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    const stage = sec.querySelector('#s02-stage');
    if (stage) ro.observe(stage);
    const mo = new MutationObserver(() => {
      syncMode();
      measure();
    });
    mo.observe(sec, { attributes: true, attributeFilter: ['data-mode'] });
    const io = new IntersectionObserver(([e]) => setAwake(e.isIntersecting), { rootMargin: '120px 0px' });
    io.observe(root);
    const settle = window.setTimeout(measure, 900); // the entrance choreography settles after first paint
    return () => {
      window.clearTimeout(settle);
      ro.disconnect();
      mo.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={s.scene} data-kind="s02" data-mode={mode} data-awake={awake || undefined} aria-hidden="true">
      <div className={s.wall} />
      <div className={s.cove} />
      <div className={s.floor} />
      <div className={s.key} />
      <div className={s.light} />
      <div className={s.streak} />
      <div className={s.backlight} />
      <div className={s.rim} />
      <div className={s.contact} />
      <div className={s.reflection} />
      <div className={s.vignette} />
    </div>
  );
}
