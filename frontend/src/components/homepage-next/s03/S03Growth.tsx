'use client';

/**
 * S03 — Search & Growth. The sample market of one invented shop (Morrow Supply) shown as a Search Terrain: demand
 * drawn as data, the selected search printed on warm paper, the reason it matters, and the prepared move. The same
 * room then shows a growth plan (draft, behind an approval boundary) and conversions by source. Visitors explore
 * it directly: nothing autoplays. One entrance plays once when the section is first reached, never under reduced
 * motion, and the Xroga trace re-draws only when a selection changes.
 */
import Link from 'next/link';
import { useEffect, useReducer, useRef, useState, type CSSProperties, type Dispatch } from 'react';
import { useReducedMotion } from 'motion/react';
import { BRAND, CONVERSIONS, COPY, PLAN, TOOLS, audienceOf, fmt, kfmt, queryOf, toolOf, totalFunnel, type View } from './data';
import { ToolMark, hasMark } from './marks';
import { initialState, isDefault, reducer, traceKey, type Action, type State } from './state';
import { Terrain } from './Terrain';
import { Paper } from './Paper';
import { Trace } from './Trace';
import s from './S03.module.css';

const VIEWS: View[] = ['market', 'plan', 'conversions'];
const GROUPS = ['Discover', 'Understand', 'Reach'] as const;

