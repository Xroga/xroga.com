'use client';

/**
 * Site health: a small crawlable site. "Inspect crawl" sends a tracer once along the internal links; it stops where a
 * link is broken. Each issue sits on the exact link it affects. "Preview repair" draws the proposed change as a dashed
 * proposal; nothing is applied, and the verification step says what would have to pass.
 */
import type { Dispatch } from 'react';
import { ISSUES, LINKS, PAGES, issueOf } from '../data';
import { rovingKeys } from '../keys';
import type { Action, State } from '../state';
import s from '../S03.module.css';

const at = (id: string) => PAGES.find((p) => p.id === id)!;
const FIXED = { x: 74, y: 29 };
const edge = (a: string, b: string) => path(at(a), at(b));
const path = (p: { x: number; y: number }, q: { x: number; y: number }) => {
  const x1 = p.x + 6;
  const x2 = q.x - 6;
  return `M${x1} ${p.y} C${(x1 + x2) / 2} ${p.y} ${(x1 + x2) / 2} ${q.y} ${x2} ${q.y}`;
};

export function HealthStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const sel = issueOf(st.issue);
  return (
    <div className={s.health} data-issue={sel.id} data-repair={st.repair || undefined}>
      <div className={s.stageBar}>
        <button type="button" className={s.barBtn} onClick={() => dispatch({ type: 'crawl' })}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
          {st.crawl ? 'Crawl again' : 'Inspect crawl'}
        </button>
        <span className={s.barNote}>7 pages · 7 internal links</span>
      </div>
      <div className={s.plot}>
        <svg className={s.graph} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {LINKS.map(([a, b]) => {
            const issue = ISSUES.find((i) => i.from === a && i.to === b);
            return <path key={`${a}-${b}`} d={edge(a, b)} className={s.crawlEdge} data-issue={issue?.id} data-on={issue?.id === sel.id || undefined} />;
          })}
          {/* the tracer: one pass per run, stopping at the broken link */}
          {st.crawl > 0 &&
            LINKS.map(([a, b], i) => (
              <path
                key={`t-${st.crawl}-${a}-${b}`}
                d={edge(a, b)}
                className={s.tracer}
                data-stop={ISSUES.find((x) => x.from === a && x.to === b)?.id === 'broken' || undefined}
                style={{ animationDelay: `${(at(a).id === 'home' ? 0 : 1) * 380 + i * 60}ms` }}
              />
            ))}
          {st.repair && sel.id === 'broken' && <path d={path(at('services'), FIXED)} className={s.proposal} />}
        </svg>

        {PAGES.map((p) => {
          const issue = ISSUES.find((i) => i.to === p.id);
          return (
            <span
              key={p.id}
              className={s.page}
              data-home={p.id === 'home' || undefined}
              data-issue={issue?.id}
              data-on={issue?.id === sel.id || undefined}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              aria-hidden="true"
            >
              <i />
              <code>{p.path}</code>
              {issue && <em>{issue.id === 'broken' ? '404' : issue.id === 'noindex' ? 'noindex' : 'no schema'}</em>}
            </span>
          );
        })}
        {st.repair && sel.id === 'broken' && (
          <span className={s.page} data-proposed="" style={{ left: `${FIXED.x}%`, top: `${FIXED.y}%` }} aria-hidden="true">
            <i />
            <code>/services/boiler-repairs</code>
            <em>200 · proposed</em>
          </span>
        )}
      </div>

      <div className={s.issueRow} role="radiogroup" aria-label="Issues" onKeyDown={rovingKeys}>
        {ISSUES.map((i) => (
          <button
            key={i.id}
            type="button"
            role="radio"
            aria-checked={i.id === sel.id}
            tabIndex={i.id === sel.id ? 0 : -1}
            className={s.issue}
            data-issue={i.id}
            onClick={() => dispatch({ type: 'set', patch: { issue: i.id, repair: false } })}
          >
            <i aria-hidden="true" />
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HealthInspector({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const i = issueOf(st.issue);
  return (
    <>
      <span className={s.insKicker} data-tone="warn">
        {i.label}
      </span>
      <code className={s.insCode}>{i.status}</code>
      <b className={s.insTitle}>{i.consequence}</b>
      <button type="button" className={s.actBtn} aria-pressed={st.repair} onClick={() => dispatch({ type: 'set', patch: { repair: !st.repair } })}>
        {st.repair ? 'Hide the repair' : 'Preview repair'}
      </button>
      {st.repair && (
        <span className={s.proposalCard} role="note">
          <small>Proposed · not applied</small>
          {i.repair}
          <span className={s.verify}>
            <i aria-hidden="true" />
            Verify after approval: {i.verify}
          </span>
        </span>
      )}
    </>
  );
}
