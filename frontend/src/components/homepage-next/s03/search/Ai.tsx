'use client';

/**
 * AI answers: one real-world kind of question, a short answer, and the sources it cites. Citation threads run from each
 * source to the sentence it supports. Northlane's site keeps an open thread that reaches nothing: it is not cited in
 * these samples. Samples vary; the method is one click away and nothing here promises a citation.
 */
import type { Dispatch } from 'react';
import { AI_GAP, AI_QUESTION, AI_SAMPLES, AI_SOURCES, SITE, type CiteState } from '../data';
import type { Action, State } from '../state';
import { Seg } from '../ui';
import s from '../S03.module.css';

const STATE_LABEL: Record<CiteState, string> = { cited: 'Cited', absent: 'Not cited', untested: 'Not tested', conflicting: 'Conflicting details' };

export function AiStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const sample = AI_SAMPLES.find((x) => x.id === st.sample)!;
  // sample 2 swaps which outside page carries the second citation: answers are not stable
  const sources = AI_SOURCES.map((x) => (st.sample === 's2' && x.id === 'homeguide' ? { ...x, state: 'absent' as CiteState } : x));
  return (
    <div className={s.ai} data-sample={st.sample}>
      <div className={s.stageBar}>
        <Seg
          label="Answer sample"
          value={st.sample}
          options={AI_SAMPLES.map((x) => ({ id: x.id, label: x.label }))}
          onPick={(v) => dispatch({ type: 'set', patch: { sample: v } })}
          small
        />
        <span className={s.barNote}>Sampled 12 Oct · Leeds</span>
      </div>
      <div className={s.answer}>
        <span className={s.ask}>{AI_QUESTION}</span>
        <p className={s.answerText}>
          <span data-cite="brightflow">Several engineers offer same-day boiler repair in Leeds, including Brightflow</span>
          <sup>1</sup>.{' '}
          {sources[1].state === 'cited' ? (
            <>
              <span data-cite="homeguide">Check that the engineer is Gas Safe registered and lists the areas they cover</span>
              <sup>2</sup>.{' '}
            </>
          ) : (
            <span>Check that the engineer is Gas Safe registered. </span>
          )}
          <span data-cite="directory">Directories list call-out fees from £60 to £95</span>
          <sup>3</sup>.
        </p>
      </div>
      <div className={s.cites} key={st.sample}>
        {sources.map((x, i) => (
          <span key={x.id} className={s.cite} data-state={x.state}>
            <em>{i + 1}</em>
            <span>
              {x.domain}
              <small>{x.kind}</small>
            </span>
            <b>{STATE_LABEL[x.state]}</b>
          </span>
        ))}
        <span className={s.cite} data-state={sample.you} data-you="">
          <em>—</em>
          <span>
            {SITE.domain}
            <small>Your site</small>
          </span>
          <b>{STATE_LABEL[sample.you]}</b>
        </span>
      </div>
      {st.aiFix && (
        <div className={s.brief} data-small="" role="note">
          <span className={s.draftState}>Proposed revision · draft</span>
          <b>{AI_GAP.move}</b>
          <span>Areas: Headingley, Chapel Allerton, Roundhay · Same-day call-outs before 2pm</span>
        </div>
      )}
    </div>
  );
}

export function AiInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const sample = AI_SAMPLES.find((x) => x.id === st.sample)!;
  return (
    <>
      <span className={s.insKicker} data-tone="ai">
        {STATE_LABEL[sample.you]} · {sample.label}
      </span>
      <b className={s.insTitle}>{AI_GAP.why}</b>
      <button type="button" className={s.actBtn} aria-pressed={st.aiFix} onClick={() => dispatch({ type: 'set', patch: { aiFix: !st.aiFix } })}>
        {st.aiFix ? 'Hide the revision' : 'Preview recommended revision'}
      </button>
      <button
        type="button"
        className={s.linkBtn}
        aria-expanded={st.detail === 'method'}
        onClick={() => dispatch({ type: 'set', patch: { detail: st.detail === 'method' ? null : 'method' } })}
      >
        How these were sampled
      </button>
      {st.detail === 'method' && (
        <span className={s.method} role="note">
          {AI_GAP.method}
        </span>
      )}
    </>
  );
}
