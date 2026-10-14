'use client';

/**
 * Trace conversions: each channel runs through visits, trials and subscribers to the product. Strand width is volume;
 * the chosen channel is lit and solid, the rest recede, and the three figures always belong to the chosen channel.
 * The method and the proposed next test open on request; a recurring review is shown as planned, not running.
 */
import type { Dispatch } from 'react';
import { CHANNELS, PATH_INSIGHT, PATH_STAGES, channelOf, fmt, pct, totals } from '../data';
import { rovingKeys } from '../keys';
import type { Action, State } from '../state';
import { Bag } from './Art';
import s from '../S03.module.css';

const X = [22, 42, 64, 86]; // channel rail, then the three stages (% of the path box)

function column(k: number) {
  const vals = CHANNELS.map((c) => c.flow[k]);
  const total = vals.reduce((a, b) => a + b, 0);
  const span = [76, 50, 28][k];
  const gap = [3.4, 2.6, 1.8][k];
  const usable = span - gap * (vals.length - 1);
  let y = (100 - span) / 2;
  return vals.map((v) => {
    const h = Math.max(1, (v / total) * usable);
    const seg = { y, h };
    y += h + gap;
    return seg;
  });
}

export function PathsStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const sel = channelOf(st.channel);
  const t = totals();
  const cols = [0, 1, 2].map(column);
  return (
    <div className={s.paths} data-channel={sel.id}>
      <div className={s.pathBox}>
        {PATH_STAGES.map((n, k) => (
          <span key={n} className={s.gate} style={{ left: `${X[k + 1]}%` }}>
            <span className={s.gateLabel}>{n}</span>
            <b key={sel.id}>{fmt(sel.flow[k])}</b>
            <em>of {fmt(t[k])}</em>
          </span>
        ))}
        <div className={s.pathArea}>
          <svg className={s.strands} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {CHANNELS.map((c, i) => {
              const seg = cols.map((col) => col[i]);
              const end = { y: 46 + i * 2.4, h: Math.max(1, seg[2].h * 0.6) };
              const pts = [seg[0], ...seg, end];
              const xs = [...X, 100];
              let d = '';
              for (let k = 0; k < 4; k++) {
                const a = pts[k];
                const b = pts[k + 1];
                const m = (xs[k] + xs[k + 1]) / 2;
                d += `M${xs[k]} ${a.y} C${m} ${a.y} ${m} ${b.y} ${xs[k + 1]} ${b.y} L${xs[k + 1]} ${b.y + b.h} C${m} ${b.y + b.h} ${m} ${a.y + a.h} ${xs[k]} ${a.y + a.h} Z `;
              }
              return (
                <path
                  key={c.id}
                  d={d}
                  className={s.strand}
                  data-ch={c.id}
                  data-on={c.id === sel.id || undefined}
                  onClick={() => dispatch({ type: 'set', patch: { channel: c.id } })}
                />
              );
            })}
          </svg>
          <div className={s.chRail} role="radiogroup" aria-label="Channel" onKeyDown={rovingKeys}>
            {CHANNELS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === sel.id}
                tabIndex={c.id === sel.id ? 0 : -1}
                className={s.chBtn}
                data-ch={c.id}
                style={{ top: `${cols[0][i].y + cols[0][i].h / 2}%` }}
                onClick={() => dispatch({ type: 'set', patch: { channel: c.id } })}
              >
                <i aria-hidden="true">{c.mark}</i>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <span className={s.pathEnd} aria-hidden="true">
        <Bag className={s.pathBag} />
        <small>Ember Monthly</small>
      </span>
    </div>
  );
}

export function PathsControls({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const c = channelOf(st.channel);
  const social = c.id === 'social';
  return (
    <>
      <span className={s.ctlLabel}>{c.name}</span>
      <b className={s.insTitle} aria-live="polite">
        {pct(c.flow[2], c.flow[1])} of trials become subscribers.
      </b>
      <span className={s.insNote}>{c.note}</span>
      {social ? (
        <span className={s.stall}>
          <b>{PATH_INSIGHT.bottleneck}</b>
          <span>
            <small>Proposed test</small> {PATH_INSIGHT.move}
          </span>
        </span>
      ) : (
        <button type="button" className={s.actBtn} onClick={() => dispatch({ type: 'set', patch: { channel: 'social' } })}>
          Find the drop-off
        </button>
      )}
      <button
        type="button"
        className={s.linkBtn}
        aria-expanded={st.detail === 'method'}
        onClick={() => dispatch({ type: 'set', patch: { detail: st.detail === 'method' ? null : 'method' } })}
      >
        Why did this change?
      </button>
      {st.detail === 'method' && (
        <span className={s.method} role="note">
          {PATH_INSIGHT.method}
        </span>
      )}
      <span className={s.stateLine} data-planned="">
        <i aria-hidden="true" />
        Weekly review · planned workflow
      </span>
    </>
  );
}
