'use client';

/**
 * The Search Terrain: the sample market drawn as data. Each ridge is a layer of related searches; a peak's height is
 * its monthly search demand and its position runs from informational to transactional intent. In Search demand the
 * four labelled peaks are the controls; in the other worlds the same landscape stays behind the work, lowered and
 * re-lit, so the three worlds read as one place.
 */
import type { CSSProperties } from 'react';
import { QUERIES, TEXTURE, audienceOf, kfmt, queryOf, type World } from './data';
import { rovingKeys } from './keys';
import s from './S03.module.css';

const W = 1000;
const H = 600;
const BASE = [290, 360, 424, 484, 544];
const MAXV = 14800;
const peakH = (v: number) => 44 + (v / MAXV) * 168;
/** The peaks occupy the left 64% of the stage; the drawing carries on under the work to the right edge. */
const SPAN = 0.64;
const VW = Math.round(W / SPAN);

function ridgeY(r: number, x: number) {
  let y = BASE[r] + Math.sin(x / 61 + r * 1.7) * 4 + Math.sin(x / 23 + r) * 1.5;
  for (const q of QUERIES) if (q.ridge === r) y -= peakH(q.volume) * Math.exp(-(((x - q.x * W) / 74) ** 2));
  for (const t of TEXTURE) if (t.ridge === r) y -= t.v * 120 * Math.exp(-(((x - t.x * W) / 58) ** 2));
  return y;
}
const ridgePath = (r: number) => {
  let d = '';
  for (let x = 0; x <= VW; x += 8) d += `${x ? 'L' : 'M'}${x} ${ridgeY(r, x).toFixed(1)}`;
  return d;
};
const RIDGES = BASE.map((_, r) => ridgePath(r));
const CONTOURS = [0, 1, 2].map((k) => ridgePath(0).replace(/(\d+\.?\d*) (\d+\.?\d*)/g, (_, x, y) => `${x} ${(+y - 26 - k * 22).toFixed(1)}`));
/** Peaks in reading order, so arrow keys move left to right across the terrain. */
const BY_X = [...QUERIES].sort((a, b) => a.x - b.x);

export const peakOf = (id: string) => {
  const q = QUERIES.find((x) => x.id === id)!;
  return { x: (q.x * W) / 10, y: (ridgeY(q.ridge, q.x * W) / H) * 100 };
};

export function Terrain({ world, query, audience, onSelect }: { world: World; query: string; audience: string; onSelect: (id: string) => void }) {
  const lit = world === 'discover' ? queryOf(query).ridge : world === 'campaigns' ? queryOf(audienceOf(audience).from).ridge : -1;
  const live = world === 'discover';
  return (
    <div className={s.terrain} data-world={world}>
      <svg className={s.ridges} viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {BASE.map((_, r) => (
            <linearGradient key={r} id={`s03-fill-${r}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={`rgba(${18 + r * 3}, ${44 + r * 4}, ${54 + r * 3}, ${0.62 + r * 0.07})`} />
              <stop offset="0.55" stopColor="rgba(9, 18, 24, 0.94)" />
              <stop offset="1" stopColor="rgba(7, 11, 14, 1)" />
            </linearGradient>
          ))}
        </defs>
        <g className={s.contours}>
          {CONTOURS.map((d, k) => (
            <path key={k} d={d} />
          ))}
        </g>
        {BASE.map((_, r) => (
          <g key={r} className={s.ridge} data-lit={r === lit || undefined} style={{ '--r': r } as CSSProperties}>
            <path d={`${RIDGES[r]} L${VW} ${H} L0 ${H} Z`} fill={`url(#s03-fill-${r})`} />
            <path d={RIDGES[r]} className={s.ridgeLine} />
          </g>
        ))}
      </svg>

      <div className={s.peaks} role="radiogroup" aria-label="Search opportunities" aria-hidden={!live || undefined} onKeyDown={rovingKeys}>
        {BY_X.map((q) => {
          const p = peakOf(q.id);
          const on = q.id === query;
          return (
            <button
              key={q.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on && live ? 0 : -1}
              className={s.peak}
              data-tone={q.tone}
              data-side={q.x > 0.72 ? 'left' : 'right'}
              data-anchor={on ? 'peak' : undefined}
              style={{ left: `${p.x}%`, top: `${p.y}%`, '--px': p.x, '--py': p.y } as CSSProperties}
              onClick={() => onSelect(q.id)}
            >
              <i className={s.pin} aria-hidden="true" />
              <span className={s.peakLabel}>
                <b>{q.query}</b>
                <small>
                  {kfmt(q.volume)}/mo · {q.intent}
                </small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
