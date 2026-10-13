'use client';

/**
 * The warm-paper object in front of the terrain: whatever the visitor is inspecting, printed clearly. Search results
 * and AI answers for the selected query, a side-by-side with the leading competitor, the prepared content outline,
 * the growth plan with its approval boundary, or the conversion funnel by source.
 */
import type { Dispatch } from 'react';
import { AUDIENCES, BRAND, COMPETITORS, CONVERSIONS, PLAN, SOURCES, STAGES, audienceOf, fmt, pct, queryOf, sourceOf, totalFunnel, type Query } from './data';
import { ToolMark } from './marks';
import type { Action, State } from './state';
import { rovingKeys } from './keys';
import s from './S03.module.css';

const on = (v: boolean) => v || undefined;

export function Paper({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  if (st.view === 'plan') return <PlanPaper st={st} dispatch={dispatch} />;
  if (st.view === 'conversions') return <FunnelPaper st={st} dispatch={dispatch} />;
  const q = queryOf(st.query);
  const rival = COMPETITORS[q.rival];
  return (
    <div role="region" className={s.paper} data-mode={st.paper} aria-label="Search evidence for the selected query">
      <div className={s.paperSearch}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" />
          <path d="m10.4 10.4 3.4 3.4" />
        </svg>
        <span>{q.query}</span>
        <em>{q.intent} intent</em>
      </div>
      <div className={s.paperTabs} role="tablist" aria-label="Evidence view" onKeyDown={rovingKeys}>
        {(
          [
            ['organic', 'Organic results'],
            ['ai', 'AI answer'],
            ['compare', `vs. ${rival.name}`],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={st.paper === m}
            tabIndex={st.paper === m || (st.paper === 'outline' && m === 'organic') ? 0 : -1}
            className={s.paperTab}
            onClick={() => dispatch({ type: 'paper', mode: m })}
          >
            {label}
          </button>
        ))}
      </div>
      <div key={`${q.id}-${st.paper}`} className={s.paperBody}>
        {st.paper === 'organic' && <Organic q={q} />}
        {st.paper === 'ai' && <Answer q={q} />}
        {st.paper === 'compare' && <Compare q={q} />}
        {st.paper === 'outline' && <Outline q={q} dispatch={dispatch} />}
      </div>
      {st.paper !== 'outline' && (
        <footer className={s.paperFoot} data-x="move">
          <span>
            <b>Prepared:</b> {q.outline.title} · outline ready
          </span>
          <button type="button" className={s.paperBtn} onClick={() => dispatch({ type: 'paper', mode: 'outline' })}>
            See content plan
          </button>
        </footer>
      )}
    </div>
  );
}

function Organic({ q }: { q: Query }) {
  return (
    <>
      <p className={s.paperMeta}>Organic results · sample snapshot · {BRAND.window}</p>
      <ol className={s.serp}>
        {q.results.map((r) => {
          const you = r.by === 'you';
          return (
            <li key={r.pos} className={s.res} data-you={on(you)} data-x={you ? 'paper' : undefined}>
              <span className={s.resPos}>{r.pos}</span>
              <span className={s.resBody}>
                <span className={s.resPath}>{r.path}</span>
                <span className={s.resTitle}>{r.title}</span>
                <span className={s.resSnip}>{r.snippet}</span>
              </span>
            </li>
          );
        })}
        {q.yourPage && (
          <li className={s.res} data-gap="" data-x="paper">
            <span className={s.resPos}>{q.yours}</span>
            <span className={s.resBody}>
              <span className={s.resPath}>{q.yourPage.path}</span>
              <span className={s.resTitle}>{q.yourPage.title}</span>
              <span className={s.resSnip}>{q.yourPage.note}</span>
            </span>
          </li>
        )}
      </ol>
    </>
  );
}

function Answer({ q }: { q: Query }) {
  return (
    <>
      <p className={s.paperMeta}>AI answer · sample · {q.ai.sampled}</p>
      <div className={s.answer}>
        <p className={s.answerQ}>“{q.ai.question}”</p>
        <p className={s.answerA}>{q.ai.answer}</p>
      </div>
      <ul className={s.cites} aria-label="Sources cited in the answer">
        {q.ai.cited.map((c, i) => (
          <li key={c} data-you={on(c === 'you')} data-x={c === 'you' ? 'paper' : undefined}>
            <span>{i + 1}</span>
            {c === 'you' ? BRAND.domain : COMPETITORS[c].domain}
          </li>
        ))}
        {!q.ai.youCited && (
          <li data-missing="" data-x="paper">
            <span>–</span>
            {BRAND.domain} not cited
          </li>
        )}
      </ul>
      <p className={s.paperNote}>Being named in an AI answer is not the same as an organic ranking. Both are measured separately.</p>
    </>
  );
}

function Compare({ q }: { q: Query }) {
  const rival = COMPETITORS[q.rival];
  return (
    <>
      <p className={s.paperMeta}>
        Sample comparison for “{q.query}” · {rival.domain}
      </p>
      <table className={s.compare}>
        <thead>
          <tr>
            <th scope="col">
              <span className={s.sr}>Signal</span>
            </th>
            <th scope="col">{BRAND.name}</th>
            <th scope="col">{rival.name}</th>
          </tr>
        </thead>
        <tbody>
          {q.compare.map((r, i) => (
            <tr key={r.label} data-x={i === 0 ? 'paper' : undefined}>
              <th scope="row">{r.label}</th>
              <td>{r.you}</td>
              <td>{r.them}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Outline({ q, dispatch }: { q: Query; dispatch: Dispatch<Action> }) {
  return (
    <div className={s.outline}>
      <p className={s.paperMeta}>
        {q.outline.kind} · outline prepared · <b>not published</b>
      </p>
      <p className={s.outlineH1} data-x="paper">
        {q.outline.h1}
      </p>
      <ol className={s.outlineList}>
        {q.outline.sections.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <dl className={s.outlineDl}>
        {q.outline.details.map(([a, b]) => (
          <div key={a}>
            <dt>{a}</dt>
            <dd>{b}</dd>
          </div>
        ))}
      </dl>
      <div className={s.outlineFoot}>
        <span className={s.draftTag}>Draft · ready for your review</span>
        <button type="button" className={s.paperLink} onClick={() => dispatch({ type: 'paper', mode: 'organic' })}>
          Back to results
        </button>
        <button type="button" className={s.paperBtn} onClick={() => dispatch({ type: 'view', view: 'plan' })}>
          Plan the launch
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ growth plan */
function PlanPaper({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const a = audienceOf(st.audience);
  return (
    <div role="region" className={s.paper} data-mode="plan" aria-label="Prepared growth plan">
      <p className={s.paperMeta}>
        Prepared campaign · {PLAN.title} · <b>draft, not published</b>
      </p>
      <div className={s.audiences} role="radiogroup" aria-label="Audience" onKeyDown={rovingKeys}>
        {AUDIENCES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={x.id === a.id}
            tabIndex={x.id === a.id ? 0 : -1}
            className={s.aud}
            onClick={() => dispatch({ type: 'audience', id: x.id })}
          >
            <b>{x.name}</b>
            <small>{x.share}% of budget</small>
          </button>
        ))}
      </div>
      <div key={a.id} className={s.planBody}>
        <p className={s.planWho}>
          {a.who}. <b>Message:</b> {a.message}
        </p>
        <div className={s.creatives}>
          <div className={s.ad} data-x="paper">
            <span className={s.adTop}>
              <ToolMark id="gads" size={13} /> Sponsored · {BRAND.domain}
            </span>
            <b>{a.ad.headline}</b>
            <span>{a.ad.description}</span>
          </div>
          <div className={s.post}>
            <span className={s.adTop}>
              <ToolMark id="meta" size={13} /> {BRAND.name} · Sponsored
            </span>
            <span className={s.postArt} aria-hidden="true">
              <i />
            </span>
            <span className={s.postCopy}>{a.social}</span>
          </div>
        </div>
      </div>
      <ul className={s.channels} aria-label="Channels">
        {PLAN.channels.map((c) => (
          <li key={c.id}>
            {c.provider ? <ToolMark id={c.provider} size={15} /> : <i className={s.pageDot} aria-hidden="true" />}
            <span>{c.name}</span>
            <em>{c.cap}</em>
          </li>
        ))}
      </ul>
      <p className={s.exclusions}>Excluded searches: {PLAN.exclusions.map((x) => `“${x}”`).join(', ')}</p>
      <footer className={s.approval} data-x="move" data-on={on(st.approved)}>
        <span>
          <b>{st.approved ? 'Approved in this preview' : 'Needs your approval'}</b>
          {st.approved ? 'Recorded here only. Nothing was published, sent or spent.' : 'No spend, publishing or sending happens in this example.'}
        </span>
        <button type="button" className={s.paperBtn} data-tone="amber" aria-pressed={st.approved} onClick={() => dispatch({ type: 'approve' })}>
          {st.approved ? 'Undo' : 'Approve plan'}
        </button>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ conversions */
function FunnelPaper({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const src = sourceOf(st.source);
  const tot = totalFunnel();
  const max = tot[0];
  return (
    <div role="region" className={s.paper} data-mode="funnel" aria-label="Conversions by source">
      <p className={s.paperMeta}>Conversions by source · {CONVERSIONS.window}</p>
      <div className={s.sources} role="radiogroup" aria-label="Traffic source" onKeyDown={rovingKeys}>
        {SOURCES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={x.id === src.id}
            tabIndex={x.id === src.id ? 0 : -1}
            className={s.src}
            data-src={x.id}
            onClick={() => dispatch({ type: 'source', id: x.id })}
          >
            <i aria-hidden="true" />
            {x.name}
          </button>
        ))}
      </div>
      <div className={s.funnel} role="img" aria-label={STAGES.map((n, i) => `${n}: ${fmt(src.funnel[i])} of ${fmt(tot[i])}`).join('; ')}>
        {STAGES.map((n, i) => (
          <div key={n} className={s.step} data-x={i === 3 ? 'paper' : undefined}>
            <span className={s.stageName}>{n}</span>
            <span className={s.stageBar} aria-hidden="true">
              <i style={{ width: `${(tot[i] / max) * 100}%` }} />
              <b data-src={src.id} style={{ width: `${(src.funnel[i] / max) * 100}%` }} />
            </span>
            <span className={s.stageNum}>
              {fmt(src.funnel[i])}
              <small>of {fmt(tot[i])}</small>
            </span>
          </div>
        ))}
      </div>
      <p className={s.srcNote}>
        <b>
          {src.name}: {pct(src.funnel[3], src.funnel[0])} of visitors buy.
        </b>{' '}
        {src.note}
      </p>
      <footer className={s.paperFoot} data-x="move">
        <span>
          <b>Next:</b> {CONVERSIONS.friction.move}
        </span>
        <button type="button" className={s.paperLink} onClick={() => dispatch({ type: 'view', view: 'market' })}>
          Back to the market
        </button>
      </footer>
    </div>
  );
}
