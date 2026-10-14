'use client';

/**
 * Appear in AI answers: a real kind of question, a short answer, and the sources it cites. Citation threads run from
 * each source to the answer; Northlane keeps an open thread that reaches nothing when it is not cited. The questions are
 * named for what people ask, never sample numbers. The method is one click away and nothing here promises a citation.
 */
import type { Dispatch } from 'react';
import { AI_GAP, AI_QUESTIONS, SITE, type CiteState } from '../data';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import s from '../S03.module.css';

const STATE_LABEL: Record<CiteState, string> = { cited: 'Cited', absent: 'Not cited', untested: 'Not tested', conflicting: 'Conflicting details' };
export const questionOf = (id: string) => AI_QUESTIONS.find((x) => x.id === id) ?? AI_QUESTIONS[0];

export function AiStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = questionOf(st.sample);
  return (
    <div className={s.ai} data-question={q.id}>
      <div className={s.stageBar}>
        <Seg
          label="Question people ask"
          value={q.id}
          options={AI_QUESTIONS.map((x) => ({ id: x.id, label: x.label }))}
          onPick={(v) => dispatch({ type: 'set', patch: { sample: v } })}
          small
        />
      </div>
      <div key={q.id} className={s.answer}>
        <span className={s.ask}>{q.q}</span>
        <p className={s.answerText}>
          {q.answer.map((a) => (
            <span key={a.text}>
              <span data-cite={a.cite ? q.sources[a.cite - 1].state : undefined}>{a.text}</span>
              {a.cite && <sup>{a.cite}</sup>}.{' '}
            </span>
          ))}
        </p>
      </div>
      <div className={s.cites} key={`c-${q.id}`}>
        {q.sources.map((x, i) => (
          <span key={x.domain} className={s.cite} data-state={x.state}>
            <em>{i + 1}</em>
            <span>
              {x.domain}
              <small>{x.kind}</small>
            </span>
            <b>{STATE_LABEL[x.state]}</b>
          </span>
        ))}
        <span className={s.cite} data-state={q.you} data-you="">
          <em>—</em>
          <span>
            {SITE.domain}
            <small>Your site</small>
          </span>
          <b>{STATE_LABEL[q.you]}</b>
        </span>
      </div>
      {st.aiFix && (
        <div className={s.brief} data-small="" role="note">
          <span className={s.draftState}>Proposed page change · draft</span>
          <b>{AI_GAP.move}</b>
          <span>Areas: Headingley, Chapel Allerton, Roundhay · Same-day call-outs before 2pm</span>
        </div>
      )}
    </div>
  );
}

export function AiInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = questionOf(st.sample);
  return (
    <>
      <span className={s.insKicker} data-tone="ai">
        {STATE_LABEL[q.you]} · {q.label}
      </span>
      <b className={s.insTitle}>{q.why}</b>
      <button type="button" className={s.actBtn} aria-pressed={st.aiFix} onClick={() => dispatch({ type: 'set', patch: { aiFix: !st.aiFix } })}>
        {st.aiFix ? 'Hide the change' : 'Build a page worth citing'}
      </button>
      <button
        type="button"
        className={s.linkBtn}
        aria-expanded={st.detail === 'method'}
        onClick={() => dispatch({ type: 'set', patch: { detail: st.detail === 'method' ? null : 'method' } })}
      >
        Where these answers come from
      </button>
      {st.detail === 'method' && (
        <span className={s.method} role="note">
          {AI_GAP.method}
        </span>
      )}
    </>
  );
}
