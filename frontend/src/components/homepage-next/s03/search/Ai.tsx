'use client';

/**
 * Appear in AI answers: product discovery. A buyer asks which whey protein to buy; an illustrative AI answer appears with
 * the sources it cites, and a brand it only mentions. PeakForm's product page sits below, not connected to the answer:
 * its page leaves out the facts the cited pages state. "Improve product page" drafts those facts; "Recheck" plans a
 * re-check of the same questions. Nothing here claims a recommendation, a citation or a ranking.
 *
 * Citation lines run only in the gutter between the answer and its sources, so they never cross text. Their ends are
 * measured once per layout change (ResizeObserver), never on pointer movement.
 */
import { useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import { AI_COPY, AI_QUESTIONS, PRODUCT_FACTS, SITE, type CiteState } from '../data';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import s from '../S03.module.css';

export const STATE_LABEL: Record<CiteState, string> = {
  cited: 'Cited source',
  mentioned: 'Brand mentioned, not cited',
  absent: 'Not cited in this checked example',
  untested: 'Not checked yet',
};
export const questionOf = (id: string) => AI_QUESTIONS.find((x) => x.id === id) ?? AI_QUESTIONS[0];

type Wire = { d: string; src: number; a: [number, number]; b: [number, number] };

function useWires(box: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  const [wires, setWires] = useState<{ cites: Wire[]; gap: { d: string; x: number; y: number } | null }>({ cites: [], gap: null });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const card = el.querySelector<HTMLElement>('[data-answer]');
      if (!card || getComputedStyle(el).getPropertyValue('--wires').trim() === 'off') return setWires({ cites: [], gap: null });
      const c = card.getBoundingClientRect();
      const cites: Wire[] = [];
      el.querySelectorAll<HTMLElement>('[data-sent]').forEach((sent) => {
        const n = Number(sent.dataset.sent);
        const src = el.querySelector<HTMLElement>(`[data-src="${n}"]`);
        if (!n || !src) return;
        const rects = sent.getClientRects();
        const last = rects[rects.length - 1];
        if (!last) return;
        const r = src.getBoundingClientRect();
        const x1 = r.left - b.left - 2;
        const y1 = r.top + r.height / 2 - b.top;
        const x2 = c.right - b.left + 2;
        const y2 = last.top + last.height / 2 - b.top;
        const m = (x1 + x2) / 2;
        cites.push({ d: `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}`, src: n, a: [x1, y1], b: [x2, y2] });
      });
      // PeakForm's page reaches into the gutter toward the answer and stops short: nothing connects it
      const prod = el.querySelector<HTMLElement>('[data-product]');
      let gap: { d: string; x: number; y: number } | null = null;
      if (prod) {
        const p = prod.getBoundingClientRect();
        const x1 = p.right - b.left + 2;
        const y1 = p.top - b.top + 22;
        const x = c.right - b.left + 14;
        const y = y1 - (y1 - (c.bottom - b.top - 8)) * 0.6;
        gap = { d: `M${x1} ${y1} C${x} ${y1} ${x} ${y1} ${x} ${y}`, x, y };
      }
      setWires({ cites, gap });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll('[data-answer], [data-product], [data-src]').forEach((n) => ro.observe(n));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return wires;
}

export function AiStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = questionOf(st.sample);
  const box = useRef<HTMLDivElement>(null);
  const wires = useWires(box, [q.id, st.aiFix, st.aiCheck, st.aiPick]);
  const pick = st.aiPick;
  const status = st.aiCheck ? 'Ready to publish after review' : st.aiFix ? 'Draft · awaiting approval' : STATE_LABEL[q.you];
  return (
    <div className={s.ai} data-question={q.id} data-fix={st.aiFix || undefined} data-pick={pick ?? undefined}>
      <div className={s.stageBar}>
        <Seg
          label="Buying question"
          value={q.id}
          options={AI_QUESTIONS.map((x) => ({ id: x.id, label: x.label }))}
          onPick={(v) => dispatch({ type: 'set', patch: { sample: v, aiPick: null } })}
          small
        />
      </div>
      <div ref={box} key={q.id} className={s.aiGrid}>
        {/* first in the DOM, so every card paints above the lines */}
        <svg className={s.wires} aria-hidden="true">
          {wires.cites.map((w, i) => (
            <g key={`${q.id}-${i}`} data-lit={pick === w.src || undefined} style={{ animationDelay: `${800 + i * 80}ms` }}>
              <path d={w.d} />
              <circle cx={w.a[0]} cy={w.a[1]} r="2.6" />
              <circle cx={w.b[0]} cy={w.b[1]} r="2.6" />
            </g>
          ))}
          {wires.gap && (
            <g data-gap="" data-fix={st.aiFix || undefined}>
              <path d={wires.gap.d} />
              <circle cx={wires.gap.x} cy={wires.gap.y} r="3.5" />
            </g>
          )}
        </svg>
        <div className={s.answerCard} data-answer="">
          <small className={s.answerLabel}>{AI_COPY.ask}</small>
          <span className={s.ask}>{q.q}</span>
          <small className={s.answerLabel} data-second="">
            {AI_COPY.label}
          </small>
          <p className={s.answerText}>
            {q.answer.map((a, i) => (
              <span
                key={a.text}
                data-sent={a.cite ?? undefined}
                data-mention={a.mention || undefined}
                data-lit={(typeof pick === 'number' && a.cite === pick) || undefined}
                style={{ animationDelay: `${300 + i * 80}ms` }}
              >
                {a.text}
                {a.cite ? <sup>{a.cite}</sup> : null}.{' '}
              </span>
            ))}
          </p>
        </div>

        <div className={s.sources} role="group" aria-label="Where the answer looks">
          {q.sources.map((x, i) => (
            <button
              key={x.domain}
              type="button"
              className={s.source}
              data-src={x.state === 'cited' ? i + 1 : undefined}
              data-state={x.state}
              aria-pressed={pick === i + 1}
              style={{ animationDelay: `${500 + i * 100}ms` }}
              onClick={() => dispatch({ type: 'set', patch: { aiPick: pick === i + 1 ? null : i + 1 } })}
            >
              <em aria-hidden="true">{x.state === 'cited' ? i + 1 : '·'}</em>
              <span>
                {x.domain}
                <small>{x.kind}</small>
              </span>
              <b>{STATE_LABEL[x.state]}</b>
            </button>
          ))}
        </div>

        <button
          type="button"
          className={s.product}
          data-product=""
          data-you={q.you}
          aria-pressed={pick === 'product'}
          onClick={() => dispatch({ type: 'set', patch: { aiPick: pick === 'product' ? null : 'product' } })}
        >
          <span className={s.productHead}>
            <i aria-hidden="true" />
            <span>
              PeakForm · {SITE.product}
              <small>{SITE.domain}/protein/whey-isolate</small>
            </span>
          </span>
          <b className={s.productState} data-state={st.aiCheck ? 'check' : st.aiFix ? 'draft' : q.you}>
            {status}
          </b>
          {!st.aiFix && <span className={s.finding}>{q.finding}</span>}
          <span className={s.productFacts}>
            {PRODUCT_FACTS.map((f, i) => (
              <span key={f.id} data-ok={st.aiFix || undefined} style={{ animationDelay: `${st.aiFix ? i * 110 : 1900 + i * 90}ms` }}>
                <i aria-hidden="true" />
                {f.label}
                <em>{st.aiFix ? f.draft : 'Missing'}</em>
              </span>
            ))}
          </span>
          {/* one closing line: what else was drafted, then (once a recheck is asked for) what comes next */}
          {st.aiCheck ? <small className={s.recheck}>{AI_COPY.recheckShort}</small> : st.aiFix && <small className={s.schema}>{AI_COPY.extras}</small>}
        </button>
      </div>
    </div>
  );
}

