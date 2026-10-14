'use client';

/**
 * Step 4, Results: a customer path. Five sources run through three gates (visitors, trials, active teams) and end at
 * the product itself. Strand width is volume; the chosen source is lit and solid, the rest recede. The gates show the
 * chosen source's own numbers, so figures and picture always agree. Every figure is illustrative.
 */
import type { Dispatch } from 'react';
import { RESULTS, SOURCES, STAGES, fmt, pct, sourceOf, totals } from './data';
import { rovingKeys } from './keys';
import type { Action, State } from './state';
import s from './S03.module.css';

const X = [15, 31, 55, 79, 100]; // source rail, three gates, the product's edge (% of the path box)
const H = 100;

/** vertical layout of each source at each column: stacked by volume with gaps, centred */
function column(k: number) {
  const vals = SOURCES.map((x) => x.flow[k]);
  const total = vals.reduce((a, b) => a + b, 0);
  const span = [70, 46, 26][k]; // the path narrows as attention turns into action
  const gap = [3.2, 2.4, 1.6][k];
  const usable = span - gap * (vals.length - 1);
  let y = (H - span) / 2;
  return vals.map((v) => {
    const h = Math.max(0.9, (v / total) * usable);
    const seg = { y, h };
    y += h + gap;
    return seg;
  });
}

export function Results({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const sel = sourceOf(st.source);
  const t = totals();
  const cols = [0, 1, 2].map(column);
  const stall = sel.id === 'paid';
  return (
    <div className={s.results} data-src={sel.id}>
      <div className={s.pathBox}>
        {STAGES.map((n, k) => (
          <span key={n} className={s.gate} style={{ left: `${X[k + 1]}%` }} data-k={k}>
            <span className={s.gateLabel}>{n}</span>
            <b key={sel.id}>{fmt(sel.flow[k])}</b>
            <em>of {fmt(t[k])}</em>
          </span>
        ))}
        <div className={s.pathArea}>
          <svg className={s.paths} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {SOURCES.map((x, i) => {
              const seg = cols.map((c) => c[i]);
              // the product end: every strand converges on the product's edge
              const end = { y: 3 + i * 3.4, h: Math.max(0.8, seg[2].h * 0.5) };
              const pts = [seg[0], ...seg, end];
              let d = '';
              for (let k = 0; k < 4; k++) {
                const a = pts[k];
                const b = pts[k + 1];
                const x1 = X[k];
                const x2 = X[k + 1];
                const m = (x1 + x2) / 2;
                d += `M${x1} ${a.y} C${m} ${a.y} ${m} ${b.y} ${x2} ${b.y} L${x2} ${b.y + b.h} C${m} ${b.y + b.h} ${m} ${a.y + a.h} ${x1} ${a.y + a.h} Z `;
              }
              return (
                <path
                  key={x.id}
                  d={d}
                  className={s.strand}
                  data-src={x.id}
                  data-on={x.id === sel.id || undefined}
                  onClick={() => dispatch({ type: 'source', id: x.id })}
                />
              );
            })}
          </svg>
          {stall && (
            <span
              className={s.stallMark}
              style={{ left: `${(X[2] + X[3]) / 2}%`, top: `${(cols[1][SOURCES.indexOf(sel)].y + cols[2][SOURCES.indexOf(sel)].y) / 2 + 1}%` }}
              aria-hidden="true"
            />
          )}

          <div className={s.sources} role="radiogroup" aria-label="Source" onKeyDown={rovingKeys}>
            {SOURCES.map((x, i) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === sel.id}
                tabIndex={x.id === sel.id ? 0 : -1}
                data-src={x.id}
                className={s.srcBtn}
                style={{ top: `${cols[0][i].y + cols[0][i].h / 2}%` }}
                onClick={() => dispatch({ type: 'source', id: x.id })}
              >
                <i aria-hidden="true">{x.mark}</i>
                {x.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside key={sel.id} className={s.insight} aria-live="polite">
        <b className={s.insightTitle}>
          {sel.name}: {pct(sel.flow[2], sel.flow[1])} of trials become active teams.
        </b>
        <span className={s.insightNote}>{sel.note}</span>
        {stall ? (
          <span className={s.stall}>
            <b>{RESULTS.bottleneck}</b>
            <span>
              <small>Next move</small> {RESULTS.move}
            </span>
          </span>
        ) : (
          <button type="button" className={s.linkBtn} onClick={() => dispatch({ type: 'source', id: 'paid' })}>
            Inspect the drop-off
          </button>
        )}
        <button
          type="button"
          className={s.linkBtn}
          data-quiet=""
          aria-expanded={st.detail === 'method'}
          onClick={() => dispatch({ type: 'detail', detail: st.detail === 'method' ? null : 'method' })}
        >
          How this is counted
        </button>
        {st.detail === 'method' && (
          <span className={s.evidence} role="note">
            {RESULTS.method}
          </span>
        )}
      </aside>
    </div>
  );
}
