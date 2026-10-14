'use client';

/**
 * World D, the growth stack: real provider marks in three groups. Selecting one opens a compact detail in a fixed
 * slot beside the marks (a bottom sheet on phones): what Xroga could do with it, what it needs, and its honest status.
 * Nothing is connected here.
 */
import Link from 'next/link';
import { useEffect, useRef, type Dispatch } from 'react';
import { COPY, GROUPS, TOOLS, toolOf } from './data';
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

  return (
    <div className={s.stack} data-stack="" data-open={tool ? '' : undefined}>
      <div className={s.stackCopy}>
        <h3>{COPY.stackTitle}</h3>
        <p>{COPY.stackLede}</p>
        <Link href="/integrations" className={s.textLink}>
          {COPY.stackLink}
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
          </svg>
        </Link>
      </div>

      <div className={s.marks}>
        {GROUPS.map((g) => (
          <div key={g} className={s.markGroup} role="group" aria-label={g}>
            <span className={s.label}>{g}</span>
            <div className={s.markRow}>
              {TOOLS.filter((t) => t.group === g).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={s.mark}
                  aria-expanded={st.tool === t.id}
                  aria-controls="s03-tool"
                  onClick={(ev) => {
                    opener.current = ev.currentTarget;
                    dispatch({ type: 'tool', id: st.tool === t.id ? null : t.id });
                  }}
                >
                  <span className={s.markIcon} data-text={!hasMark(t.id) || undefined}>
                    {hasMark(t.id) ? <ToolMark id={t.id} size={22} /> : t.name}
                  </span>
                  <span className={s.markName}>{t.name}</span>
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
        aria-label={tool ? `${tool.name} with Xroga` : undefined}
        aria-live="polite"
      >
        {tool ? (
          <div key={tool.id} className={s.toolBody}>
            <div className={s.toolHead}>
              <span className={s.markIcon} data-text={!hasMark(tool.id) || undefined}>
                {hasMark(tool.id) ? <ToolMark id={tool.id} size={22} /> : tool.name}
              </span>
              <span>
                <b>{tool.name}</b>
                <small>Not connected · connection required</small>
              </span>
              <button
                type="button"
                className={s.closeBtn}
                data-tone="dark"
                onClick={() => dispatch({ type: 'tool', id: null })}
                aria-label={`Close ${tool.name}`}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
            <ul className={s.could}>
              {tool.could.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className={s.needs}>
              <small>Needs</small> {tool.needs}
            </p>
            <p className={s.needs}>
              <small>Directory</small> {tool.catalog ? `Listed as “${tool.catalog}”` : 'Not listed yet'}
            </p>
          </div>
        ) : (
          <p className={s.toolHint}>Select a tool to see what Xroga could do with it.</p>
        )}
      </div>
      {tool && <button type="button" className={s.scrim} aria-label="Close" tabIndex={-1} onClick={() => dispatch({ type: 'tool', id: null })} />}
    </div>
  );
}