export function AiInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = questionOf(st.sample);
  const pick = st.aiPick;
  const src = typeof pick === 'number' ? q.sources[pick - 1] : null;
  const toggle = (d: 'method' | 'surfaces') => dispatch({ type: 'set', patch: { detail: st.detail === d ? null : d } });
  return (
    <>
      <span className={s.insKicker} data-tone="ai">
        {STATE_LABEL[q.you]}
      </span>
      {src ? (
        <>
          <b className={s.insTitle}>{src.domain}</b>
          <span className={s.insNote}>
            {src.kind}.{' '}
            {src.state === 'cited' ? `Supports the highlighted ${q.answer.filter((a) => a.cite === pick).length > 1 ? 'sentences' : 'sentence'}.` : ''}
          </span>
        </>
      ) : (
        <>
          <b className={s.insTitle}>{st.aiFix ? AI_COPY.prepared : q.finding}</b>
          <span className={s.insNote}>{q.why}</span>
        </>
      )}
      <button type="button" className={s.actBtn} aria-pressed={st.aiFix} onClick={() => dispatch({ type: 'set', patch: { aiFix: !st.aiFix, aiCheck: false } })}>
        {st.aiFix ? 'Hide the draft' : 'Improve product page'}
      </button>
      {st.aiFix && (
        <button type="button" className={s.linkBtn} aria-pressed={st.aiCheck} onClick={() => dispatch({ type: 'set', patch: { aiCheck: !st.aiCheck } })}>
          {st.aiCheck ? 'Cancel the recheck' : 'Recheck AI visibility'}
        </button>
      )}
      {st.aiCheck && (
        <span className={s.method} role="note">
          <b>Recheck planned.</b> {AI_COPY.recheck}
        </span>
      )}
      <button type="button" className={s.linkBtn} aria-expanded={st.detail === 'surfaces'} onClick={() => toggle('surfaces')}>
        Search result, quick answer or AI answer?
      </button>
      {st.detail === 'surfaces' && (
        <span className={s.surfaces} role="note">
          {AI_COPY.surfaces.map((x) => (
            <span key={x.id} data-surface={x.id}>
              <i aria-hidden="true" />
              <b>{x.label}</b>
              {x.line}
            </span>
          ))}
        </span>
      )}
      <button type="button" className={s.linkBtn} aria-expanded={st.detail === 'method'} onClick={() => toggle('method')}>
        Where these answers come from
      </button>
      {st.detail === 'method' && (
        <span className={s.method} role="note">
          {AI_COPY.method}
        </span>
      )}
    </>
  );
}
