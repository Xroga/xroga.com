'use client';

/**
 * Step 2, Discovery: a market field around one buying search. Each opportunity is a node sized by demand, and its ring
 * says where Aurel stands (missing, weak, visible) in shape as well as colour. The chosen node lights a trace to the
 * next move; the evidence behind it opens on request.
 */
import type { Dispatch } from 'react';
import { FIELD, OPPORTUNITIES, QUERY, opportunityOf } from './data';
import { rovingKeys } from './keys';
import type { Action, State } from './state';
import s from './S03.module.css';

const PRESENCE = { missing: 'Not visible', weak: 'Barely visible', visible: 'Visible' } as const;

export function Discovery({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const o = opportunityOf(st.opp);
  return (
    <div className={s.discovery} data-opp={o.id}>
      <div className={s.field}>
        <svg className={s.orbits} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <ellipse cx="50" cy="50" rx="46" ry="44" />
          <ellipse cx="50" cy="50" rx="31" ry="30" />
          <ellipse cx="50" cy="50" rx="16" ry="16" />
          {OPPORTUNITIES.map((x) => (
            <line key={x.id} x1="50" y1="50" x2={x.x} y2={x.y} data-on={x.id === o.id || undefined} />
          ))}
        </svg>
        {FIELD.map((f) => (
          <span key={f.q} className={s.fieldTerm} style={{ left: `${f.x}%`, top: `${f.y}%` }} aria-hidden="true">
            {f.q}
          </span>
        ))}
        <span className={s.queryCore}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          {QUERY}
        </span>
        <div className={s.nodes} role="radiogroup" aria-label="Search opportunities" onKeyDown={rovingKeys}>
          {OPPORTUNITIES.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === o.id}
              tabIndex={x.id === o.id ? 0 : -1}
              className={s.node}
              data-presence={x.presence}
              style={{ left: `${x.x}%`, top: `${x.y}%`, ['--d' as string]: x.demand }}
              onClick={() => dispatch({ type: 'opp', id: x.id })}
            >
              <span className={s.nodeDot} aria-hidden="true" />
              <span className={s.nodeText}>
                <small>{x.kind}</small>
                <span className={s.nodeQ}>{x.query}</span>
                <span className={s.sr}> · Aurel: {PRESENCE[x.presence]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={s.legend} aria-hidden="true">
        <span data-presence="visible">Visible</span>
        <span data-presence="weak">Weak</span>
        <span data-presence="missing">Missing</span>
      </div>

      <aside key={o.id} className={s.move} aria-live="polite">
        <span className={s.moveKind}>{o.kind}</span>
        <b className={s.moveQuery}>“{o.query}”</b>
        <span className={s.versus}>
          <span>
            <small>Held by</small>
            {o.leader}
          </span>
          <span data-presence={o.presence}>
            <small>Aurel</small>
            {o.status}
          </span>
        </span>
        <span className={s.moveNext}>
          <small>Next move</small>
          {o.move}
        </span>
        <button
          type="button"
          className={s.linkBtn}
          aria-expanded={st.detail === 'evidence'}
          onClick={() => dispatch({ type: 'detail', detail: st.detail === 'evidence' ? null : 'evidence' })}
        >
          Inspect the evidence
        </button>
        {st.detail === 'evidence' && (
          <span className={s.evidence} role="note">
            <span>Checked the top 10 results and 4 AI answers for this search.</span>
            <span>Illustrative findings for a fictional product.</span>
          </span>
        )}
      </aside>
    </div>
  );
}
