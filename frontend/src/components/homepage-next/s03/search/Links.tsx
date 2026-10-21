'use client';

/**
 * Earn authority: PeakForm's site and the competitor on fixed anchors at the left, outside sources in one lane on the
 * right with each marker before its label. Lines run only through the open lane between them, from a source's marker to
 * the edge of its target card, so no line ever passes under a caption. Shape, line pattern and words say what each
 * relationship is: a verified link (solid, to PeakForm), an unlinked mention (an open line that stops short), a link that
 * goes only to the competitor (dashed, to the competitor), an opportunity to contact (no line) and an unsuitable source.
 * In the competitor gap, the chosen publisher's missing link to PeakForm is a dotted line that never arrives. Outreach
 * produces a draft; it never draws a link that does not exist. Line ends are measured on layout changes only.
 */
import { useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import { CLASS_LABEL, LEGEND, LINK_MODES, RIVAL, SITE, SOURCES, sourceOf, type LinkClass } from '../data';
import { rovingKeys } from '../keys';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import s from '../S03.module.css';

type Edge = { id: string; cls: LinkClass | 'gap'; d: string; end: 'arrow' | 'open' | null };

/** a horizontal-tangent curve from (x1,y1) toward (x2,y2); `stop` < 1 ends it short of the target */
function curve(x1: number, y1: number, x2: number, y2: number, stop = 1) {
  const ex = x1 + (x2 - x1) * stop;
  const ey = y1 + (y2 - y1) * stop;
  const mx = (x1 + ex) / 2;
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${ey} ${ex} ${ey}`;
}

export function LinksStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const shown = LINK_MODES.find((m) => m.id === st.mode)!.show;
  const sel = sourceOf(st.source);
  const visible = SOURCES.filter((x) => shown.includes(x.cls));
  const rival = st.mode === 'gap' || st.mode === 'outreach';
  const gap = st.mode === 'gap' && sel.cls === 'rival';
  const draft = st.outreach && !!sel.angle;
  const plot = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const ids = visible.map((x) => x.id).join();

  useLayoutEffect(() => {
    const el = plot.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const box = (q: string) => el.querySelector<HTMLElement>(q)?.getBoundingClientRect();
      const siteR = box('[data-anchor="site"]');
      const rivalR = box('[data-anchor="rival"]');
      const out: Edge[] = [];
      for (const x of visible) {
        if (x.cls === 'prospect' || x.cls === 'discarded') continue;
        const t = x.cls === 'rival' ? rivalR : siteR;
        const dot = el.querySelector<HTMLElement>(`[data-src="${x.id}"] i`)?.getBoundingClientRect();
        if (!t || !dot) continue;
        const x1 = dot.left - b.left - 3;
        const y1 = dot.top + dot.height / 2 - b.top;
        const x2 = t.right - b.left + 6;
        const y2 = t.top + t.height / 2 - b.top + (x.cls === 'rival' ? 0 : x.cls === 'mention' ? 10 : -8);
        out.push({ id: x.id, cls: x.cls, d: curve(x1, y1, x2, y2, x.cls === 'mention' ? 0.7 : 1), end: x.cls === 'mention' ? 'open' : 'arrow' });
        if (gap && x.id === sel.id && siteR)
          out.push({ id: `${x.id}-gap`, cls: 'gap', d: curve(x1, y1, x2, siteR.top + siteR.height / 2 - b.top + 10, 0.6), end: 'open' });
      }
      setEdges(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, st.mode, sel.id, gap]);

  return (
    <div className={s.links} data-mode={st.mode} data-draft={draft || undefined}>
      <div className={s.stageBar}>
        <Seg
          label="Link view"
          value={st.mode}
          options={LINK_MODES.map((m) => ({ id: m.id, label: m.label }))}
          onPick={(m) => dispatch({ type: 'mode', mode: m })}
          small
        />
      </div>
      <div ref={plot} className={s.plot}>
        <svg className={s.graph} aria-hidden="true">
          <defs>
            <marker id="s03-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 8 4 0 8z" className={s.arrowHead} />
            </marker>
            <marker id="s03-open" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
              <circle cx="5" cy="5" r="3.4" className={s.openHead} />
            </marker>
          </defs>
          {edges.map((e) => (
            <path
              key={`${e.id}-${st.mode}`}
              d={e.d}
              className={s.edge}
              data-cls={e.cls}
              data-on={e.id === sel.id || undefined}
              markerEnd={e.end === 'arrow' ? 'url(#s03-arrow)' : e.end === 'open' ? 'url(#s03-open)' : undefined}
            />
          ))}
        </svg>

        <span className={s.siteNode} data-anchor="site" aria-hidden="true">
          <b>{SITE.domain}</b>
          <small>Your site</small>
          {gap && <em key={sel.id}>No link from {sel.domain} yet</em>}
        </span>
        {rival && (
          <span className={s.rivalNode} data-anchor="rival" aria-hidden="true">
            <b>{RIVAL.domain}</b>
            <small>Competitor</small>
          </span>
        )}

        <div className={s.srcLayer} role="radiogroup" aria-label="Sources" onKeyDown={rovingKeys}>
          {visible.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === sel.id}
              tabIndex={x.id === sel.id ? 0 : -1}
              className={s.src}
              data-cls={x.cls}
              data-src={x.id}
              style={{ top: `${x.y}%` }}
              onClick={() => dispatch({ type: 'set', patch: { source: x.id } })}
            >
              <i aria-hidden="true" />
              <span>
                {x.domain}
                <small>{CLASS_LABEL[x.cls]}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      {draft && (
        <div key={sel.id} className={s.draft} role="note">
          <span className={s.draftState}>Draft · awaiting your review</span>
          <b>To the editor of {sel.domain}</b>
          <span>{sel.angle}</span>
        </div>
      )}

      <div className={s.legend} aria-hidden="true">
        {LEGEND.map((l) => (
          <span key={l.cls} data-cls={l.cls}>
            <i />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LinksInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const x = sourceOf(st.source);
  const canDraft = x.cls === 'rival' || x.cls === 'mention' || x.cls === 'prospect';
  return (
    <>
      <span className={s.insKicker} data-cls={x.cls}>
        {CLASS_LABEL[x.cls]}
      </span>
      <b className={s.insTitle}>{x.domain}</b>
      <code className={s.insCode}>{x.page}</code>
      <dl className={s.facts}>
        <div>
          <dt>Topic</dt>
          <dd>{x.topic}</dd>
        </div>
        <div>
          <dt>Relevance</dt>
          <dd>{x.relevance}</dd>
        </div>
        <div>
          <dt>Seen</dt>
          <dd>{x.seen}</dd>
        </div>
      </dl>
      <span className={s.insNext}>
        <small>Next</small>
        {x.action}
      </span>
      {canDraft && (
        <button
          type="button"
          className={s.actBtn}
          aria-pressed={st.outreach}
          onClick={() => dispatch({ type: 'set', patch: st.outreach ? { outreach: false } : { mode: 'outreach', outreach: true } })}
        >
          {st.outreach ? 'Close the draft' : 'Prepare outreach'}
        </button>
      )}
      <span className={s.insNote}>A draft is not a link. Nothing is sent, and only a re-check of the live page marks a link as verified.</span>
    </>
  );
}
