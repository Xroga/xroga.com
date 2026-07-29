'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { CompanionAccent, CompanionCostume, CompanionMood, CompanionOperation } from '@/lib/companion';

interface CompanionRendererProps {
  mood: CompanionMood;
  operation: CompanionOperation;
  costume: CompanionCostume;
  accent: CompanionAccent;
  crownEnabled: boolean;
  mantleEnabled: boolean;
  className?: string;
  decorative?: boolean;
}
export function CompanionRenderer({
  mood,
  operation,
  costume,
  accent,
  crownEnabled,
  mantleEnabled,
  className,
  decorative = true,
}: CompanionRendererProps) {
  const rawId = useId();
  const id = rawId.replace(/:/g, '');
  const titleId = `${id}-title`;

  return (
    <svg
      viewBox="0 0 220 248"
      className={cn('xv-companion-renderer', className)}
      data-mood={mood}
      data-operation={operation}
      data-costume={costume}
      data-accent={accent}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-labelledby={decorative ? undefined : titleId}
    >
      {!decorative ? <title id={titleId}>Xroga companion, {mood}, {operation.replaceAll('_', ' ')}</title> : null}
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--xv-companion-highlight)" />
          <stop offset=".48" stopColor="var(--xv-companion-accent)" />
          <stop offset="1" stopColor="var(--xv-companion-shadow)" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="rgba(255,255,255,.9)" />
          <stop offset="1" stopColor="rgba(255,255,255,.14)" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <ellipse className="xv-companion-shadow" cx="110" cy="231" rx="60" ry="9" />

      {mantleEnabled ? (
        <path className="xv-companion-mantle" d="M46 116 22 192l35 10 20-45h66l20 45 35-10-24-76-32-20H78Z" />
      ) : null}

      <g className="xv-companion-arm xv-companion-arm--left">
        <path d="M68 121 37 144l11 17 34-17Z" fill={`url(#${id}-body)`} />
        <rect x="28" y="153" width="25" height="20" rx="9" fill="var(--xv-companion-accent)" />
      </g>
      <g className="xv-companion-arm xv-companion-arm--right">
        <path d="m152 121 31 23-11 17-34-17Z" fill={`url(#${id}-body)`} />
        <rect x="167" y="153" width="25" height="20" rx="9" fill="var(--xv-companion-accent)" />
      </g>

      <path className="xv-companion-body" d="M61 106c0-18 15-32 33-32h32c18 0 33 14 33 32v75c0 22-18 39-39 39h-20c-21 0-39-17-39-39Z" fill={`url(#${id}-body)`} />
      <path className="xv-companion-body-shine" d="M77 108c0-12 10-22 22-22h10c-18 32-18 87-5 122-16-2-27-15-27-31Z" fill={`url(#${id}-glass)`} opacity=".34" />

      <g className="xv-companion-head">
        <path d="M53 63c0-28 23-50 51-50h12c28 0 51 22 51 50v27c0 24-20 44-44 44H97c-24 0-44-20-44-44Z" fill={`url(#${id}-body)`} />
        <path d="M66 66c0-20 16-36 36-36h18c20 0 36 16 36 36v19c0 19-15 34-34 34H100c-19 0-34-15-34-34Z" fill="rgba(3,13,39,.78)" stroke="rgba(255,255,255,.28)" strokeWidth="2" />
        <g className="xv-companion-eyes" filter={`url(#${id}-glow)`}>
          <path className="xv-companion-eye xv-companion-eye--left" d="M83 75q10-9 20 0-10 10-20 0Z" fill="white" />
          <path className="xv-companion-eye xv-companion-eye--right" d="M117 75q10-9 20 0-10 10-20 0Z" fill="white" />
        </g>
        <path className="xv-companion-mouth" d="M98 98q12 8 24 0" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="3" strokeLinecap="round" />
      </g>

      {crownEnabled ? (
        <g className="xv-companion-crown" filter={`url(#${id}-glow)`}>
          <path d="m91 17 19 19 19-19 10 10-19 19 19 19-10 10-19-19-19 19-10-10 19-19-19-19Z" fill="var(--xv-companion-core)" opacity=".94" />
        </g>
      ) : null}

      <g className="xv-companion-core" filter={`url(#${id}-glow)`}>
        <circle cx="110" cy="154" r="31" fill="rgba(2,12,38,.72)" stroke="rgba(255,255,255,.36)" strokeWidth="2" />
        <image href="/brand/xroga-companion-core-192.webp" x="79" y="123" width="62" height="62" preserveAspectRatio="xMidYMid meet" />
      </g>

      <g className="xv-companion-legs">
        <path d="M78 204h27v30H72v-10Z" fill={`url(#${id}-body)`} />
        <path d="M115 204h27l6 20v10h-33Z" fill={`url(#${id}-body)`} />
      </g>
      <path className="xv-companion-scan" d="M48 122h124" stroke="var(--xv-companion-core)" strokeWidth="2" opacity="0" />
      <circle className="xv-companion-orbit" cx="110" cy="124" r="84" fill="none" stroke="var(--xv-companion-core)" strokeWidth="1" strokeDasharray="4 12" opacity="0" />
    </svg>
  );
}
