'use client';

/**
 * Launch a product: the product itself is the hero, with the four assets that take it to market around it at their
 * own depth. Choosing an asset brings it forward. Readiness is shown as states (drafted, ready for review, planned);
 * nothing is published.
 */
import type { Dispatch } from 'react';
import { BRAND, DISTRIBUTION, LAUNCH_ASSETS, POSITIONING } from '../data';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import { Bag, Beans, EmberMark } from './Art';
import s from '../S03.module.css';

export function LaunchStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const pick = (id: State['asset']) => () => dispatch({ type: 'set', patch: { asset: id } });
  return (
    <div className={s.launch} data-asset={st.asset}>
      <div className={s.hero} aria-hidden="true">
        <span className={s.heroShadow} />
        <Bag className={s.heroBag} />
        <Beans className={s.heroBeans} />
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.lObj}
        data-obj="positioning"
        data-on={st.asset === 'positioning' || undefined}
        onClick={pick('positioning')}
      >
        <span className={s.posCard}>
          <small>For</small>
          <b>{POSITIONING.for}</b>
          <small>Promise</small>
          <b>{POSITIONING.promise}</b>
          <small>Proof</small>
          <b>{POSITIONING.proof}</b>
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.lObj}
        data-obj="page"
        data-on={st.asset === 'page' || undefined}
        onClick={pick('page')}
      >
        <span className={s.lpCard}>
          <span className={s.lpNav}>
            <EmberMark size={12} />
            <b>Ember</b>
            <i />
            <i />
          </span>
          <span className={s.lpHero}>
            <span>
              <b>Never run out of good coffee.</b>
              <small>Roasted to order. First bag free.</small>
              <em>Start my subscription</em>
            </span>
            <Bag className={s.lpBag} />
          </span>
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.lObj}
        data-obj="announce"
        data-on={st.asset === 'announce' || undefined}
        onClick={pick('announce')}
      >
        <span className={s.annCard}>
          <Bag tone="slate" className={s.annBag} />
          <small>Now roasting</small>
          <b>{BRAND.product} is here.</b>
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.lObj}
        data-obj="distribution"
        data-on={st.asset === 'distribution' || undefined}
        onClick={pick('distribution')}
      >
        <span className={s.distRow}>
          {DISTRIBUTION.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </span>
      </button>
    </div>
  );
}

export function LaunchControls({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const cur = LAUNCH_ASSETS.find((a) => a.id === st.asset)!;
  return (
    <>
      <span className={s.ctlLabel}>Launch kit</span>
      <Seg
        label="Launch kit"
        value={st.asset}
        options={LAUNCH_ASSETS.map((a) => ({ id: a.id, label: a.label }))}
        onPick={(v) => dispatch({ type: 'set', patch: { asset: v } })}
      />
      <span className={s.stateLine} aria-live="polite">
        <i aria-hidden="true" />
        {cur.label} · {cur.state}
      </span>
      <ul className={s.ready}>
        <li data-ok="">Purchase event defined</li>
        <li data-ok="">Search listing checked</li>
        <li>Waitlist email · awaiting approval</li>
      </ul>
    </>
  );
}
