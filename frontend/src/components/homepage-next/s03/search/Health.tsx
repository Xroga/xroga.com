'use client';

/**
 * Fix my website: a small crawlable store. "Inspect crawl" sends a tracer once along the internal links; it stops at the
 * broken one. Four page states are told apart by shape and words, not colour alone: can't be opened (404), opens slowly,
 * hidden by mistake, and hidden on purpose (not an issue). The inspector answers three questions in order: what was
 * checked, what is wrong, and what Xroga would prepare. A repair is drawn as a dashed proposal; nothing is applied.
 * Links run from the edge of one page card to the edge of the next (measured from layout, so a card's own scale or
 * entrance never moves them), so a line never runs over a page's address.
 */
import { useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import { CRAWL, ISSUES, LINKS, PAGES, PAGE_STATE, issueOf } from '../data';
import { rovingKeys } from '../keys';
import type { Action, State } from '../state';
import s from '../S03.module.css';

const at = (id: string) => PAGES.find((p) => p.id === id)!;
type Box = { l: number; r: number; t: number; b: number; cx: number; cy: number };

/** card edge to card edge: side by side when the cards are in different columns, top to bottom when stacked */
function link(a: Box, b: Box) {
  if (Math.abs(a.cx - b.cx) < 40) {
    const [up, down] = a.cy < b.cy ? [a, b] : [b, a];
    const y1 = up.b + 4;
    const y2 = down.t - 4;
    return `M${up.cx} ${y1} C${up.cx} ${(y1 + y2) / 2} ${down.cx} ${(y1 + y2) / 2} ${down.cx} ${y2}`;
  }
  const x1 = a.r + 4;
  const x2 = b.l - 4;
  const m = (x1 + x2) / 2;
  return `M${x1} ${a.cy} C${m} ${a.cy} ${m} ${b.cy} ${x2} ${b.cy}`;
}

function useCardLinks() {
  const plot = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const el = plot.current;
    if (!el) return;
    const measure = () => {
      const box: Record<string, Box> = {};
      el.querySelectorAll<HTMLElement>('[data-page]').forEach((n) => {
        // offset geometry ignores transforms: the card is centred on (offsetLeft, offsetTop)
        const w = n.offsetWidth;
        const h = n.offsetHeight;
        box[n.dataset.page!] = {
          l: n.offsetLeft - w / 2,
          r: n.offsetLeft + w / 2,
          t: n.offsetTop - h / 2,
          b: n.offsetTop + h / 2,
          cx: n.offsetLeft,
          cy: n.offsetTop,
        };
      });
      const out: Record<string, string> = {};
      for (const [a, b] of LINKS) if (box[a] && box[b]) out[`${a}-${b}`] = link(box[a], box[b]);
      setPaths(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.querySelectorAll('[data-page]').forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, []);
  return { plot, paths };
}

export function HealthStage({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const sel = issueOf(st.issue);
  const { plot, paths } = useCardLinks();
  const edge = (a: string, b: string) => paths[`${a}-${b}`] ?? '';
  return (
    <div className={s.health} data-issue={sel.id} data-repair={st.repair || undefined}>
      <div className={s.stageBar}>
        <button type="button" className={s.barBtn} onClick={() => dispatch({ type: 'crawl' })}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
          {st.crawl ? 'Crawl again' : 'Inspect crawl'}
        </button>
        <span className={s.barNote}>
          {CRAWL.pages} pages · {CRAWL.links} internal links
        </span>
      </div>
      <div ref={plot} className={s.plot}>
        <svg className={s.graph} aria-hidden="true">
          {LINKS.map(([a, b]) => {
            const issue = ISSUES.find((i) => i.from === a && i.to === b);
            return (
              <path key={`${a}-${b}`} d={edge(a, b)} className={s.crawlEdge} data-to={at(b).state} data-on={(issue && issue.id === sel.id) || undefined} />
            );
          })}
          {/* the tracer: one pass per run, stopping at the broken link */}
          {st.crawl > 0 &&
            !!paths['home-protein'] &&
            LINKS.map(([a, b], i) => (
              <path
                key={`t-${st.crawl}-${a}-${b}`}
                d={edge(a, b)}
                className={s.tracer}
                data-stop={at(b).state === 'broken' || undefined}
                style={{ animationDelay: `${(a === 'home' ? 0 : 1) * 380 + i * 50}ms` }}
              />
            ))}
          {st.repair && sel.id === 'broken' && <path d={edge('protein', 'whey')} className={s.proposal} />}
        </svg>

        {PAGES.map((p) => {
          const issue = ISSUES.find((i) => i.to === p.id);
          const flag = p.state !== 'ok' ? PAGE_STATE[p.state] : null;
          return (
            <span
              key={p.id}
              className={s.page}
              data-page={p.id}
              data-home={p.id === 'home' || undefined}
              data-state={p.state}
              data-on={(issue && issue.id === sel.id) || undefined}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              aria-hidden="true"
            >
              <i />
              <code>{p.path.split('/').map((seg, i) => (i ? <span key={i}>/<wbr />{seg}</span> : seg))}</code>
              {flag && <em>{flag.tag}</em>}
              {st.repair && issue?.id === 'broken' && sel.id === 'broken' && <em data-proposed="">→ /protein/whey-isolate-1kg · proposed</em>}
            </span>
          );
        })}
      </div>

      <div className={s.issueRow} role="radiogroup" aria-label="Issues found" onKeyDown={rovingKeys}>
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
      <ol className={s.steps}>
        <li>
          <small>Checked</small>
          <span>
            {CRAWL.pages} pages: {CRAWL.checks.toLowerCase()}
          </span>
        </li>
        <li data-tone="warn">
          <small>Found</small>
          <b>{i.finding}</b>
          <code className={s.insCode}>{i.status}</code>
          <span>{i.consequence}</span>
        </li>
        <li>
          <small>Xroga prepares</small>
          <span>{i.repair}</span>
        </li>
      </ol>
      <button type="button" className={s.actBtn} aria-pressed={st.repair} onClick={() => dispatch({ type: 'set', patch: { repair: !st.repair } })}>
        {st.repair ? 'Hide the repair' : 'Preview repair'}
      </button>
      {st.repair && (
        <span className={s.proposalCard} role="note">
          <small>Proposed · not applied</small>
          {i.repair}
          <span className={s.verify}>
            <i aria-hidden="true" />
            Then retest: {i.verify}
          </span>
        </span>
      )}
    </>
  );
}
