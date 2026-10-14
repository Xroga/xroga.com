'use client';

/**
 * The growth stack, grouped by the job each service does in the journey: discover, reach, measure. Choosing one says
 * what it would contribute, lights its step in the journey above, and states its honest status (listed in Xroga's
 * integrations directory, or not confirmed). Nothing connects from here. On phones the detail is a bottom sheet.
 */
import Link from 'next/link';
import { useEffect, useRef, type Dispatch } from 'react';
import { COPY, PERSPECTIVES, STACK_GROUPS, TOOLS, toolOf } from './data';
import { ToolMark, hasMark } from './marks';
import type { Action, State } from './state';
import s from './S03.module.css';

export function Stack({ st, dispatch }: { st: State; dispatch: Dispatch<Action> }) {
  const tool = st.tool ? toolOf(st.tool) : null;
  const detail = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  // on phones the detail is a sheet: move focus into it, and back to its tile when it closes
  useEffect(() => {
    if (!window.matchMedia('(max-width: 700px)').matches) return;
    if (tool) detail.current?.focus({ preventScroll: true });
    else opener.current?.focus({ preventScroll: true });
  }, [tool]);

  const step = tool ? PERSPECTIVES.find((p) => p.id === tool.step)! : null;

  return (
    <div className={s.stack} data-stack="" data-open={tool ? '' : undefined}>
      <div className={s.stackHead}>
        <h3>{COPY.stackTitle}</h3>
        <Link href="/integrations" className={s.textLink}>
          {COPY.stackLink}
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
          </svg>
        </Link>
      </div>
      <div className={s.groups}>
        {STACK_GROUPS.map((g) => (
          <div key={g.step} className={s.group} data-step={g.step} data-lit={tool?.step === g.step || undefined}>
            <span className={s.groupLabel}>{g.label}</span>
            <div className={s.tiles}>
              {TOOLS.filter((t) => t.step === g.step).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={s.tile}
                  aria-expanded={st.tool === t.id}
                  aria-controls="s03-tool"
                  onClick={(ev) => {
                    opener.current = ev.currentTarget;
                    dispatch({ type: 'tool', id: st.tool === t.id ? null : t.id });
                  }}
                >
                  <span className={s.tileIcon} data-text={!hasMark(t.id) || undefined}>
                    {hasMark(t.id) ? <ToolMark id={t.id} size={22} /> : t.name.toLowerCase()}
                  </span>
                  <span className={s.tileName}>{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        ref={detail}
        id="s03-tool"
        className={s.toolDetail}
        tabIndex={-1}
        role={tool ? 'dialog' : undefined}
        aria-label={tool ? `${tool.name} in the journey` : undefined}
        aria-live="polite"
      >
        {tool && step ? (
          <div key={tool.id} className={s.toolBody}>
            <span className={s.toolLine}>
              <b>{tool.name}</b>
              <span className={s.toolArrow} aria-hidden="true">
                →
              </span>
              <span>
                {step.label} · {tool.role}
              </span>
            </span>
            <code className={s.toolExample}>{tool.example}</code>
            <small className={s.toolStatus} data-listed={tool.catalog ? '' : undefined}>
              {tool.catalog ? `Listed in integrations as “${tool.catalog}” · connection required` : 'Integration not confirmed · shown as an example'}
            </small>
            <span className={s.toolActions}>
              {st.p !== tool.step && (
                <button type="button" className={s.linkBtn} onClick={() => dispatch({ type: 'p', p: tool.step })}>
                  Show it in {step.label}
                </button>
              )}
              <button type="button" className={s.closeBtn} onClick={() => dispatch({ type: 'tool', id: null })} aria-label={`Close ${tool.name}`}>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
            </span>
          </div>
        ) : (
          <p className={s.toolHint}>Choose a service to see where it works in the journey.</p>
        )}
      </div>
      {tool && <button type="button" className={s.scrim} aria-label="Close" tabIndex={-1} onClick={() => dispatch({ type: 'tool', id: null })} />}
    </div>
  );
}
