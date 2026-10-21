'use client';

/**
 * Show up locally: PeakForm's Leeds shop on a map for one local search, nearby shops, and the listing details that decide
 * how it shows up. One detail is missing (Saturday hours); "Prepare listing correction" drafts it from the store page for
 * approval. This is a map listing, not an AI-answer citation. Nothing is posted, and no rating or rank is invented.
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
          <b>{LOCAL.store}</b>
          <small>{LOCAL.category}</small>
        </span>
        <ul>
          {LOCAL.fields.map((f) => (
            <li key={f.id} data-ok={f.ok || undefined} data-fixed={(!f.ok && st.localFix) || undefined}>
              <i />
              <span>
                {f.label}
                <small>{f.ok ? f.value : st.localFix ? `${f.value} · drafted` : 'Not set'}</small>
              </span>
              <em>{f.ok ? 'Complete' : st.localFix ? 'Drafted' : 'Missing'}</em>
            </li>
          ))}
        </ul>
        <small className={s.listNote}>Map listing · not an AI-answer citation</small>
      </div>
    </div>
  );
}

export function LocalInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  return (
    <>
      <span className={s.insKicker} data-tone="local">
        1 detail missing
      </span>
      <b className={s.insTitle}>Saturday hours are missing, so weekend shoppers can’t tell if the shop is open.</b>
      <span className={s.insNext}>
        <small>Proposed correction</small>
        {LOCAL.fix}
      </span>
      <button type="button" className={s.actBtn} aria-pressed={st.localFix} onClick={() => dispatch({ type: 'set', patch: { localFix: !st.localFix } })}>
        {st.localFix ? 'Discard the draft' : 'Prepare listing correction'}
      </button>
      <span className={s.insNote}>
        {st.localFix ? 'Draft only. ' : ''}Business Profile isn’t currently supported in Xroga, so a listing change needs your own sign-in and approval.
      </span>
    </>
  );
}
