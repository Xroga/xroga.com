'use client';

/**
 * World A, Search demand: a compact result sheet for the chosen search (organic or AI answer) and one short insight
 * on the terrain. Evidence and the competitor comparison open only on request, in the sheet's own place, so the
 * landscape is never covered by prose.
 */
import type { Dispatch } from 'react';
import { AI_SAMPLES, AUDIENCES, BRAND, COMPETITORS, GSC_WINDOW, kfmt, queryOf, type Query } from './data';
import { rovingKeys } from './keys';
import type { Action, State } from './state';
import s from './S03.module.css';

const domainOf = (by: string) => (by === 'you' ? BRAND.domain : COMPETITORS[by].domain);
const audienceFor = (q: Query) => (AUDIENCES.find((a) => a.from === q.id) ?? AUDIENCES[0]).id;

export function Discover({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const q = queryOf(st.query);
  const cited = q.ai.cited.includes('you');
  const mentions = q.compare.find((c) => c.label === 'AI mentions')?.you ?? `0 of ${AI_SAMPLES}`;
  return (
    <div className={s.discover}>
      <aside className={s.insight} data-tone={q.tone} aria-label="Selected opportunity" aria-live="polite">
        <span className={s.kicker} data-tone={q.tone}>
          <i aria-hidden="true" />
          {q.status}
        </span>
        <p className={s.insightTitle}>{q.headline}</p>
        <dl className={s.figures}>
          <div>
            <dt>Searches</dt>
            <dd>{kfmt(q.volume)}/mo</dd>
          </div>
          <div>
            <dt>Your rank</dt>
            <dd>#{q.yours}</dd>
          </div>
          <div>
            <dt>AI mentions</dt>
            <dd>{mentions}</dd>
          </div>
        </dl>
        <div className={s.insightActions}>
          <button
            type="button"
            className={s.solidBtn}
            aria-expanded={st.layer === 'evidence'}
            aria-controls="s03-sheet"
            onClick={() => dispatch({ type: 'layer', layer: st.layer === 'evidence' ? null : 'evidence' })}
          >
            See opportunity
          </button>
          <button
            type="button"
            className={s.quietBtn}
            aria-expanded={st.layer === 'compare'}
            aria-controls="s03-sheet"
            onClick={() => dispatch({ type: 'layer', layer: st.layer === 'compare' ? null : 'compare' })}
          >
            Compare
          </button>
        </div>
      </aside>

      <div className={s.sheetWrap}>
        <div id="s03-sheet" role="region" aria-label={`Search results for ${q.query}`} className={s.sheet} data-layer={st.layer ?? 'results'}>
          <div className={s.queryBar}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.6" />
              <path d="m10.4 10.4 3.4 3.4" />
            </svg>
            <span>{q.query}</span>
            <em>{q.intent}</em>
          </div>

          {st.layer === 'evidence' || st.layer === 'compare' ? (
            <Layer q={q} st={st} dispatch={dispatch} />
          ) : (
            <>
              <div className={s.lensTabs} role="tablist" aria-label="Where people find answers" onKeyDown={rovingKeys}>
                {(
                  [
                    ['organic', 'Search results'],
                    ['ai', 'AI answer'],
                  ] as const
                ).map(([l, label]) => (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={st.lens === l}
                    tabIndex={st.lens === l ? 0 : -1}
                    className={s.lensTab}
                    data-lens={l}
                    onClick={() => dispatch({ type: 'lens', lens: l })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div key={`${q.id}-${st.lens}`} className={s.sheetBody}>
                {st.lens === 'organic' ? (
                  <ol className={s.results}>
                    {q.results.map((r) => (
                      <li key={r.pos} data-you={r.by === 'you' || undefined} data-anchor={r.by === 'you' ? 'paper' : undefined}>
                        <span className={s.pos}>{r.pos}</span>
                        <span className={s.resText}>
                          <small>{domainOf(r.by)}</small>
                          <b>{r.title}</b>
                          <em>{r.note}</em>
                        </span>
                      </li>
                    ))}
                    {q.you && (
                      <li data-you="" data-gap="" data-anchor="paper">
                        <span className={s.pos}>{q.yours}</span>
                        <span className={s.resText}>
                          <small>{BRAND.domain}</small>
                          <b>{q.you.title}</b>
                          <em>{q.you.note}</em>
                        </span>
                      </li>
                    )}
                  </ol>
                ) : (
                  <div className={s.answer}>
                    <p className={s.answerQ}>“{q.ai.question}”</p>
                    <ul className={s.cites} aria-label="Sources named in the answer">
                      {q.ai.cited.map((c) => (
                        <li key={c} data-you={c === 'you' || undefined} data-anchor={c === 'you' ? 'paper' : undefined}>
                          {domainOf(c)}
                        </li>
                      ))}
                      {!cited && (
                        <li data-missing="" data-anchor="paper">
                          {BRAND.domain} <span>not named</span>
                        </li>
                      )}
                    </ul>
                    <p className={s.fine}>Asked {AI_SAMPLES} times · sample · 11–12 Oct. Being named is measured apart from ranking.</p>
                  </div>
                )}
              </div>
            </>
          )}

          <footer className={s.sheetFoot}>
            <span>
              <small>Next move</small>
              <b>{q.move}</b>
            </span>
            <button
              type="button"
              className={s.solidBtn}
              data-tone="ink"
              onClick={() => {
                dispatch({ type: 'audience', id: audienceFor(q) });
                dispatch({ type: 'world', world: 'campaigns' });
              }}
            >
              Plan campaign
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

function Layer({ q, st, dispatch }: { q: Query; st: State; dispatch: Dispatch<Action> }) {
  const rival = COMPETITORS[q.rival];
  return (
    <div className={s.layer} role="group" aria-label={st.layer === 'evidence' ? 'Why this matters' : `Compared with ${rival.name}`}>
      <div className={s.layerHead}>
        <b>{st.layer === 'evidence' ? 'Why this matters' : `You vs. ${rival.name}`}</b>
        <button type="button" className={s.closeBtn} onClick={() => dispatch({ type: 'layer', layer: null })} aria-label="Close and return to results">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      {st.layer === 'evidence' ? (
        <>
          <ul className={s.evidence}>
            {q.evidence.map(([src, d, date]) => (
              <li key={src + d}>
                <b>{src}</b>
                <span>{d}</span>
                <time>{date}</time>
              </li>
            ))}
          </ul>
          <p className={s.fine}>
            Sample figures for {BRAND.window}. Search Console window {GSC_WINDOW}. Sources show where each figure would come from once connected.
          </p>
        </>
      ) : (
        <table className={s.compare}>
          <thead>
            <tr>
              <th scope="col">
                <span className={s.sr}>Signal</span>
              </th>
              <th scope="col">You</th>
              <th scope="col">{rival.name}</th>
            </tr>
          </thead>
          <tbody>
            {q.compare.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.you}</td>
                <td>{r.them}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
