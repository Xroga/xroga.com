'use client';

/**
 * The signal trace: one thin blue line from the chosen peak to your own row on the result sheet, ending in a small
 * cyan node. No brand mark is drawn inside the data. Measured from the real layout; re-drawn once per selection;
 * desktop only, never interactive.
 */
import { useEffect, useState, type RefObject } from 'react';
import s from './S03.module.css';

export function Trace({ stage, trace }: { stage: RefObject<HTMLDivElement | null>; trace: string }) {
  const [geo, setGeo] = useState<{ d: string; end: [number, number]; w: number; h: number } | null>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const pin = el.querySelector('[data-anchor="peak"] i');
      const row = el.querySelector('[data-anchor="paper"]');
      if (!pin || !row || b.width < 1000) return setGeo(null);
      const p = pin.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      if (!r.width) return setGeo(null);
      const a: [number, number] = [p.left + p.width / 2 - b.left, p.top + p.height / 2 - b.top];
      const z: [number, number] = [r.left - b.left - 6, r.top + r.height / 2 - b.top];
      const mx = (a[0] + z[0]) / 2;
      setGeo({
        d: `M${a[0].toFixed(1)} ${a[1].toFixed(1)} C${mx.toFixed(1)} ${a[1].toFixed(1)} ${mx.toFixed(1)} ${z[1].toFixed(1)} ${z[0].toFixed(1)} ${z[1].toFixed(1)}`,
        end: z,
        w: b.width,
        h: b.height,
      });
    };
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [stage, trace]);

  if (!geo) return null;
  return (
    <svg key={trace} className={s.trace} width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true">
      <path d={geo.d} className={s.traceGlow} />
      <path d={geo.d} className={s.traceLine} />
      <circle cx={geo.end[0]} cy={geo.end[1]} r="4" className={s.traceNode} />
    </svg>
  );
}
