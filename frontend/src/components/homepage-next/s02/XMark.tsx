/**
 * An Xroga employee companion: the authentic Xroga X (cut from the brand glass X), lit in its role colour.
 * Six states, all driven by the script: ready (still), assigned (a light runs along the strokes), working (a
 * quiet inner glow), handoff (leans toward the recipient), approval (warm halt outline), done (settled, checked).
 * Decorative: the name and state are always given as text beside it.
 */
import Image from 'next/image';
import type { EmployeeId, XState } from './script';
import x from './XMark.module.css';

export function XMark({ id, size, state = 'ready', focus, float = true, lean = 0 }: { id: EmployeeId; size: number; state?: XState; focus?: boolean; float?: boolean; lean?: number }) {
  return (
    <span
      className={x.mark}
      data-id={id}
      data-state={state}
      data-focus={focus || undefined}
      data-float={float || undefined}
      style={{ '--size': `${size}px`, '--lean': `${lean}deg` } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className={x.halo} />
      <span className={x.body}>
        <Image unoptimized className={x.img} src={`/homepage/s02/x-${id}.webp`} alt="" width={size} height={size} draggable={false} />
        <span className={x.sweep} style={{ WebkitMaskImage: `url(/homepage/s02/x-${id}.webp)`, maskImage: `url(/homepage/s02/x-${id}.webp)` }} />
      </span>
      <span className={x.floor} />
      {state === 'done' && <span className={x.check}>✓</span>}
    </span>
  );
}

/** The central Xroga identity: the full glass orb, used sparingly. */
export function XrogaCore({ size }: { size: number }) {
  return (
    <span className={x.core} style={{ '--size': `${size}px` } as React.CSSProperties} aria-hidden="true">
      <span className={x.coreGlow} />
      <Image unoptimized src="/homepage/s02/core.webp" alt="" width={size} height={size} draggable={false} />
    </span>
  );
}
