'use client';

/**
 * S03.A — Search & Authority Studio. A specialist's workbench in three columns: what to look at (lenses), the work itself
 * (one stage that recomposes per lens), and the evidence with one next action (inspector). Providers appear under the
 * stage only for the lens they serve. On phones the inspector is a bottom sheet opened from the stage.
 */
import { useEffect, useRef, type Dispatch } from 'react';
import { COPY, LENSES, SITE } from './data';
import { rovingKeys } from './keys';
import { AiInspector, AiStage } from './search/Ai';
import { ContentInspector, ContentStage } from './search/Content';
import { HealthInspector, HealthStage } from './search/Health';
import { LinksInspector, LinksStage } from './search/Links';
import { LocalInspector, LocalStage } from './search/Local';
import { isDefault, type Action, type State } from './state';
import { NoTool, ToolChip } from './ui';
import s from './S03.module.css';

const ROLE: Record<string, Record<string, string>> = {
  health: { gsc: 'Index & crawl reports', semrush: 'Site audit' },
  content: { gsc: 'Your search queries', semrush: 'Keyword demand', ahrefs: 'Competitor pages' },
  links: { ahrefs: 'Link intersect', semrush: 'Backlink audit' },
  local: { gbp: 'Listing details', gsc: 'Local queries' },
};

export function SearchStudio({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const lens = LENSES.find((l) => l.id === st.lens)!;
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const open = st.sheet === 'search';

  // phone sheet: focus moves in on open and back to its opener on close
  useEffect(() => {
    if (!window.matchMedia('(max-width: 700px)').matches) return;
    if (open) sheet.current?.focus({ preventScroll: true });
    else if (document.activeElement === document.body) opener.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <section id="s03-search" className={s.chapter} data-chapter="search" aria-labelledby="s03-search-title">
      <header className={s.chHead}>
        <span className={s.chKicker}>
          <i aria-hidden="true" />
          {COPY.search.kicker}
        </span>
        <h3 id="s03-search-title" className={s.chTitle} tabIndex={-1}>
          {COPY.search.title}
        </h3>
        <p className={s.chLine}>{COPY.search.line}</p>
        <span className={s.chMeta}>
          <span className={s.example}>
            {COPY.disclosure} · {SITE.domain}
          </span>
          {!isDefault(st, 'search') && (
            <button type="button" className={s.linkBtn} data-quiet="" onClick={() => dispatch({ type: 'reset', chapter: 'search' })}>
              Start over
            </button>
          )}
        </span>
      </header>

      <div className={s.bench}>
        <nav className={s.lenses} aria-label="Search work">
          <div role="tablist" aria-orientation="vertical" aria-label="Search work" onKeyDown={rovingKeys}>
            {LENSES.map((l) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                id={`s03-lens-${l.id}`}
                aria-selected={l.id === st.lens}
                aria-controls="s03-lens-panel"
                tabIndex={l.id === st.lens ? 0 : -1}
                className={s.lens}
                data-lens={l.id}
                onClick={() => dispatch({ type: 'lens', lens: l.id })}
              >
                <i aria-hidden="true" />
                <span>
                  {l.label}
                  <small>{l.status}</small>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <div id="s03-lens-panel" role="tabpanel" aria-labelledby={`s03-lens-${st.lens}`} className={s.benchMain}>
          <div className={s.stage} data-lens={st.lens}>
            <div key={st.lens} className={s.scene}>
              {st.lens === 'health' && <HealthStage st={st} dispatch={dispatch} />}
              {st.lens === 'content' && <ContentStage st={st} dispatch={dispatch} />}
              {st.lens === 'ai' && <AiStage st={st} dispatch={dispatch} />}
              {st.lens === 'links' && <LinksStage st={st} dispatch={dispatch} />}
              {st.lens === 'local' && <LocalStage st={st} />}
            </div>
            <button
              ref={opener}
              type="button"
              className={s.evidenceBtn}
              aria-expanded={open}
              aria-controls="s03-search-inspector"
              onClick={() => dispatch({ type: 'set', patch: { sheet: open ? null : 'search' } })}
            >
              View evidence
            </button>
          </div>
          <div className={s.tools} aria-label={`Tools for ${lens.label}`}>
            <span className={s.toolsLabel}>{lens.discipline}</span>
            {lens.tools.length ? (
              lens.tools.map((id) => <ToolChip key={id} id={id} role={ROLE[st.lens]?.[id] ?? ''} chapter="search" st={st} dispatch={dispatch} />)
            ) : (
              <NoTool>No AI-answer data provider is in Xroga’s directory yet; these answers were sampled by hand.</NoTool>
            )}
          </div>
        </div>

        <aside
          ref={sheet}
          id="s03-search-inspector"
          className={s.inspector}
          data-open={open || undefined}
          tabIndex={-1}
          aria-label={`${lens.label} evidence`}
          aria-live="polite"
        >
          <div key={`${st.lens}`} className={s.insBody}>
            {st.lens === 'health' && <HealthInspector st={st} dispatch={dispatch} />}
            {st.lens === 'content' && <ContentInspector st={st} dispatch={dispatch} />}
            {st.lens === 'ai' && <AiInspector st={st} dispatch={dispatch} />}
            {st.lens === 'links' && <LinksInspector st={st} dispatch={dispatch} />}
            {st.lens === 'local' && <LocalInspector st={st} dispatch={dispatch} />}
          </div>
          <button type="button" className={s.sheetClose} onClick={() => dispatch({ type: 'set', patch: { sheet: null } })}>
            Close
          </button>
        </aside>
        {open && (
          <button
            type="button"
            className={s.scrim}
            aria-label="Close evidence"
            tabIndex={-1}
            onClick={() => dispatch({ type: 'set', patch: { sheet: null } })}
          />
        )}
      </div>
    </section>
  );
}