export function S03Growth({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [st, dispatch] = useReducer(reducer, undefined, initialState);
  const reduced = !!useReducedMotion();
  // the entrance is armed only when the section starts below the fold, and plays once when reached
  const [entry, setEntry] = useState<'none' | 'armed' | 'played'>('none');

  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.75) return;
    setEntry('armed');
    const play = () => {
      setEntry('played');
      io.disconnect();
      el.removeEventListener('focusin', play);
      el.removeEventListener('pointerdown', play);
    };
    // plays when the section's top crosses 75% of the viewport, whatever the section's height
    const io = new IntersectionObserver(([e]) => e.isIntersecting && play(), { rootMargin: '0px 0px -25% 0px', threshold: 0 });
    io.observe(el);
    // never leave content hidden from someone already using it
    el.addEventListener('focusin', play);
    el.addEventListener('pointerdown', play);
    return () => {
      io.disconnect();
      el.removeEventListener('focusin', play);
      el.removeEventListener('pointerdown', play);
    };
  }, [reduced]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && el.contains(document.activeElement)) dispatch({ type: 'escape' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onTabKey = (ev: React.KeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? VIEWS.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length;
    dispatch({ type: 'view', view: VIEWS[n] });
    tabs.current[n]?.focus({ preventScroll: true });
  };

  const explore = () => {
    dispatch({ type: 'next-query' });
    requestAnimationFrame(() => (stage.current?.querySelector('[role="radio"][aria-checked="true"]') as HTMLElement | null)?.focus({ preventScroll: true }));
  };

  const tool = st.tool ? toolOf(st.tool) : null;

  return (
    <section
      ref={root}
      id="s03"
      className={s.section}
      aria-labelledby="s03-title"
      data-view={st.view}
      data-entry={entry}
      data-why={st.why || undefined}
      data-reduced={reduced || undefined}
    >
      <div className={s.atmos} aria-hidden="true" />
      <div className={s.inner}>
        <header className={s.head}>
          <div className={s.lead}>
            <p className={s.eyebrow}>{COPY.eyebrow}</p>
            <h2 id="s03-title" className={s.title}>
              {COPY.title}
            </h2>
          </div>
          <div className={s.side}>
            <p className={s.lede}>{COPY.lede}</p>
            <div className={s.ctas}>
              <Link href={loggedIn ? '/workspace' : '/auth/signup'} className={s.cta}>
                {COPY.cta}
                <Arrow />
              </Link>
              <button type="button" className={s.ctaGhost} onClick={explore}>
                {COPY.explore}
              </button>
            </div>
          </div>
        </header>

        <div ref={stage} className={s.stage} data-view={st.view}>
          <Terrain view={st.view} query={st.query} audience={st.audience} onSelect={(id) => dispatch({ type: 'query', id })} />

          <div className={s.lens}>
            <span className={s.brand}>
              <i aria-hidden="true" />
              <span>
                <b>{BRAND.name}</b>
                <small>Sample shop · {BRAND.sells}</small>
              </span>
            </span>
            <div className={s.views} role="tablist" aria-label="Explore this market">
              {VIEWS.map((v, i) => (
                <button
                  key={v}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`s03-tab-${v}`}
                  aria-selected={st.view === v}
                  aria-controls="s03-panel"
                  tabIndex={st.view === v ? 0 : -1}
                  className={s.viewTab}
                  onClick={() => dispatch({ type: 'view', view: v })}
                  onKeyDown={(ev) => onTabKey(ev, i)}
                >
                  {COPY.views[v]}
                </button>
              ))}
            </div>
          </div>

          <div id="s03-panel" role="tabpanel" aria-labelledby={`s03-tab-${st.view}`} className={s.work}>
            <Insight st={st} dispatch={dispatch} />
            <div className={s.paperWrap}>
              <Paper st={st} dispatch={dispatch} />
            </div>
          </div>

          <Trace stage={stage} trace={traceKey(st)} />

          {!isDefault(st) && (
            <button
              type="button"
              className={s.reset}
              onClick={() => {
                dispatch({ type: 'reset' });
                // the button leaves with the state it undoes; keep focus in the section
                requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
              }}
            >
              Back to overview
            </button>
          )}
        </div>

        <p className={s.launch}>{COPY.launch}</p>

        <div className={s.tools}>
          <div className={s.toolsCopy}>
            <h3>{COPY.toolsTitle}</h3>
            <p>{COPY.toolsLede}</p>
            <Link href="/integrations" className={s.toolsLink}>
              {COPY.toolsLink}
              <Arrow />
            </Link>
          </div>
          <div className={s.groups}>
            {GROUPS.map((g) => (
              <div key={g} className={s.group} role="group" aria-label={g}>
                <span className={s.groupName}>{g}</span>
                <div className={s.groupTools}>
                  {TOOLS.filter((t) => t.group === g).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={s.tool}
                      aria-expanded={st.tool === t.id}
                      aria-controls="s03-tool"
                      onClick={() =>
                        dispatch({
                          type: 'tool',
                          id: st.tool === t.id ? null : t.id,
                        })
                      }
                    >
                      <span className={s.toolMark} data-text={hasMark(t.id) ? undefined : ''}>
                        {hasMark(t.id) ? <ToolMark id={t.id} size={24} /> : t.name}
                      </span>
                      <span className={s.toolText}>
                        <b>{t.name}</b>
                        <small>{t.role}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div id="s03-tool" className={s.toolDetail} hidden={!tool}>
            {tool && (
              <>
                <div className={s.tdHead}>
                  <span className={s.toolMark} data-text={hasMark(tool.id) ? undefined : ''} style={{ '--sz': '40px' } as CSSProperties}>
                    {hasMark(tool.id) ? <ToolMark id={tool.id} size={26} /> : tool.name}
                  </span>
                  <div>
                    <b>{tool.name}</b>
                    <span className={s.tdStatus}>Example tool · connection required · not connected here</span>
                  </div>
                  <button type="button" className={s.textBtn} onClick={() => dispatch({ type: 'tool', id: null })}>
                    Close
                  </button>
                </div>
                <div className={s.tdBody}>
                  <div>
                    <span className={s.tdLabel}>What Xroga could do with it</span>
                    <ul>
                      {tool.could.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className={s.tdLabel}>What it needs</span>
                    <p>Your authorization for your own account. Anything that publishes, spends or sends waits for your approval.</p>
                    <span className={s.tdLabel}>Xroga integrations directory</span>
                    <p>{tool.catalog ? `Listed as “${tool.catalog}”.` : 'Not listed yet. Shown as an example of a growth tool.'}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <p className={s.disclosure}>{COPY.disclosure}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------- the insight card */
function Insight({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  if (st.view === 'plan') {
    const a = audienceOf(st.audience);
    return (
      <aside className={s.card} data-x="card" data-tone="warm" aria-label="Why this plan">
        <span className={s.cardKicker}>Growth plan · from the weekend backpack opening</span>
        <p className={s.cardTitle}>Show up for people already searching, then for people like them.</p>
        <p className={s.cardBody}>
          {a.name}: {a.who.toLowerCase()}. They search for {a.searches.map((x) => `“${x}”`).join(' and ')}.
        </p>
        <dl className={s.metrics}>
          <div>
            <dt>Audiences</dt>
            <dd>3</dd>
          </div>
          <div>
            <dt>Paid cap</dt>
            <dd>$65/day</dd>
          </div>
          <div>
            <dt>Channels</dt>
            <dd>{PLAN.channels.length}</dd>
          </div>
        </dl>
        <p className={s.cardFine}>Prepared, not published. Ad and email accounts are not connected in this example.</p>
      </aside>
    );
  }
  if (st.view === 'conversions') {
    const t = totalFunnel();
    const f = CONVERSIONS.friction;
    return (
      <aside className={s.card} data-x="card" data-tone="mint" aria-label="Next best improvement">
        <span className={s.cardKicker}>Next best improvement</span>
        <p className={s.cardTitle}>{f.title}</p>
        <p className={s.cardBody}>{f.body}</p>
        <dl className={s.metrics}>
          <div>
            <dt>Visitors</dt>
            <dd>{kfmt(t[0])}</dd>
          </div>
          <div>
            <dt>Purchases</dt>
            <dd>{fmt(t[3])}</dd>
          </div>
          <div>
            <dt>Purchase rate</dt>
            <dd>{((t[3] / t[0]) * 100).toFixed(1)}%</dd>
          </div>
        </dl>
        <p className={s.cardFine}>{f.forecast}</p>
      </aside>
    );
  }
  const q = queryOf(st.query);
  return (
    <aside className={s.card} data-x="card" data-tone={q.tone} aria-label="Selected opportunity">
      <span className={s.cardKicker}>
        Opportunity · <em data-tone={q.tone}>{q.status}</em>
      </span>
      <p className={s.cardTitle}>{q.insight.headline}</p>
      {st.why ? (
        <div className={s.why}>
          <ul className={s.evidence} aria-label="Evidence">
            {q.evidence.map(([src, d, date]) => (
              <li key={src + d}>
                <b>{src}</b>
                <span>{d}</span>
                <time>{date}</time>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <p className={s.cardBody}>{q.insight.body}</p>
          <dl className={s.metrics}>
            <div>
              <dt>Demand</dt>
              <dd>{kfmt(q.volume)}/mo</dd>
            </div>
            <div>
              <dt>Difficulty</dt>
              <dd>{q.difficulty}/100</dd>
            </div>
            <div>
              <dt>Your position</dt>
              <dd>{q.yours ?? '—'}</dd>
            </div>
          </dl>
        </>
      )}
      <div className={s.cardActions}>
        <button type="button" className={s.textBtn} aria-expanded={st.why} onClick={() => dispatch({ type: 'why', open: !st.why })}>
          {st.why ? 'Hide evidence' : 'Why it matters'}
        </button>
        <button type="button" className={s.textBtn} onClick={() => dispatch({ type: 'view', view: 'conversions' })}>
          See conversions
        </button>
      </div>
    </aside>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={s.arrow}>
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}
