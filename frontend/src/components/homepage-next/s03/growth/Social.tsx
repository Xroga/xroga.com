'use client';

/**
 * Create social ads: the same product, reshaped for a social feed and a full-screen story. The audience changes the
 * pouch, the line, the offer and the reason it suits them, in both placements at once; the chosen placement stands
 * forward. Drafts only.
 */
import type { Dispatch } from 'react';
import { AUDIENCES, BRAND, audienceOf, type Placement } from '../data';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import { Bag, Beans, EmberMark } from './Art';
import s from '../S03.module.css';

export function SocialStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const a = audienceOf(st.audience);
  const front = (p: Placement) => (st.placement === p ? 'front' : 'back');
  return (
    <div className={s.social} data-tone={a.tone}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.feed}
        data-pos={front('feed')}
        onClick={() => dispatch({ type: 'set', patch: { placement: 'feed' } })}
      >
        <span className={s.feedTop}>
          <span className={s.feedAvatar}>
            <EmberMark size={12} />
          </span>
          <b>{BRAND.name}</b>
          <small>Sponsored</small>
        </span>
        <span key={a.id} className={s.feedArt}>
          <Beans className={s.feedBeans} />
          <Bag tone={a.tone} className={s.feedBag} />
        </span>
        <span className={s.feedCopy}>
          <b key={a.id}>{a.line}</b>
          <span>
            <small>{BRAND.domain}</small>
            <em>{a.offer}</em>
          </span>
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className={s.story}
        data-pos={front('story')}
        onClick={() => dispatch({ type: 'set', patch: { placement: 'story' } })}
      >
        <span className={s.storyBar}>
          <i />
          <i />
          <i />
        </span>
        <span key={a.id} className={s.storyArt}>
          <Bag tone={a.tone} className={s.storyBag} />
        </span>
        <b className={s.storyLine}>{a.line}</b>
        <em className={s.storyCta}>{a.offer}</em>
      </button>
      <span key={`why-${a.id}`} className={s.why}>
        <small>Why this format</small>
        {a.why}
      </span>
    </div>
  );
}

export function SocialControls({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  return (
    <>
      <span className={s.ctlLabel}>Audience</span>
      <Seg
        label="Audience"
        value={st.audience}
        options={AUDIENCES.map((a) => ({ id: a.id, label: a.label }))}
        onPick={(v) => dispatch({ type: 'set', patch: { audience: v } })}
      />
      <span className={s.ctlLabel}>Placement</span>
      <Seg
        label="Placement"
        value={st.placement}
        options={[
          { id: 'feed', label: 'Feed' },
          { id: 'story', label: 'Story' },
        ]}
        onPick={(v) => dispatch({ type: 'set', patch: { placement: v } })}
      />
      <span className={s.stateLine}>
        <i aria-hidden="true" />
        Objective: trials · Draft · awaiting approval
      </span>
    </>
  );
}
