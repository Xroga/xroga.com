'use client';

/**
 * Earn authority: PeakForm's site on the left, outside sources on an arc to the right. Shape, line pattern and words say
 * what each relationship is: a verified link (solid, pointing at the site), an unlinked mention (an open line that stops
 * short), a link that goes only to a competitor (dashed, to the competitor), an opportunity to contact (no line) and an
 * unsuitable source. In the competitor gap, the chosen publisher shows the missing link to PeakForm as an open, dotted
 * line that never arrives. Outreach produces a draft; it never draws a link that does not exist.
 */
import type { Dispatch } from 'react';
import { CLASS_LABEL, LEGEND, LINK_MODES, RIVAL, SITE, SOURCES, sourceOf } from '../data';
import { rovingKeys } from '../keys';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import s from '../S03.module.css';

const SITE_AT = { x: 16, y: 40 };
const RIVAL_AT = { x: 22, y: 86 };

/** a gentle curve from a source to its target, bending toward the middle of the graph */
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
  return (
    <div className={s.links} data-mode={st.mode} data-draft={(st.outreach && !!sel.angle) || undefined}>
      <div className={s.stageBar}>
        <Seg
          label="Link view"
          value={st.mode}
          options={LINK_MODES.map((m) => ({ id: m.id, label: m.label }))}
          onPick={(m) => dispatch({ type: 'mode', mode: m })}
          small
        />
      </div>
      <div className={s.plot}>
        <svg className={s.graph} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="s03-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 8 4 0 8z" className={s.arrowHead} />
            </marker>
            <marker id="s03-open" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
              <circle cx="5" cy="5" r="3.4" className={s.openHead} />
            </marker>
          </defs>
          {visible.map((x) => {
            if (x.cls === 'prospect' || x.cls === 'discarded') return null;
            const toRival = x.cls === 'rival';
            const t = toRival ? RIVAL_AT : SITE_AT;
            // a mention reaches toward the site but stops short: there is no link to follow
            const d = curve(x.x, x.y, t.x + (toRival ? 4 : 7), t.y, x.cls === 'mention' ? 0.72 : 1);
            return (
              <path
                key={`${x.id}-${st.mode}`}
                d={d}
                className={s.edge}
                data-cls={x.cls}
                data-on={x.id === sel.id || undefined}
                markerEnd={x.cls === 'verified' || x.cls === 'rival' ? 'url(#s03-arrow)' : x.cls === 'mention' ? 'url(#s03-open)' : undefined}
              />
            );
          })}
          {st.mode === 'gap' && sel.cls === 'rival' && (
            <path key={`gap-${sel.id}`} d={curve(sel.x, sel.y, SITE_AT.x + 7, SITE_AT.y, 0.62)} className={s.edge} data-cls="gap" markerEnd="url(#s03-open)" />
          )}
        </svg>

        <span className={s.siteNode} style={{ left: `${SITE_AT.x}%`, top: `${SITE_AT.y}%` }} aria-hidden="true">
          <b>{SITE.domain}</b>
          <small>Your site</small>
        </span>
        {st.mode === 'gap' && sel.cls === 'rival' && (
          <span key={`tag-${sel.id}`} className={s.gapTag} style={{ left: `${SITE_AT.x}%`, top: `${SITE_AT.y + 15}%` }}>
            No link from {sel.domain} yet
          </span>
        )}
        {rival && (
          <span className={s.rivalNode} style={{ left: `${RIVAL_AT.x}%`, top: `${RIVAL_AT.y}%` }} aria-hidden="true">
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
              data-side={x.x < 60 ? 'right' : undefined}
              style={{ left: `${x.x}%`, top: `${x.y}%` }}
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

      {st.outreach && sel.angle && (
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
