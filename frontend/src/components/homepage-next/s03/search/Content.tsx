'use client';

/**
 * Keywords & content: search demand grouped by intent. The chosen intent comes forward; a gap (a query a competitor
 * answers and Northlane does not) shows the competitor page beside an empty slot in Northlane's site. "Prepare content
 * brief" produces an editorial draft and fills the slot as a proposal, never as a published page.
 */
import type { Dispatch } from 'react';
import { BRIEF, QUERIES, SITE, queryOf, type Intent } from '../data';
import { rovingKeys } from '../keys';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import s from '../S03.module.css';

const INTENTS: { id: Intent; label: string }[] = [
  { id: 'buying', label: 'Buying' },
  { id: 'comparing', label: 'Comparing' },
  { id: 'learning', label: 'Learning' },
];

export function ContentStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = queryOf(st.query);
  const brief = q.gap ? BRIEF[q.id as keyof typeof BRIEF] : null;
  return (
    <div className={s.content} data-intent={q.intent}>
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
      <div className={s.clusters} role="radiogroup" aria-label="Queries" onKeyDown={rovingKeys}>
        {INTENTS.map((g) => (
          <div key={g.id} className={s.cluster} data-on={g.id === q.intent || undefined}>
            <small aria-hidden="true">{g.label}</small>
            {QUERIES.filter((x) => x.intent === g.id).map((x) => (
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
                {x.q}
                <em>{x.gap ? 'Gap' : x.you}</em>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className={s.compare} key={q.id}>
        <span className={s.rivalPage}>
          <small>{q.rival}</small>
          <b>{q.gap ? `Covers “${q.q}”` : q.rival === SITE.domain ? 'Your page leads' : 'Ranks above you'}</b>
          <i />
          <i />
          <i />
        </span>
        <span className={s.slot} data-filled={(q.gap && st.brief) || undefined} data-gap={q.gap || undefined}>
          <small>{SITE.domain}</small>
          {q.gap ? <b>{st.brief && brief ? brief.title : 'No page for this search'}</b> : <b>{q.you}</b>}
          {q.gap && st.brief && <em>Proposed page · draft</em>}
        </span>
      </div>
      {q.gap && st.brief && brief && (
        <div className={s.brief} key={`b-${q.id}`} role="note">
          <span className={s.draftState}>Content brief · draft for review</span>
          <b>{brief.title}</b>
          <ol>
            {brief.h2.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
          <span>
            <small>FAQ</small> {brief.faq}
          </span>
          <span>
            <small>Links</small> {brief.link}
          </span>
        </div>
      )}
    </div>
  );
}

export function ContentInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = queryOf(st.query);
  return (
    <>
      <span className={s.insKicker}>{q.intent[0].toUpperCase() + q.intent.slice(1)} intent</span>
      <b className={s.insTitle}>“{q.q}”</b>
      <dl className={s.facts}>
        <div>
          <dt>You</dt>
          <dd data-warn={q.gap || undefined}>{q.you}</dd>
        </div>
        <div>
          <dt>Leader</dt>
          <dd>{q.rival}</dd>
        </div>
      </dl>
      {q.gap ? (
        <button type="button" className={s.actBtn} aria-pressed={st.brief} onClick={() => dispatch({ type: 'set', patch: { brief: !st.brief } })}>
          {st.brief ? 'Hide the brief' : 'Prepare content brief'}
        </button>
      ) : (
        <span className={s.insNext}>
          <small>Next</small>
          {q.rival === SITE.domain ? 'Keep it fresh; link it from /services' : 'Strengthen the existing page before writing a new one'}
        </span>
      )}
    </>
  );
}
