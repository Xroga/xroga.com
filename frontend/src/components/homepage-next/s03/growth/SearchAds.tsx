'use client';

/**
 * Build search ads: a real Google Ads shape. Searches are sorted by intent into two ad groups and a negatives tray;
 * the chosen ad group drives the responsive search ad and the landing-page hero, with message-match lines between
 * them. Budget is a proposed daily cap, never spend. "Review campaign" lists what would be set up and what must pass
 * first; nothing launches from here.
 */
import type { Dispatch } from 'react';
import { AD_GROUPS, BRAND, BUDGET, RADII, TERMS, groupOf } from '../data';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import { Bag, EmberMark } from './Art';
import s from '../S03.module.css';

export function SearchAdsStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const g = groupOf(st.group);
  return (
    <div className={s.ads} data-group={g.id} data-excluded={st.excluded || undefined}>
      <div className={s.tree} aria-label="Campaign structure">
        <span className={s.treeRoot}>
          <small>Campaign</small>
          {BRAND.product} · Search
        </span>
        <div className={s.treeGroups}>
          {AD_GROUPS.map((x) => (
            <button
              key={x.id}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className={s.treeGroup}
              data-on={x.id === g.id || undefined}
              onClick={() => dispatch({ type: 'set', patch: { group: x.id } })}
            >
              <small>Ad group</small>
              {x.label}
              <em>{TERMS.filter((t) => t.group === x.id).length} keywords</em>
            </button>
          ))}
        </div>
      </div>

      <div className={s.terms} aria-hidden="true">
        {TERMS.map((t) => (
          <span key={t.t} className={s.term} data-group={t.group} data-on={t.group === g.id || undefined}>
            {t.group === 'irrelevant' && st.excluded ? '−' : '"'}
            {t.t}
            {t.group === 'irrelevant' && st.excluded ? '' : '"'}
          </span>
        ))}
        <span className={s.negLabel}>{st.excluded ? 'Negative keywords' : 'Not a buyer'}</span>
      </div>

      <svg className={s.match} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path key={`m1-${g.id}`} d="M28 50 C36 50 36 38 44 38" />
        <path key={`m2-${g.id}`} d="M70 38 C76 38 76 56 82 56" />
      </svg>

      <div key={`ad-${g.id}`} className={s.serp}>
        <span className={s.serpTop}>
          <b>Sponsored</b>
          <span className={s.serpFav}>
            <EmberMark size={11} />
          </span>
          {BRAND.domain}
        </span>
        <span className={s.serpHead}>{g.headlines.join(' | ')}</span>
        <span className={s.serpText}>{g.desc}</span>
        <span className={s.serpLinks}>
          <span>How it works</span>
          <span>Our roasts</span>
          <span>Gift plans</span>
        </span>
      </div>

      <div key={`lp-${g.id}`} className={s.landing}>
        <span>
          <b>{g.hero}</b>
          <small>{g.offer}</small>
          <em>Start</em>
        </span>
        <Bag tone={g.id === 'gift' ? 'cream' : 'ember'} className={s.landBag} />
      </div>
    </div>
  );
}

export function SearchAdsControls({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const g = groupOf(st.group);
  return (
    <>
      <span className={s.ctlLabel}>Ad group</span>
      <Seg
        label="Ad group"
        value={st.group}
        options={AD_GROUPS.map((x) => ({ id: x.id, label: x.label }))}
        onPick={(v) => dispatch({ type: 'set', patch: { group: v } })}
      />
      <button type="button" className={s.actBtn} aria-pressed={st.excluded} onClick={() => dispatch({ type: 'set', patch: { excluded: !st.excluded } })}>
        {st.excluded ? 'Undo exclusions' : 'Exclude irrelevant searches'}
      </button>
      <label className={s.range}>
        <span>
          Daily cap <b>£{st.budget}</b> <small>proposed</small>
        </span>
        <input
          type="range"
          min={BUDGET.min}
          max={BUDGET.max}
          step={BUDGET.step}
          value={st.budget}
          onChange={(e) => dispatch({ type: 'set', patch: { budget: Number(e.target.value) } })}
          aria-label="Proposed daily budget cap in pounds"
        />
      </label>
      <label className={s.select}>
        <span>Location</span>
        <select value={st.radius} onChange={(e) => dispatch({ type: 'set', patch: { radius: Number(e.target.value) } })}>
          {RADII.map((r, i) => (
            <option key={r} value={i}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={s.quietBtn}
        aria-expanded={st.detail === 'review'}
        onClick={() => dispatch({ type: 'set', patch: { detail: st.detail === 'review' ? null : 'review' } })}
      >
        Review campaign
      </button>
      {st.detail === 'review' && (
        <div className={s.review} role="group" aria-label="Proposed campaign">
          <span className={s.draftState}>Campaign draft · awaiting approval</span>
          <dl>
            <div>
              <dt>Ad group</dt>
              <dd>
                {g.label} · {g.match}
              </dd>
            </div>
            <div>
              <dt>Negatives</dt>
              <dd>{st.excluded ? '3 excluded' : 'None yet'}</dd>
            </div>
            <div>
              <dt>Daily cap</dt>
              <dd>£{st.budget} · proposed</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{RADII[st.radius]}</dd>
            </div>
          </dl>
          <span className={s.issueLine}>Before launch: add the purchase tag to /thanks</span>
          <span className={s.insNote}>Nothing is launched or charged from this page.</span>
        </div>
      )}
    </>
  );
}
