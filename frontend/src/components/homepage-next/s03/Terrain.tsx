'use client';

/**
 * The Search Terrain: the sample market drawn as data. Each ridge is a layer of related searches; a peak's height is
 * its monthly search demand and its position along the ridge is its intent (informational → transactional). The
 * four labelled peaks are real controls: choosing one selects that opportunity everywhere in the section.
 */
import type { CSSProperties } from 'react';
import { QUERIES, TEXTURE, audienceOf, kfmt, type View } from './data';
import { rovingKeys } from './keys';
import s from './S03.module.css';

const W = 1000;
const H = 600;
const BASE = [290, 360, 424, 484, 544];
const MAXV = 14800;
const peakH = (v: number) => 44 + (v / MAXV) * 168;

function ridgeY(r: number, x: number) {
  let y = BASE[r] + Math.sin(x / 61 + r * 1.7) * 4 + Math.sin(x / 23 + r) * 1.5;
  for (const q of QUERIES) if (q.ridge === r) y -= peakH(q.volume) * Math.exp(-(((x - q.x * W) / 74) ** 2));
  for (const t of TEXTURE) if (t.ridge === r) y -= t.v * 120 * Math.exp(-(((x - t.x * W) / 58) ** 2));
  return y;
}
const ridgePath = (r: number) => {
  let d = '';
  for (let x = 0; x <= W; x += 8) d += `${x ? 'L' : 'M'}${x} ${ridgeY(r, x).toFixed(1)}`;
  return d;
};
const RIDGES = BASE.map((_, r) => ridgePath(r));
/** Peaks in reading order, so arrow keys move left to right across the terrain. */
const BY_X = [...QUERIES].sort((a, b) => a.x - b.x);

export const peakOf = (id: string) => {
  const q = QUERIES.find((x) => x.id === id)!;
  return { x: (q.x * W) / 10, y: (ridgeY(q.ridge, q.x * W) / H) * 100 };
};

export function Terrain({ view, query, audience, onSelect }: { view: View; query: string; audience: string; onSelect: (id: string) => void }) {
  const sel = QUERIES.find((q) => q.id === query)!;
  const aud = audienceOf(audience);
  const lit = (r: number) => {
    if (view === 'market') return r === sel.ridge;
    if (view === 'plan') return QUERIES.some((q) => q.ridge === r && aud.searches.includes(q.query));
    return false;
  };
  return (
    <div className={s.terrain} data-view={view}>
      <svg className={s.ridges} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {BASE.map((_, r) => (
            <linearGradient key={r} id={`s03-fill-${r}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={`rgba(${18 + r * 3}, ${44 + r * 4}, ${54 + r * 3}, ${0.62 + r * 0.07})`} />
              <stop offset="0.55" stopColor="rgba(9, 18, 24, 0.94)" />
              <stop offset="1" stopColor="rgba(8, 12, 16, 1)" />
            </linearGradient>
          ))}
          <linearGradient id="s03-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(108,224,177,0)" />
            <stop offset="0.5" stopColor="rgba(108,224,177,0.22)" />
            <stop offset="1" stopColor="rgba(108,224,177,0)" />
          </linearGradient>
        </defs>
        {/* fine contour lines above the ridges: demand intensity */}
        <g className={s.contours}>
          {[0, 1, 2].map((k) => (
            <path key={k} d={ridgePath(0).replace(/(\d+\.?\d*) (\d+\.?\d*)/g, (_, x, y) => `${x} ${(+y - 26 - k * 22).toFixed(1)}`)} />
          ))}
        </g>
        {BASE.map((_, r) => (
          <g key={r} className={s.ridge} data-lit={lit(r) || undefined} data-tint={view === 'plan' ? 'warm' : undefined} style={{ '--r': r } as CSSProperties}>
            <path d={`${RIDGES[r]} L${W} ${H} L0 ${H} Z`} fill={`url(#s03-fill-${r})`} />
            <path d={RIDGES[r]} className={s.ridgeLine} />
          </g>
        ))}
        <rect className={s.sweep} x="-300" y="0" width="300" height={H} fill="url(#s03-sweep)" />
      </svg>

      <div className={s.axis} aria-hidden="true">
        <span>Informational</span>
        <span>Commercial</span>
        <span>Transactional</span>
      </div>

      <div className={s.peaks} role="radiogroup" aria-label="Search opportunities in this market" onKeyDown={rovingKeys}>
        {BY_X.map((q) => {
          const p = peakOf(q.id);
          const on = q.id === query;
          return (
            <button
              key={q.id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={s.peak}
              data-tone={q.tone}
              data-side={q.x > 0.72 ? 'left' : 'right'}
              data-x={on ? 'island' : undefined}
              style={
                {
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  '--px': p.x,
                  '--py': p.y,
                } as CSSProperties
              }
              onClick={() => onSelect(q.id)}
            >
              <i className={s.pin} aria-hidden="true" />
              <span className={s.peakLabel}>
                <b>{q.query}</b>
                <small>
                  {kfmt(q.volume)}/mo · {q.intent}
                </small>
                <em data-tone={q.tone}>{q.yours && q.yours <= 10 ? `You rank #${q.yours}` : q.yours ? `You: #${q.yours}` : 'Not ranking'}</em>
              </span>
            </button>
          );
        })}
      </div>

      <div className={s.legend}>
        <span>Peak height = monthly searches</span>
        <span>
          <i data-k="strong" /> you rank in the top 10
        </span>
        <span>
          <i data-k="gap" /> opening
        </span>
      </div>
    </div>
  );
}
