'use client';

/**
 * World C, Outcomes: where customers actually come from. Three totals, then a source-to-customer ribbon that sets each
 * source's share of visitors against its share of purchases, so a channel that brings traffic but few buyers is
 * visible at a glance. Attribution is simplified and labelled; the forecast is labelled as one.
 */
import type { Dispatch } from 'react';
import { OUTCOMES, SOURCES, STAGES, fmt, pct, shares, sourceOf, totalFunnel } from './data';
import { rovingKeys } from './keys';
import type { Action, State } from './state';
import s from './S03.module.css';

const GAP = 1.6; // % of height between stacked segments

/** Stacked segments (top, height in %) for one column of shares. */
function stack(values: number[]) {
  const usable = 100 - GAP * (values.length - 1);
  let y = 0;
  return values.map((v) => {
    const seg = { top: y, h: v * usable };
    y += seg.h + GAP;
    return seg;
  });
}

/** Label centres (%) kept at least `min` apart so small bands never collide. */
function spread(centres: number[], min: number) {
  const out = [...centres];
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + min);
  const over = out[out.length - 1] - (100 - min / 2);
  if (over > 0) for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i === out.length - 1 ? 100 - min / 2 : out[i + 1] - min);
  return out;
}

export function Outcomes({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const t = totalFunnel();
  const sel = sourceOf(st.source);
  const sh = SOURCES.map(shares);
  const left = stack(sh.map((x) => x.visitors));
  const right = stack(sh.map((x) => x.purchases));
  const mine = shares(sel);
  const leftAt = spread(
    left.map((x) => x.top + x.h / 2),
    12,
  );
  const rightAt = spread(
    right.map((x) => x.top + x.h / 2),
    9,
  );
  const lost = Math.round((1 - t[3] / t[2]) * 100);
  return (
    <div className={s.outcomes}>
      <ol className={s.totals} aria-label={`Totals, ${OUTCOMES.window}`}>
        {[0, 2, 3].map((i, k) => (
          <li key={i}>
            {k > 0 && (
              <span className={s.rate} aria-label={`${pct(t[i], t[k === 1 ? 0 : 2])} continue`}>
                {pct(t[i], t[k === 1 ? 0 : 2])}
              </span>
            )}
            <small>{STAGES[i]}</small>
            <b>{fmt(t[i])}</b>
            <em>
              {sel.name} {fmt(sel.funnel[i])}
            </em>
          </li>
        ))}
      </ol>

      <div className={s.flow}>
        <div className={s.flowHead} aria-hidden="true">
          <span>Share of visitors</span>
          <span>Share of purchases</span>
        </div>
        <div className={s.ribbon}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {SOURCES.map((x, i) => {
              const a = left[i];
              const b = right[i];
              const d = `M4 ${a.top} C50 ${a.top} 50 ${b.top} 96 ${b.top} L96 ${b.top + b.h} C50 ${b.top + b.h} 50 ${a.top + a.h} 4 ${a.top + a.h} Z`;
              return (
                <g key={x.id} data-src={x.id} data-on={x.id === sel.id || undefined} className={s.band} onClick={() => dispatch({ type: 'source', id: x.id })}>
                  <path d={d} className={s.bandFlow} />
                  <rect x="0" y={a.top} width="4" height={a.h} className={s.bandBar} />
                  <rect x="96" y={b.top} width="4" height={b.h} className={s.bandBar} />
                </g>
              );
            })}
          </svg>
          <div className={s.flowLabels} role="radiogroup" aria-label="Source" onKeyDown={rovingKeys}>
            {SOURCES.map((x, i) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === sel.id}
                tabIndex={x.id === sel.id ? 0 : -1}
                className={s.flowLabel}
                data-src={x.id}
                style={{ top: `${leftAt[i]}%` }}
                onClick={() => dispatch({ type: 'source', id: x.id })}
              >
                <i aria-hidden="true" />
                <span className={s.long}>{x.name}</span>
                <span className={s.short} aria-hidden="true">
                  {x.short}
                </span>
                <b>{pct(sh[i].visitors, 1, 0)}</b>
              </button>
            ))}
          </div>
          <div className={s.flowRight} aria-hidden="true">
            {SOURCES.map((x, i) => (
              <span key={x.id} data-on={x.id === sel.id || undefined} style={{ top: `${rightAt[i]}%` }}>
                {pct(sh[i].purchases, 1, 0)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <aside className={s.verdict} aria-live="polite">
        <span className={s.kicker} data-tone="measure">
          <i aria-hidden="true" />
          {sel.name}
        </span>
        <p className={s.insightTitle}>
          {pct(mine.visitors, 1, 0)} of visitors, {pct(mine.purchases, 1, 0)} of purchases.
        </p>
        <dl className={s.figures}>
          <div>
            <dt>Visitors</dt>
            <dd>{fmt(sel.funnel[0])}</dd>
          </div>
          <div>
            <dt>Purchases</dt>
            <dd>{fmt(sel.funnel[3])}</dd>
          </div>
          <div>
            <dt>Buy rate</dt>
            <dd>{pct(sel.funnel[3], sel.funnel[0])}</dd>
          </div>
        </dl>
        <div className={s.friction}>
          <b>{lost}% of checkouts don’t finish</b>
          <span>{OUTCOMES.friction}</span>
          <span className={s.moveTag}>
            <small>Next move</small> {OUTCOMES.move}
          </span>
        </div>
        <button
          type="button"
          className={s.quietBtn}
          aria-expanded={st.layer === 'method'}
          aria-controls="s03-method"
          onClick={() => dispatch({ type: 'layer', layer: st.layer === 'method' ? null : 'method' })}
        >
          How measured
        </button>
        {st.layer === 'method' && (
          <div id="s03-method" className={s.method} role="note">
            <p>{OUTCOMES.method}</p>
            <p>{OUTCOMES.forecast}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
