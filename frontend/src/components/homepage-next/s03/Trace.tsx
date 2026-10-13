'use client';

/**
 * The Xroga trace: a small X whose four arms reach the four things that belong together right now — the chosen
 * search peak, the evidence on paper, the explanation and the prepared move. It is measured from the real layout and
 * re-draws once when the selection changes; at rest it is still.
 */
import Image from 'next/image';
import { useEffect, useState, type RefObject } from 'react';
import s from './S03.module.css';

type P = [number, number];
const ARMS = ['island', 'paper', 'card', 'move'] as const;

export function Trace({ stage, trace }: { stage: RefObject<HTMLDivElement | null>; trace: string }) {
  const [geo, setGeo] = useState<{
    n: P;
    d: string[];
    w: number;
    h: number;
  } | null>(null);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const pts = ARMS.map((k) => {
        const t = el.querySelector(`[data-x="${k}"]`) as HTMLElement | null;
        if (!t || !t.getClientRects().length) return null;
        const r = (k === 'island' ? ((t.querySelector('i') as HTMLElement) ?? t) : t).getBoundingClientRect();
        if (k === 'island') return [r.left + r.width / 2 - b.left, r.top + r.height / 2 - b.top] as P;
        if (k === 'paper') return [r.left - b.left, r.top + r.height / 2 - b.top] as P;
        if (k === 'card') return [r.right - b.left, r.top + 30 - b.top] as P;
        return [r.left - b.left, r.top + r.height / 2 - b.top] as P;
      });
      if (pts.some((p) => !p) || b.width < 900) return setGeo(null);
      const [isl, pap, card, move] = pts as P[];
      // the X sits where the evidence meets the explanation: between the peak and the paper, in clear space — never
      // on a label, a pin, the card or the paper
      const rel = (r: DOMRect) => [r.left - b.left - 26, r.top - b.top - 26, r.right - b.left + 26, r.bottom - b.top + 26];
      const blocks = [...el.querySelectorAll('[data-x="card"], [data-x="paper"], [class*="peakLabel"], [class*="pin"], [class*="paperWrap"]')]
        .filter((x) => getComputedStyle(x).visibility !== 'hidden')
        .map((x) => x.getBoundingClientRect())
        .filter((r) => r.width && r.height)
        .map(rel);
      const ideal: P = [(card[0] + pap[0]) / 2, (isl[1] + card[1]) / 2 + 10];
      let n = ideal;
      let best = Infinity;
      for (let dx = -220; dx <= 220; dx += 12)
        for (let dy = -200; dy <= 200; dy += 12) {
          const q: P = [ideal[0] + dx, ideal[1] + dy];
          if (q[0] < card[0] + 30 || q[0] > pap[0] - 30) continue;
          if (blocks.some(([l, t, r, bt]) => q[0] > l && q[0] < r && q[1] > t && q[1] < bt)) continue;
          const cost = dx * dx + dy * dy * 1.4;
          if (cost < best) [best, n] = [cost, q];
        }
      const c = (p: P) => `M${p[0].toFixed(1)} ${p[1].toFixed(1)} Q${p[0].toFixed(1)} ${n[1].toFixed(1)} ${n[0].toFixed(1)} ${n[1].toFixed(1)}`;
      const cx = (p: P) => `M${n[0].toFixed(1)} ${n[1].toFixed(1)} Q${p[0].toFixed(1)} ${n[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      setGeo({
        n,
        d: [c(isl), c(pap), cx(card), cx(move)],
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
    <div className={s.trace} aria-hidden="true">
      <svg key={trace} width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`}>
        {geo.d.map((d, i) => (
          <g key={i} className={s.arm} data-dir={i < 2 ? 'in' : 'out'}>
            <path d={d} className={s.armGlow} />
            <path d={d} className={s.armLine} />
          </g>
        ))}
      </svg>
      <span key={`n-${trace}`} className={s.node} style={{ left: geo.n[0], top: geo.n[1] }}>
        <Image src="/homepage/orb/xroga-orb-icon.webp" alt="" width={20} height={20} />
      </span>
    </div>
  );
}
