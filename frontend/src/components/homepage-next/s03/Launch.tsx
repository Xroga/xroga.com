'use client';

/**
 * Step 1, Launch: the launch plane is the hero; around it sit the assets that go to market with it, each at its own
 * depth. Choosing an asset brings it forward while the others recede. Nothing is published from here.
 */
import type { Dispatch } from 'react';
import { AurelMark } from './Artifact';
import { ANNOUNCE, ASSETS, LISTING, SIGNALS } from './data';
import { rovingKeys } from './keys';
import type { Action, State } from './state';
import s from './S03.module.css';

export function Launch({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const pick = (id: State['asset']) => () => dispatch({ type: 'asset', id: st.asset === id ? 'page' : id });
  const cur = ASSETS.find((a) => a.id === st.asset)!;
  return (
    <div className={s.launch} data-asset={st.asset}>
      {/* the path to market: a faint trail from the launch plane toward the next step */}
      <svg className={s.trail} viewBox="0 0 1000 680" preserveAspectRatio="none" aria-hidden="true">
        <path d="M560 590 C660 664 800 664 868 632" />
      </svg>
      {/* the objects themselves are pointer targets; the kit below is the keyboard path */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.obj}
        data-obj="announce"
        data-on={st.asset === 'announce' || undefined}
        onClick={pick('announce')}
      >
        <span className={s.story}>
          <span className={s.storyArt} />
          <span className={s.storyBrand}>
            <AurelMark size={14} /> Aurel
          </span>
          <small>{ANNOUNCE.kicker}</small>
          <b>{ANNOUNCE.title}</b>
          <span>{ANNOUNCE.text}</span>
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.obj}
        data-obj="listing"
        data-on={st.asset === 'listing' || undefined}
        onClick={pick('listing')}
      >
        <span className={s.snippet}>
          <span className={s.snipUrl}>
            <i>
              <AurelMark size={11} />
            </i>
            {LISTING.url}
          </span>
          <b>{LISTING.title}</b>
          <span>{LISTING.text}</span>
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.obj}
        data-obj="signals"
        data-on={st.asset === 'signals' || undefined}
        onClick={pick('signals')}
      >
        <span className={s.signals}>
          <span className={s.sigHead}>
            <i />
            Tracking ready
          </span>
          <span className={s.sigList}>
            {SIGNALS.map((e) => (
              <code key={e}>{e}</code>
            ))}
          </span>
        </span>
      </button>

      <div className={s.kit}>
        <div className={s.kitRow} role="radiogroup" aria-label="Launch kit" onKeyDown={rovingKeys}>
          {ASSETS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={st.asset === a.id}
              tabIndex={st.asset === a.id ? 0 : -1}
              className={s.kitChip}
              onClick={() => dispatch({ type: 'asset', id: a.id })}
            >
              {a.label}
            </button>
          ))}
        </div>
        <span key={cur.id} className={s.kitState} aria-live="polite">
          <i aria-hidden="true" />
          {cur.label} · {cur.state}
        </span>
      </div>
    </div>
  );
}
