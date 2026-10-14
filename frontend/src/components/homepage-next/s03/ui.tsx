'use client';

/** Small shared controls for both S03 chapters: a segmented radiogroup and the contextual provider chip. */
import Link from 'next/link';
import type { Dispatch, ReactNode } from 'react';
import { AVAILABILITY_LABEL, TOOLS, availability, type ToolId } from './data';
import { rovingKeys } from './keys';
import { ToolMark, hasMark } from './marks';
import type { Action, Chapter, State } from './state';
import s from './S03.module.css';

export function Seg<T extends string>({
  label,
  value,
  options,
  onPick,
  small,
}: {
  label: string;
  value: T;
  options: { id: T; label: ReactNode }[];
  onPick: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={s.seg} data-small={small || undefined} role="radiogroup" aria-label={label} onKeyDown={rovingKeys}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} tabIndex={o.id === value ? 0 : -1} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A provider named beside the work it supports: mark, role, honest availability, and a short note on request. */
export function ToolChip({ id, role, chapter, st, dispatch }: { id: ToolId; role: string; chapter: Chapter; st: State; dispatch: Dispatch<Action> }) {
  const t = TOOLS[id];
  const open = st.tool?.chapter === chapter && st.tool.id === id;
  const a = availability(t);
  return (
    <span className={s.toolWrap}>
      <button
        type="button"
        className={s.tool}
        data-avail={a}
        aria-expanded={open}
        aria-controls={`s03-tool-${chapter}`}
        onClick={() => dispatch({ type: 'tool', chapter, id: open ? null : id })}
      >
        <span className={s.toolIcon} data-text={!hasMark(id) || undefined}>
          {hasMark(id) ? <ToolMark id={id} size={16} /> : t.name.split(' ')[0].toLowerCase()}
        </span>
        <span className={s.toolText}>
          <b>{t.name}</b>
          <small>{role}</small>
        </span>
      </button>
      {open && (
        <span id={`s03-tool-${chapter}`} className={s.toolPop} role="note">
          <b>{t.name}</b>
          <span>{t.reads}.</span>
          <small data-avail={a}>{AVAILABILITY_LABEL[a]}</small>
          {t.catalog && (
            <Link href="/integrations" className={s.popLink}>
              Listed as “{t.catalog}”
            </Link>
          )}
        </span>
      )}
    </span>
  );
}

/** Rendered instead of provider chips where Xroga's directory has no matching provider. */
export function NoTool({ children }: { children: ReactNode }) {
  return <span className={s.noTool}>{children}</span>;
}
