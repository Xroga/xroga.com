'use client';

/**
 * Local presence: a service area around Northlane, nearby businesses for one local search, and the listing details
 * that decide whether Northlane shows up. Missing details are marked; "Prepare listing update" drafts the change for
 * approval. Nothing is posted to a listing, and no reviews or ratings are invented.
 */
import type { Dispatch } from 'react';
import { LOCAL } from '../data';
import type { Action, State } from '../state';
import s from '../S03.module.css';

export function LocalStage({ st }: { st: State }) {
  return (
    <div className={s.local} data-fix={st.localFix || undefined}>
      <div className={s.stageBar}>
        <span className={s.localQuery}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          {LOCAL.query}
        </span>
        <span className={s.barNote}>{LOCAL.area}</span>
      </div>
      <div className={s.map} aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <path className={s.river} d="M-5 72 C20 60 30 84 52 74 S82 52 105 60" />
          <path className={s.road} d="M0 40 L100 46 M18 0 L30 100 M62 0 L56 100 M0 88 L100 20" />
          <path className={s.roadMinor} d="M0 20 L44 26 M40 60 L100 70 M76 0 L84 100 M8 56 L48 52" />
        </svg>
        <span className={s.radius} />
        {LOCAL.pins.map((p) => (
          <span key={p.id} className={s.pin} data-you={p.you || undefined} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <i />
            <b>{p.name}</b>
          </span>
        ))}
      </div>
      <div className={s.listing}>
        <span className={s.listHead}>
          <b>Northlane Heating</b>
          <small>Heating engineer · Leeds</small>
        </span>
        <ul>
          {LOCAL.fields.map((f) => (
            <li key={f.id} data-ok={f.ok || undefined} data-fixed={(!f.ok && st.localFix) || undefined}>
              <i />
              {f.label}
              <em>{f.ok ? 'Complete' : st.localFix ? 'Drafted' : 'Missing'}</em>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function LocalInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  return (
    <>
      <span className={s.insKicker} data-tone="local">
        2 details missing
      </span>
      <b className={s.insTitle}>Opening hours and service areas are blank, so map results can skip you.</b>
      <button type="button" className={s.actBtn} aria-pressed={st.localFix} onClick={() => dispatch({ type: 'set', patch: { localFix: !st.localFix } })}>
        {st.localFix ? 'Discard the draft' : 'Prepare listing update'}
      </button>
      {st.localFix && <span className={s.insNote}>Draft only. Listing changes need your sign-in and approval.</span>}
    </>
  );
}
