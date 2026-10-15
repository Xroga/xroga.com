'use client';

/**
 * Find search opportunities: keyword research as one visible chain. Buyer searches cluster by intent (buy, compare,
 * learn, nearby); the chosen intent is bright and the rest stay present but muted. The chosen search runs left to
 * right: the competitor page that answers it today, then PeakForm's page, or the empty slot where that page should be.
 * "Prepare page brief" shapes the slot into a draft (heading, what it covers, a FAQ, product facts, internal links) that
 * needs approval before it is published and checked. Each data source sits beside the step it would feed, with its real
 * status in Xroga's directory; the searches themselves are illustrative and no volumes are quoted.
 */
import type { Dispatch } from 'react';
import { AVAILABILITY_LABEL, BRIEF, INTENTS, QUERIES, QUERY_NEXT, SITE, TOOLS, availability, queryOf, type ToolId } from '../data';
import { hasMark, ToolMark } from '../marks';
import { rovingKeys } from '../keys';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import s from '../S03.module.css';

/** a provider named beside the work it would feed, with its directory status; no sign-in state is ever implied */
function Source({ id, job }: { id: ToolId; job: string }) {
  const t = TOOLS[id];
  return (
    <span className={s.dataSource} data-avail={availability(t)}>
      {hasMark(id) ? <ToolMark id={id} size={13} /> : <i aria-hidden="true">{t.name.slice(0, 1)}</i>}
      <span>
        {job}: <b>{t.name}</b> · {AVAILABILITY_LABEL[availability(t)].toLowerCase()}
      </span>
    </span>
  );
}

export function ContentStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = queryOf(st.query);
  const brief = q.gap ? BRIEF[q.id] : null;
  const own = q.rival === SITE.domain;
  const ordered = INTENTS.flatMap((i) => QUERIES.filter((x) => x.intent === i.id));
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

      <div className={s.research}>
        <div className={s.dataLine}>
          <Source id="gsc" job="Your own searches" />
          <Source id="semrush" job="Demand" />
          <Source id="ahrefs" job="Competitor pages" />
        </div>
        <div className={s.queryList} role="radiogroup" aria-label="Buyer searches" onKeyDown={rovingKeys}>
          {ordered.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={x.id === q.id}
              tabIndex={x.id === q.id ? 0 : -1}
              className={s.query}
              data-gap={x.gap || undefined}
              data-dim={x.intent !== q.intent || undefined}
              onClick={() => dispatch({ type: 'set', patch: { query: x.id, brief: false } })}
            >
              <small>{INTENTS.find((i) => i.id === x.intent)!.label}</small>
              <span>“{x.q}”</span>
              <em>{x.gap ? 'Not answered' : x.you}</em>
            </button>
          ))}
        </div>
      </div>

      <div className={s.flow} key={q.id}>
        <span className={s.flowCard} data-side="rival">
          <small>Answered today by</small>
          <b>{q.rival}</b>
          <span>{q.rivalPage}</span>
          {q.alsoCited && <em className={s.alsoCited}>Also cited in the AI answer</em>}
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
              <span className={s.approval}>
                <em className={s.draftState}>Page brief · draft</em>
                <span>Needs your approval → publish → check results after publishing</span>
              </span>
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
        Illustrative searches; no volumes are quoted. Semrush and Ahrefs are available to connect for demand and competitor pages; Search Console is not
        currently supported.
      </span>
    </>
  );
}
