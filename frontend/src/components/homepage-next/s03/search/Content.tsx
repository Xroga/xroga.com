'use client';

/**
 * Find search opportunities: real buyer searches grouped by intent (compare, buy, local, learn). The chosen search runs
 * left to right: who answers it today, then PeakForm's page, or the empty slot where that page should be. "Prepare page
 * brief" shapes the slot into an editorial draft (heading, what it covers, a FAQ, internal links, product facts). It is
 * a draft to review, never a published page, and no ranking is promised.
 */
import type { Dispatch } from 'react';
import { BRIEF, INTENTS, QUERIES, QUERY_NEXT, SITE, queryOf } from '../data';
import { rovingKeys } from '../keys';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import s from '../S03.module.css';

export function ContentStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = queryOf(st.query);
  const brief = q.gap ? BRIEF[q.id] : null;
  const shown = QUERIES.filter((x) => x.intent === q.intent);
  const own = q.rival === SITE.domain;
  return (
    <div className={s.content} data-intent={q.intent} data-gap={q.gap || undefined} data-brief={(brief && st.brief) || undefined}>
      <div className={s.stageBar}>
        <Seg
          label="Search intent"
          value={q.intent}
          options={INTENTS}
          onPick={(v) =>
            dispatch({
              type: 'set',
              patch: { query: QUERIES.find((x) => x.intent === v && x.gap)?.id ?? QUERIES.find((x) => x.intent === v)!.id, brief: false },
            })
          }
          small
        />
      </div>
      <div className={s.queryList} role="radiogroup" aria-label="Buyer searches" onKeyDown={rovingKeys}>
        {shown.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={x.id === q.id}
            tabIndex={x.id === q.id ? 0 : -1}
            className={s.query}
            data-gap={x.gap || undefined}
            onClick={() => dispatch({ type: 'set', patch: { query: x.id, brief: false } })}
          >
            <span>“{x.q}”</span>
            <em>{x.gap ? 'Not answered' : x.you}</em>
          </button>
        ))}
      </div>

      <div className={s.flow} key={q.id}>
        <span className={s.flowCard} data-side="rival">
          <small>Answered today by</small>
          <b>{q.rival}</b>
          <span>{q.rivalPage}</span>
          <i aria-hidden="true" />
          <i aria-hidden="true" />
        </span>
        <span className={s.flowLink} aria-hidden="true" data-gap={q.gap || undefined}>
          <em>{q.gap ? 'Not on your site' : own ? 'Your page' : 'Ranks above you'}</em>
        </span>
        <span className={s.slot} data-gap={q.gap || undefined} data-filled={(brief && st.brief) || undefined}>
          <small>{SITE.domain}</small>
          {brief && st.brief ? (
            <>
              <b>{brief.title}</b>
              <ul>
                {brief.covers.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <span className={s.slotRow}>
                <small>FAQ</small> {brief.faq}
              </span>
              <span className={s.slotRow}>
                <small>Facts</small> {brief.facts}
              </span>
              <span className={s.slotRow}>
                <small>Links</small> {brief.link}
              </span>
              <em className={s.draftState}>Page brief · draft for review</em>
            </>
          ) : (
            <b>{q.gap ? 'No page answers this search' : q.you}</b>
          )}
        </span>
      </div>
    </div>
  );
}

export function ContentInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = queryOf(st.query);
  const intent = INTENTS.find((i) => i.id === q.intent)!.label;
  return (
    <>
      <span className={s.insKicker}>{intent} intent</span>
      <b className={s.insTitle}>“{q.q}”</b>
      <dl className={s.facts} data-stack="">
        <div>
          <dt>Your site</dt>
          <dd data-warn={q.gap || q.id === 'nearby' || undefined}>{q.gap ? 'No page' : q.you}</dd>
        </div>
        <div>
          <dt>Answered by</dt>
          <dd>{q.rival}</dd>
        </div>
      </dl>
      {q.gap ? (
        <button type="button" className={s.actBtn} aria-pressed={st.brief} onClick={() => dispatch({ type: 'set', patch: { brief: !st.brief } })}>
          {st.brief ? 'Hide the brief' : 'Prepare page brief'}
        </button>
      ) : (
        <span className={s.insNext}>
          <small>Next</small>
          {QUERY_NEXT[q.id]}
        </span>
      )}
      <span className={s.insNote}>
        Example searches. Once connected, Search Console shows the searches your site already appears for; Semrush and Ahrefs add demand and competitor pages.
      </span>
    </>
  );
}
