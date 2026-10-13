'use client';

/**
 * An Xroga AI Employee: the authentic glass X orb (cut from the founder's original artwork, never redrawn), a
 * glass rim tinted in the role colour, a crisp shirt collar on the lower glass and a crafted miniature tie in one
 * of six cuts. The tie is a dark silk in the role's hue with a single accent stitch and a specular edge; it hangs
 * below the orb and never covers the X. Idle motion is a 2-3 px signature per role.
 */
import type { CSSProperties } from 'react';
import type { Employee } from './script';
import c from './Companion.module.css';

type Tie = Employee['tie'];

/** The outfit is drawn in a 100 × 80 box laid over the lower glass: 1 unit = 1% of the orb's diameter. The shirt
 *  collar sits on the lower rim (below the X), the knot between its points, and the blade hangs past the orb. */
const BLADE: Record<Exclude<Tie, 'bow'>, string> = {
  slim: 'M46.9 24.5 L53.1 24.5 L57.4 57.5 L50 64 L42.6 57.5 Z',
  striped: 'M46.2 24.5 L53.8 24.5 L60.2 56.5 L50 64.5 L39.8 56.5 Z',
  dotted: 'M46.2 24.5 L53.8 24.5 L60.2 56.5 L50 64.5 L39.8 56.5 Z',
  knit: 'M46.6 24.5 L53.4 24.5 L56.6 61.5 L43.4 61.5 Z',
  clip: 'M46.2 24.5 L53.8 24.5 L60.4 57 L50 65 L39.6 57 Z',
};
const KNOT = 'M44.6 14.5 L55.4 14.5 L53.6 25 L46.4 25 Z';
const WINGS = 'M50 17.5 L33.5 6.2 Q31.4 5.2 31.9 7.8 L35.2 23.4 Z M50 17.5 L66.5 6.2 Q68.6 5.2 68.1 7.8 L64.8 23.4 Z';

function Outfit({ tie, id }: { tie: Tie; id: string }) {
  const silk = `url(#${id}-silk)`;
  const collar = (
    <g>
      <path d={WINGS} fill={`url(#${id}-shirt)`} stroke="rgba(10,14,24,0.55)" strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M34 8.4 L48 17.6 M66 8.4 L52 17.6" stroke="#fff" strokeOpacity="0.75" strokeWidth="0.5" />
    </g>
  );
  return (
    <svg className={c.outfit} viewBox="0 0 100 80" aria-hidden="true">
      <defs>
        {/* dark silk in the role hue, lit from the upper left */}
        <linearGradient id={`${id}-silk`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="var(--tie-hi)" />
          <stop offset="0.45" stopColor="var(--tie-mid)" />
          <stop offset="1" stopColor="var(--tie-lo)" />
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.38" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-shirt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c3cad8" />
        </linearGradient>
        <pattern id={`${id}-stripe`} width="4.4" height="4.4" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <rect width="1.5" height="4.4" fill="var(--accent)" opacity="0.9" />
        </pattern>
        <pattern id={`${id}-dot`} width="3.8" height="3.8" patternUnits="userSpaceOnUse">
          <circle cx="1.9" cy="1.9" r="0.8" fill="var(--accent)" opacity="0.95" />
        </pattern>
        <pattern id={`${id}-knit`} width="3" height="2.1" patternUnits="userSpaceOnUse">
          <rect width="3" height="0.75" fill="#000" opacity="0.3" />
        </pattern>
        <clipPath id={`${id}-blade`}>
          <path d={tie === 'bow' ? '' : BLADE[tie]} />
        </clipPath>
      </defs>
      {tie === 'bow' ? (
        <g>
          {collar}
          <g className={c.tie}>
            <path d="M50 17 L36.5 9.6 Q33.6 8.4 33.6 11.6 L33.6 22.4 Q33.6 25.6 36.5 24.4 Z" fill={silk} />
            <path d="M50 17 L63.5 9.6 Q66.4 8.4 66.4 11.6 L66.4 22.4 Q66.4 25.6 63.5 24.4 Z" fill={silk} />
            <path d="M37 11.6 L47.5 17 M63 11.6 L52.5 17" stroke="var(--accent)" strokeWidth="0.7" strokeOpacity="0.95" />
            <rect x="46.4" y="13.2" width="7.2" height="7.6" rx="1.8" fill="var(--tie-mid)" stroke="var(--accent)" strokeWidth="0.6" />
            <path d="M34.6 11 Q35 9.8 36.4 10.4" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.6" fill="none" />
          </g>
        </g>
      ) : (
        <g>
          <g className={c.tie}>
            <path d={BLADE[tie]} fill={silk} />
            {tie === 'striped' && <rect x="30" y="20" width="40" height="46" fill={`url(#${id}-stripe)`} clipPath={`url(#${id}-blade)`} />}
            {tie === 'dotted' && <rect x="30" y="20" width="40" height="46" fill={`url(#${id}-dot)`} clipPath={`url(#${id}-blade)`} />}
            {tie === 'knit' && <rect x="30" y="20" width="40" height="46" fill={`url(#${id}-knit)`} clipPath={`url(#${id}-blade)`} />}
            {/* one accent stitch down the centre, and the specular edge */}
            {(tie === 'slim' || tie === 'clip' || tie === 'knit') && (
              <path d="M50 28 L50 57" stroke="var(--accent)" strokeWidth="0.6" strokeOpacity="0.95" strokeDasharray="1.6 1.2" />
            )}
            <path d={BLADE[tie]} fill={`url(#${id}-sheen)`} />
            {tie === 'clip' && <rect x="39" y="38" width="22" height="2.4" rx="1.2" fill={`url(#${id}-ti)`} className={c.clip} />}
          </g>
          <path d={KNOT} fill="var(--tie-mid)" />
          <path d={KNOT} fill={`url(#${id}-sheen)`} />
          {collar}
        </g>
      )}
      <defs>
        <linearGradient id={`${id}-ti`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6f7684" />
          <stop offset="0.45" stopColor="#f1f4f8" />
          <stop offset="0.6" stopColor="#aeb5c1" />
          <stop offset="1" stopColor="#5d6370" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Companion({
  e,
  size,
  state = 'idle',
  pedestal = false,
  className,
  style,
}: {
  e: Employee;
  size: number;
  /** idle: 2-3 px signature; active: lifted and lit; quiet: dimmed in the dock. */
  state?: 'idle' | 'active' | 'quiet' | 'working';
  pedestal?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const id = `tie-${e.id}-${size}`;
  return (
    <span
      className={`${c.companion} ${className ?? ''}`}
      data-idle={e.idle}
      data-state={state}
      data-tie={e.tie}
      style={{ '--size': `${size}px`, '--accent': e.accent, ...style } as CSSProperties}
      aria-hidden="true"
    >
      {pedestal && <span className={c.pedestal} />}
      <span className={c.halo} />
      <span className={c.body}>
        {/* the founder's glass X orb, unaltered */}
        <img className={c.orb} src={size > 120 ? '/homepage/s02/companion-orb-512.webp' : '/homepage/s02/companion-orb-256.webp'} alt="" draggable={false} />
        <span className={c.rim} />
        <span className={c.glint} />
        <span className={c.tint} />
        <Outfit tie={e.tie} id={id} />
      </span>
    </span>
  );
}
