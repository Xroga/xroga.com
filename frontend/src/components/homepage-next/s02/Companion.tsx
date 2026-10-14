'use client';

/**
 * An Xroga AI Employee: the founder's glass X character (face, white collar, navy tie with a gold clip), cut from
 * the original artwork and tinted once per role (docs/homepage-implementation/s02-employee-character-tint.py). Only
 * the glass changes colour; the eyes, mouth, tie, collar and clip stay the same on all six, so they read as one
 * team. Each role keeps its own 2-3 px idle signature, a soft role-coloured halo and a pedestal light.
 */
import type { CSSProperties } from 'react';
import type { Employee } from './team';
import c from './Companion.module.css';

export function Companion({
  e,
  size,
  state = 'idle',
  pedestal = false,
  className,
  style,
}: {
  e: Pick<Employee, 'art' | 'accent' | 'idle'>;
  size: number;
  /** idle: 2-3 px signature; active: lifted and lit; quiet: dimmed; working: a quicker, busier bob. */
  state?: 'idle' | 'active' | 'quiet' | 'working';
  pedestal?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`${c.companion} ${className ?? ''}`}
      data-idle={e.idle}
      data-state={state}
      style={{ '--size': `${size}px`, '--accent': e.accent, ...style } as CSSProperties}
      aria-hidden="true"
    >
      {pedestal && <span className={c.pedestal} />}
      <span className={c.halo} />
      <span className={c.body}>
        <img className={c.figure} src={`/homepage/s02/employees/x-${e.art}-${size > 120 ? 512 : 256}.webp`} alt="" width={size} height={size} draggable={false} />
      </span>
    </span>
  );
}
